# Deposit Payments — Design Spec

**Date:** 2026-07-14
**Status:** Approved

---

## Overview

Wire up the deposit payment button on the customer estimate portal. When a customer approves an estimate that exceeds the org's deposit threshold, they can pay a deposit (e.g. 25% of total) via a Stripe-hosted checkout page. Money goes directly to the org's connected Stripe account. On payment, the job moves to `confirmed`, the customer gets a receipt email, and the office gets a notification.

---

## Architecture

### Stripe Connect

Each org connects their own Stripe account via Stripe Connect OAuth. Deposit payments are created as Checkout Sessions on the org's connected account. FlowSense never holds the money. A platform application fee can be added later with one line of code — out of scope for this spec.

### Flow

1. **Org onboarding** — admin clicks "Connect Stripe" in the onboarding checklist or Settings. FlowSense starts a Stripe Connect OAuth flow. On completion, `stripeConnectAccountId` and `stripeConnectOnboarded = true` are saved to the org.

2. **Customer pays deposit** — customer has approved an estimate. If `depositAmount > 0` and org has `stripeConnectOnboarded = true`, the "Pay Deposit" button is active. Customer taps it → frontend calls `POST /api/estimates/token/:token/deposit` → backend creates a Stripe Checkout Session on the org's connected account → returns `{ url }` → frontend redirects customer to Stripe hosted page.

3. **Payment completes** — Stripe fires `checkout.session.completed` webhook to FlowSense. Webhook handler verifies Stripe signature, finds the estimate by session metadata, sets `depositPaidAt`, updates job status to `confirmed`, sends receipt email to customer, sends notification to office.

4. **Customer return** — Stripe redirects customer back to `/customer/estimates/:token?deposit=paid` or `?deposit=cancelled`. Portal shows appropriate confirmation or retry message.

---

## Data Model

### Organization (additions)

```prisma
stripeConnectAccountId  String?
stripeConnectOnboarded  Boolean @default(false)
```

### Estimate (existing fields used, no migration needed)

- `depositAmount Float?` — computed at approval time, already stored
- `depositPaidAt DateTime?` — set when `checkout.session.completed` fires
- `stripePaymentIntentId String?` — reused to store the Checkout Session ID (`cs_...`). The column name is intentionally kept as-is to avoid an unnecessary migration; the field stores whichever Stripe ID is relevant to this estimate.

---

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/billing/connect` | `office` role | Start Stripe Connect OAuth — returns `{ url }` to redirect admin |
| GET | `/api/billing/connect/callback` | public | OAuth callback — saves `stripeConnectAccountId`, sets `stripeConnectOnboarded: true`, redirects to `/office/settings?connect=success` |
| POST | `/api/estimates/token/:token/deposit` | public | Create Checkout Session on org's connected account, return `{ url }` |
| POST | `/api/webhooks/stripe` | public | Existing webhook — handle new event `checkout.session.completed` |

---

## Backend Details

### GET /api/billing/connect

Requires `office` role (any office user may connect Stripe on behalf of the org). Creates a Stripe Connect OAuth URL with a signed state token to prevent CSRF:

```typescript
import crypto from "crypto"

// Sign a short-lived state token: "<organizationId>.<hmac>" using STRIPE_STATE_SECRET
function makeConnectState(organizationId: string): string {
  const hmac = crypto
    .createHmac("sha256", process.env.STRIPE_STATE_SECRET!)
    .update(organizationId)
    .digest("hex")
  return `${organizationId}.${hmac}`
}

const state = makeConnectState(req.user!.organizationId)
const url = stripe.oauth.authorizeUrl({
  response_type: "code",
  client_id: process.env.STRIPE_CONNECT_CLIENT_ID,
  scope: "read_write",
  state,
  redirect_uri: `${process.env.API_URL}/api/billing/connect/callback`,
})
res.json({ url })
```

### GET /api/billing/connect/callback

Public — Stripe redirects here after org completes OAuth. Validates state token before exchanging code:

```typescript
// Validate state: split on ".", verify HMAC
function verifyConnectState(state: string): string | null {
  const [organizationId, hmac] = state.split(".")
  if (!organizationId || !hmac) return null
  const expected = crypto
    .createHmac("sha256", process.env.STRIPE_STATE_SECRET!)
    .update(organizationId)
    .digest("hex")
  return crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(expected))
    ? organizationId
    : null
}

const { code, state, error } = req.query

// Handle OAuth error response from Stripe
if (error) {
  console.error("[Connect callback] Stripe OAuth error:", error)
  return res.redirect(`${process.env.FRONTEND_URL}/office/settings?connect=error`)
}

// Validate state token
const organizationId = verifyConnectState(state as string)
if (!organizationId) {
  console.error("[Connect callback] Invalid state token")
  return res.redirect(`${process.env.FRONTEND_URL}/office/settings?connect=error`)
}

// Exchange code for access token
let response
try {
  response = await stripe.oauth.token({ grant_type: "authorization_code", code: code as string })
} catch (err) {
  console.error("[Connect callback] Token exchange failed:", err)
  return res.redirect(`${process.env.FRONTEND_URL}/office/settings?connect=error`)
}

// Verify org exists before writing
const org = await prisma.organization.findUnique({ where: { id: organizationId } })
if (!org) {
  console.error("[Connect callback] Org not found:", organizationId)
  return res.redirect(`${process.env.FRONTEND_URL}/office/settings?connect=error`)
}

await prisma.organization.update({
  where: { id: organizationId },
  data: {
    stripeConnectAccountId: response.stripe_user_id,
    stripeConnectOnboarded: true,
  },
})
res.redirect(`${process.env.FRONTEND_URL}/office/settings?connect=success`)
```

Error paths:
- Stripe returns `?error=...` → log, redirect to `?connect=error`
- State missing or invalid HMAC → log, redirect to `?connect=error`
- `stripe.oauth.token` throws → log, redirect to `?connect=error`
- Org not found in DB → log, redirect to `?connect=error`

### POST /api/estimates/token/:token/deposit

Public. Guards:
- Estimate not found → 404
- Estimate not yet approved (status is not `approved`) → 400 ("Estimate has not been approved")
- Deposit already paid (`depositPaidAt` is set) → 409 ("Deposit already paid")
- `depositAmount` is null or zero → 400 ("No deposit required")
- Org not connected (`stripeConnectOnboarded: false`) → 503 ("Payments not configured for this business")
- Stripe not configured (no `STRIPE_SECRET_KEY`) → 503

Creates a Checkout Session on the org's connected account:

```typescript
const session = await stripe.checkout.sessions.create(
  {
    payment_method_types: ["card"],
    mode: "payment",
    line_items: [{
      price_data: {
        currency: "usd",
        product_data: { name: `Deposit — ${estimate.job.title}` },
        unit_amount: Math.round(estimate.depositAmount * 100),
      },
      quantity: 1,
    }],
    metadata: {
      estimateId: estimate.id,
      jobId: estimate.jobId,
      organizationId: estimate.organizationId,
    },
    success_url: `${process.env.FRONTEND_URL}/customer/estimates/${token}?deposit=paid`,
    cancel_url: `${process.env.FRONTEND_URL}/customer/estimates/${token}?deposit=cancelled`,
  },
  { stripeAccount: org.stripeConnectAccountId } // connected account
)

await prisma.estimate.update({
  where: { id: estimate.id },
  data: { stripePaymentIntentId: session.id },
})

res.json({ url: session.url })
```

### Webhook: checkout.session.completed

The existing webhook handler already verifies the Stripe signature via `stripe.webhooks.constructEvent` using the `STRIPE_WEBHOOK_SECRET` env var. No change to signature verification — add only a new case to the existing switch:

```typescript
case "checkout.session.completed": {
  const session = event.data.object as Stripe.Checkout.Session
  const { estimateId, jobId, organizationId } = session.metadata ?? {}

  // Not an estimate deposit session — skip
  if (!estimateId || !jobId) break

  const estimate = await prisma.estimate.findUnique({
    where: { id: estimateId },
    select: { id: true, depositPaidAt: true, organizationId: true },
  })

  // Not found, already paid (idempotent), or cross-tenant mismatch — skip
  if (!estimate) break
  if (estimate.depositPaidAt) break
  if (estimate.organizationId !== organizationId) {
    console.error("[Webhook] Org mismatch on estimate", estimateId)
    break
  }

  await prisma.estimate.update({
    where: { id: estimateId },
    data: { depositPaidAt: new Date() },
  })

  await prisma.job.update({
    where: { id: jobId },
    data: { status: "confirmed" },
  })

  // Fire-and-forget; failures are logged, not retried
  sendDepositReceiptEmail(estimateId).catch(console.error)
  notifyOfficeDepositReceived(estimateId).catch(console.error)
  break
}
```

### New email: sendDepositReceiptEmail

In `backend/src/services/email.ts`, add:

```typescript
export async function sendDepositReceiptEmail(estimateId: string): Promise<void>
```

Loads estimate + job + customer, sends customer a receipt with:
- Amount paid
- Job title
- "Work is confirmed — your technician will be in touch"

### New notification: notifyOfficeDepositReceived

In `backend/src/services/notifications.ts` or `org-notifications.ts`, add:

```typescript
export async function notifyOfficeDepositReceived(estimateId: string): Promise<void>
```

Sends office users a notification: "Deposit received — [Customer name] paid $[amount] for [job title]. Job is confirmed."

Fire-and-forget failures are swallowed after logging. Operations team monitors logs.

---

## Environment Variables (additions)

```
STRIPE_CONNECT_CLIENT_ID=ca_...       # from Stripe Dashboard → Connect settings
STRIPE_STATE_SECRET=<random-secret>   # used to HMAC-sign the OAuth state token
API_URL=https://api.yourdomain.com    # used for OAuth callback redirect
FRONTEND_URL=https://app.yourdomain.com  # already used elsewhere in the codebase
```

Note: `FRONTEND_URL` is already present in the codebase. `STRIPE_STATE_SECRET` is new — generate with `openssl rand -hex 32`.

---

## Frontend Changes

### estimate-approval.tsx

The "Pay Deposit" button currently does nothing. Wire it up:

```typescript
async function handlePayDeposit() {
  setPayingDeposit(true)
  try {
    const res = await fetch(`/api/estimates/token/${token}/deposit`, { method: "POST" })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setError(body.error ?? "Payment setup failed. Please try again.")
      return
    }
    const { url } = await res.json()
    window.location.href = url
  } finally {
    setPayingDeposit(false)
  }
}
```

The button needs a `payingDeposit` boolean state to show a loading indicator while waiting for the redirect URL.

### CustomerEstimate.tsx

Read `?deposit=paid` or `?deposit=cancelled` from URL params on mount using `new URLSearchParams(window.location.search)`:
- `deposit=paid` → show "Deposit received — your appointment is confirmed" banner (render this on the done screen or above the already-approved view)
- `deposit=cancelled` → show "Payment was cancelled — you can try again below" inline alert, re-display the deposit prompt

### Onboarding checklist

Add a new onboarding step: "Connect Stripe to accept deposits" — calls `GET /api/billing/connect` and redirects admin to the returned OAuth URL. Step is marked complete when `org.stripeConnectOnboarded === true`.

### Office settings

Read `?connect=success` or `?connect=error` from URL params on mount and display a toast accordingly. Show a "Stripe Connected ✓" badge in Settings when `stripeConnectOnboarded` is true; show a "Connect Stripe" button when false.

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Org not connected to Stripe | "Pay Deposit" button hidden on customer portal |
| Estimate not yet approved | Deposit endpoint returns 400; button only shown post-approval |
| Deposit already paid | Deposit endpoint returns 409; customer sees "already paid" banner |
| Checkout session expired / cancelled | Customer returned with `?deposit=cancelled`, retry prompt shown |
| Stripe not configured | Deposit button hidden |
| Webhook duplicate (already paid) | Skip silently — idempotency check on `depositPaidAt` |
| Webhook cross-tenant mismatch | Log and break; return 200 to Stripe to prevent retries |
| Connect OAuth error (invalid code) | Redirect to `?connect=error`, toast shown in Settings |
| Connect state token invalid (CSRF attempt) | Log and redirect to `?connect=error` |
| Connect onboarding incomplete | `stripeConnectOnboarded` stays false; prompt shown in Settings |
| `handlePayDeposit` non-2xx response | Show inline error message; do not redirect |

---

## Out of Scope

- Platform application fee
- Refunds
- Partial deposits
- Multiple deposits per estimate
- Payout scheduling
- Stripe Connect dashboard link for orgs
- Restricting Connect to owner-only role (any `office` user may connect)
