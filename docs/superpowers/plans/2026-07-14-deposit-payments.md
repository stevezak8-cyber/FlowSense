# Deposit Payments Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire up Stripe Connect OAuth for orgs and Checkout Sessions for customer deposit payments on approved estimates.

**Architecture:** Orgs connect their own Stripe account via OAuth (stored as `stripeConnectAccountId` on Organization). When a customer approves a high-value estimate, they can pay a deposit via a Stripe-hosted Checkout Session created on the org's connected account. A webhook on `checkout.session.completed` confirms the job and notifies the office.

**Tech Stack:** Stripe (Connect OAuth + Checkout Sessions), Node/Express, Prisma/PostgreSQL, React/TypeScript, Vitest + Supertest

**Spec:** `docs/superpowers/specs/2026-07-14-deposit-payments-design.md`

---

## Chunk 1: Schema + Connect routes + tests

### Task 1: Schema migration — Add Connect fields to Organization

**Files:**
- Modify: `backend/prisma/schema.prisma`

- [ ] **Step 1: Add fields to Organization model**

Open `backend/prisma/schema.prisma`. In the `Organization` model, after `onboardingDismissed Boolean @default(false)`, add:

```prisma
stripeConnectAccountId  String?
stripeConnectOnboarded  Boolean @default(false)
```

- [ ] **Step 2: Run migration**

```bash
cd backend && npx prisma migrate dev --name add_stripe_connect_fields
```

Expected: New migration file created in `prisma/migrations/`, Prisma Client regenerated.

- [ ] **Step 3: Run test suite to confirm nothing broken**

```bash
cd backend && npm test -- --run
```

Expected: All existing tests pass.

- [ ] **Step 4: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/
git commit -m "feat: add stripeConnectAccountId and stripeConnectOnboarded to Organization"
```

---

### Task 2: Connect routes (GET /api/billing/connect + callback) + tests

**Files:**
- Modify: `backend/src/routes/billing.ts`
- Create: `backend/src/__tests__/billing-connect.test.ts`

The existing `billing.ts` handles `/portal` and `/upgrade`. Add two new routes to the same file.

**Context:**
- `stripe` is imported from `../services/stripe.js` — it's null when `STRIPE_SECRET_KEY` is not set
- Auth middleware has already run; `req.user` is available (type `AuthRequest` from `../middleware/types.js`)
- `prisma` is imported from `../lib/prisma.js`
- `process.env.STRIPE_STATE_SECRET` must be used to HMAC-sign the state token
- `process.env.STRIPE_CONNECT_CLIENT_ID` is the Connect app client ID
- `process.env.API_URL` is the backend base URL (e.g. `https://api.example.com`)
- `process.env.FRONTEND_URL` is the frontend base URL (e.g. `https://app.example.com`)
- The callback is a browser redirect — use `res.redirect()`, not `res.json()`

- [ ] **Step 1: Write failing tests**

Create `backend/src/__tests__/billing-connect.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest"
import express from "express"
import request from "supertest"

// Mock stripe service
vi.mock("../services/stripe.js", () => ({
  stripe: null,
  getPriceId: vi.fn(),
}))

// Mock prisma
vi.mock("../lib/prisma.js", () => ({
  prisma: {
    organization: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}))

import * as stripeModule from "../services/stripe.js"
import { prisma } from "../lib/prisma.js"
import { billingRouter } from "../routes/billing.js"

function buildApp(role = "office") {
  const app = express()
  app.use(express.json())
  app.use((req: any, _res: any, next: any) => {
    req.user = { id: "user-1", organizationId: "org-1", role }
    next()
  })
  app.use("/billing", billingRouter)
  return app
}

describe("GET /billing/connect", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
  })

  it("returns 503 when stripe is not configured", async () => {
    ;(stripeModule as any).stripe = null
    const res = await request(buildApp()).get("/billing/connect")
    expect(res.status).toBe(503)
    expect(res.body.error).toMatch(/not configured/i)
  })

  it("returns 503 when STRIPE_CONNECT_CLIENT_ID is missing", async () => {
    ;(stripeModule as any).stripe = { oauth: { authorizeUrl: vi.fn() } }
    vi.stubEnv("STRIPE_CONNECT_CLIENT_ID", "")
    vi.stubEnv("STRIPE_STATE_SECRET", "testsecret")
    vi.stubEnv("API_URL", "http://api.test")
    const res = await request(buildApp()).get("/billing/connect")
    expect(res.status).toBe(503)
  })

  it("returns 503 when STRIPE_STATE_SECRET is missing", async () => {
    ;(stripeModule as any).stripe = { oauth: { authorizeUrl: vi.fn() } }
    vi.stubEnv("STRIPE_CONNECT_CLIENT_ID", "ca_test")
    vi.stubEnv("STRIPE_STATE_SECRET", "")
    vi.stubEnv("API_URL", "http://api.test")
    const res = await request(buildApp()).get("/billing/connect")
    expect(res.status).toBe(503)
  })

  it("returns url when fully configured", async () => {
    vi.stubEnv("STRIPE_CONNECT_CLIENT_ID", "ca_test")
    vi.stubEnv("STRIPE_STATE_SECRET", "testsecret")
    vi.stubEnv("API_URL", "http://api.test")
    const mockAuthorize = vi.fn().mockReturnValue("https://connect.stripe.com/oauth/authorize?...")
    ;(stripeModule as any).stripe = { oauth: { authorizeUrl: mockAuthorize } }
    const res = await request(buildApp()).get("/billing/connect")
    expect(res.status).toBe(200)
    expect(res.body.url).toBeTruthy()
    expect(mockAuthorize).toHaveBeenCalledWith(
      expect.objectContaining({ client_id: "ca_test", scope: "read_write" })
    )
  })
})

describe("GET /billing/connect/callback", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
  })

  function signState(orgId: string, secret: string): string {
    const crypto = require("crypto")
    const hmac = crypto.createHmac("sha256", secret).update(orgId).digest("hex")
    return `${orgId}.${hmac}`
  }

  it("redirects to error when stripe error param is present", async () => {
    ;(stripeModule as any).stripe = { oauth: { token: vi.fn() } }
    vi.stubEnv("STRIPE_STATE_SECRET", "testsecret")
    vi.stubEnv("FRONTEND_URL", "http://app.test")
    const res = await request(buildApp()).get("/billing/connect/callback?error=access_denied&state=bad")
    expect(res.status).toBe(302)
    expect(res.headers.location).toMatch(/connect=error/)
  })

  it("redirects to error when state is invalid", async () => {
    ;(stripeModule as any).stripe = { oauth: { token: vi.fn() } }
    vi.stubEnv("STRIPE_STATE_SECRET", "testsecret")
    vi.stubEnv("FRONTEND_URL", "http://app.test")
    const res = await request(buildApp()).get("/billing/connect/callback?code=ac_test&state=org-1.badsig")
    expect(res.status).toBe(302)
    expect(res.headers.location).toMatch(/connect=error/)
  })

  it("redirects to error when token exchange fails", async () => {
    vi.stubEnv("STRIPE_STATE_SECRET", "testsecret")
    vi.stubEnv("FRONTEND_URL", "http://app.test")
    const mockToken = vi.fn().mockRejectedValue(new Error("invalid code"))
    ;(stripeModule as any).stripe = { oauth: { token: mockToken } }
    ;(prisma.organization.findUnique as any).mockResolvedValue({ id: "org-1" })
    const state = signState("org-1", "testsecret")
    const res = await request(buildApp()).get(`/billing/connect/callback?code=ac_test&state=${state}`)
    expect(res.status).toBe(302)
    expect(res.headers.location).toMatch(/connect=error/)
  })

  it("saves Connect account and redirects to success", async () => {
    vi.stubEnv("STRIPE_STATE_SECRET", "testsecret")
    vi.stubEnv("FRONTEND_URL", "http://app.test")
    const mockToken = vi.fn().mockResolvedValue({ stripe_user_id: "acct_test" })
    ;(stripeModule as any).stripe = { oauth: { token: mockToken } }
    ;(prisma.organization.findUnique as any).mockResolvedValue({ id: "org-1" })
    ;(prisma.organization.update as any).mockResolvedValue({})
    const state = signState("org-1", "testsecret")
    const res = await request(buildApp()).get(`/billing/connect/callback?code=ac_test&state=${state}`)
    expect(res.status).toBe(302)
    expect(res.headers.location).toMatch(/connect=success/)
    expect(prisma.organization.update).toHaveBeenCalledWith({
      where: { id: "org-1" },
      data: { stripeConnectAccountId: "acct_test", stripeConnectOnboarded: true },
    })
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd backend && npm test -- --run billing-connect
```

Expected: FAIL (routes don't exist yet).

- [ ] **Step 3: Implement the routes in billing.ts**

Add to the top of `backend/src/routes/billing.ts` (after existing imports):

```typescript
import crypto from "crypto"
```

Then add these two routes at the bottom of the file:

```typescript
// GET /billing/connect — start Stripe Connect OAuth
billingRouter.get("/connect", async (req, res) => {
  if (!stripe) return res.status(503).json({ error: "Stripe not configured" })

  const clientId = process.env.STRIPE_CONNECT_CLIENT_ID
  const stateSecret = process.env.STRIPE_STATE_SECRET
  const apiUrl = process.env.API_URL

  if (!clientId || !stateSecret || !apiUrl) {
    return res.status(503).json({ error: "Stripe Connect not configured" })
  }

  const organizationId = (req as AuthRequest).user!.organizationId
  const hmac = crypto.createHmac("sha256", stateSecret).update(organizationId).digest("hex")
  const state = `${organizationId}.${hmac}`

  const url = stripe.oauth.authorizeUrl({
    response_type: "code",
    client_id: clientId,
    scope: "read_write",
    state,
    redirect_uri: `${apiUrl}/api/billing/connect/callback`,
  })

  return res.json({ url })
})

// GET /billing/connect/callback — handle Stripe Connect OAuth callback
billingRouter.get("/connect/callback", async (req, res) => {
  const frontendUrl = process.env.FRONTEND_URL ?? ""
  const errorRedirect = `${frontendUrl}/office/settings?connect=error`
  const stateSecret = process.env.STRIPE_STATE_SECRET

  const { code, state, error } = req.query as Record<string, string>

  if (error) {
    console.error("[Connect callback] Stripe OAuth error:", error)
    return res.redirect(errorRedirect)
  }

  if (!stateSecret || !state) {
    console.error("[Connect callback] Missing state or secret")
    return res.redirect(errorRedirect)
  }

  // Validate HMAC state token
  const dotIndex = state.lastIndexOf(".")
  if (dotIndex === -1) {
    console.error("[Connect callback] Malformed state token")
    return res.redirect(errorRedirect)
  }
  const organizationId = state.slice(0, dotIndex)
  const receivedHmac = state.slice(dotIndex + 1)
  const expectedHmac = crypto.createHmac("sha256", stateSecret).update(organizationId).digest("hex")

  let valid: boolean
  try {
    valid = crypto.timingSafeEqual(Buffer.from(receivedHmac, "hex"), Buffer.from(expectedHmac, "hex"))
  } catch {
    valid = false
  }
  if (!valid) {
    console.error("[Connect callback] Invalid state HMAC")
    return res.redirect(errorRedirect)
  }

  // Verify org exists
  const org = await prisma.organization.findUnique({ where: { id: organizationId } })
  if (!org) {
    console.error("[Connect callback] Org not found:", organizationId)
    return res.redirect(errorRedirect)
  }

  if (!stripe) {
    console.error("[Connect callback] Stripe not configured")
    return res.redirect(errorRedirect)
  }

  // Exchange code for access token
  let response: { stripe_user_id: string }
  try {
    response = await stripe.oauth.token({ grant_type: "authorization_code", code }) as { stripe_user_id: string }
  } catch (err) {
    console.error("[Connect callback] Token exchange failed:", err)
    return res.redirect(errorRedirect)
  }

  await prisma.organization.update({
    where: { id: organizationId },
    data: {
      stripeConnectAccountId: response.stripe_user_id,
      stripeConnectOnboarded: true,
    },
  })

  return res.redirect(`${frontendUrl}/office/settings?connect=success`)
})
```

- [ ] **Step 4: Run tests**

```bash
cd backend && npm test -- --run billing-connect
```

Expected: All tests pass.

- [ ] **Step 5: Run full suite**

```bash
cd backend && npm test -- --run
```

Expected: All existing tests still pass.

- [ ] **Step 6: Mount callback publicly in index.ts**

The `/api/billing/connect/callback` route is a browser redirect from Stripe — it has no user session. The existing `billingRouter` is mounted under `requireAuth` (`app.use("/api/billing", apiLimiter, requireAuth, billingRouter)`), which would reject the callback with 401.

Fix: export the callback handler as a named export and mount it publicly in `backend/src/index.ts` BEFORE the `requireAuth` billing mount.

In `backend/src/routes/billing.ts`, extract the callback into a named handler AND also keep it in the router (for the existing test harness). Actually, the cleaner approach is: in `index.ts`, add a public mount for the callback path before the protected billing mount.

Two changes are needed in `backend/src/index.ts`:

**1. At the top of the file, alongside the existing billing import (around line 37):**

```typescript
import { billingRouter, billingConnectCallbackHandler } from "./routes/billing.js"
```

Replace the existing `import { billingRouter }` line with this.

**2. Before the protected billing mount (around line 83), add the public callback mount:**

```typescript
// Public Stripe Connect callback — no auth (Stripe browser redirect from OAuth)
app.use("/api/billing/connect/callback", apiLimiter, billingConnectCallbackHandler)
// Billing routes (auth required, no subscription check)
app.use("/api/billing", apiLimiter, requireAuth, billingRouter)
```

The callback mount MUST appear before `app.use("/api/billing", ...)` — Express matches routes in registration order.

And in `backend/src/routes/billing.ts`, export the callback as a standalone handler:

```typescript
import { type RequestHandler } from "express"

export const billingConnectCallbackHandler: RequestHandler = async (req, res) => {
  // ... exact same body as the GET /connect/callback route handler
}

// Also register in the router for consistency (won't be hit in prod due to public mount above)
billingRouter.get("/connect/callback", billingConnectCallbackHandler)
```

The public mount in `index.ts` intercepts the request before it reaches the `requireAuth` middleware. The router registration keeps tests that use the router directly working without changes.

**Important:** Place the `app.use("/api/billing/connect/callback", ...)` line in `index.ts` BEFORE `app.use("/api/billing", ...)`. Express matches routes in registration order.

- [ ] **Step 7: Run tests**

```bash
cd backend && npm test -- --run billing-connect
```

Expected: All tests pass.

- [ ] **Step 8: Run full suite**

```bash
cd backend && npm test -- --run
```

Expected: All existing tests still pass.

- [ ] **Step 9: Commit**

```bash
git add backend/src/routes/billing.ts backend/src/__tests__/billing-connect.test.ts backend/src/index.ts
git commit -m "feat: add Stripe Connect OAuth routes with HMAC state validation"
```

---

### Task 3: Expose Connect fields in organizations API + Update organizations.ts

**Files:**
- Modify: `backend/src/routes/organizations.ts`

The GET `/api/organizations/me` and PATCH `/api/organizations/me` handlers have explicit `select` blocks. The two new Connect fields must be added there so the frontend can read `stripeConnectOnboarded`.

- [ ] **Step 1: Add fields to select blocks**

In `backend/src/routes/organizations.ts`, find both `select` blocks (one in GET, one in PATCH) and add:

```typescript
stripeConnectAccountId: true,
stripeConnectOnboarded: true,
```

Both blocks need this addition. The GET handler select is around the `prisma.organization.findUnique` call; the PATCH handler select is around the `prisma.organization.update` call.

- [ ] **Step 2: Run tests**

```bash
cd backend && npm test -- --run
```

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add backend/src/routes/organizations.ts
git commit -m "feat: expose stripeConnectAccountId and stripeConnectOnboarded in org API"
```

---

## Chunk 2: Deposit endpoint + webhook

### Task 4: Update POST /api/estimates/token/:token/deposit + tests

**Files:**
- Modify: `backend/src/routes/estimates.ts`
- Modify: `backend/src/__tests__/estimates.test.ts`

Currently `POST /api/estimates/token/:token/deposit` returns `{ depositAmountCents }`. Change it to create a Stripe Checkout Session on the org's connected account and return `{ url }`.

**Context:**
- The route is in `publicEstimatesRouter` (no auth middleware) in `backend/src/routes/estimates.ts`
- `stripe` singleton is imported from `../services/stripe.js`
- Estimate's `status` field is `"draft" | "sent" | "approved"` — only `"approved"` may proceed
- If `depositPaidAt` is already set → 409
- `depositAmount` is stored as a float in dollars; Stripe expects cents (integer)
- `process.env.FRONTEND_URL` is used for success/cancel URLs
- The Checkout Session is created with `{ stripeAccount: org.stripeConnectAccountId }` as the second argument

- [ ] **Step 1: Write failing tests**

Add to the existing `backend/src/__tests__/estimates.test.ts` file (find the section describing the deposit endpoint and update those tests):

Find the existing deposit test block. It currently tests for `{ depositAmountCents }`. Replace those tests with:

```typescript
describe("POST /token/:token/deposit", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
  })

  it("returns 404 when estimate not found", async () => {
    ;(prisma.estimate.findUnique as any).mockResolvedValue(null)
    const res = await request(publicApp).post("/token/bad-token/deposit")
    expect(res.status).toBe(404)
  })

  it("returns 400 when estimate is not approved", async () => {
    ;(prisma.estimate.findUnique as any).mockResolvedValue({
      id: "est-1", status: "sent", depositPaidAt: null, depositAmount: 500,
      jobId: "job-1", organizationId: "org-1",
      job: { title: "AC Repair" },
      organization: { stripeConnectAccountId: "acct_test", stripeConnectOnboarded: true },
    })
    const res = await request(publicApp).post("/token/tok-1/deposit")
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/not.*approved/i)
  })

  it("returns 409 when deposit already paid", async () => {
    ;(prisma.estimate.findUnique as any).mockResolvedValue({
      id: "est-1", status: "approved", depositPaidAt: new Date(),
      depositAmount: 500, jobId: "job-1", organizationId: "org-1",
      job: { title: "AC Repair" },
      organization: { stripeConnectAccountId: "acct_test", stripeConnectOnboarded: true },
    })
    const res = await request(publicApp).post("/token/tok-1/deposit")
    expect(res.status).toBe(409)
    expect(res.body.error).toMatch(/already paid/i)
  })

  it("returns 400 when no deposit amount", async () => {
    ;(prisma.estimate.findUnique as any).mockResolvedValue({
      id: "est-1", status: "approved", depositPaidAt: null,
      depositAmount: null, jobId: "job-1", organizationId: "org-1",
      job: { title: "AC Repair" },
      organization: { stripeConnectAccountId: "acct_test", stripeConnectOnboarded: true },
    })
    const res = await request(publicApp).post("/token/tok-1/deposit")
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/no deposit required/i)
  })

  it("returns 503 when org not connected to Stripe", async () => {
    ;(prisma.estimate.findUnique as any).mockResolvedValue({
      id: "est-1", status: "approved", depositPaidAt: null,
      depositAmount: 500, jobId: "job-1", organizationId: "org-1",
      job: { title: "AC Repair" },
      organization: { stripeConnectAccountId: null, stripeConnectOnboarded: false },
    })
    const res = await request(publicApp).post("/token/tok-1/deposit")
    expect(res.status).toBe(503)
    expect(res.body.error).toMatch(/not configured/i)
  })

  it("returns 503 when stripe singleton is null", async () => {
    ;(stripeModule as any).stripe = null
    ;(prisma.estimate.findUnique as any).mockResolvedValue({
      id: "est-1", status: "approved", depositPaidAt: null,
      depositAmount: 500, jobId: "job-1", organizationId: "org-1",
      job: { title: "AC Repair" },
      organization: { stripeConnectAccountId: "acct_test", stripeConnectOnboarded: true },
    })
    const res = await request(publicApp).post("/token/tok-1/deposit")
    expect(res.status).toBe(503)
  })

  it("returns url on success", async () => {
    vi.stubEnv("FRONTEND_URL", "http://app.test")
    ;(prisma.estimate.findUnique as any).mockResolvedValue({
      id: "est-1", status: "approved", depositPaidAt: null,
      depositAmount: 150, jobId: "job-1", organizationId: "org-1",
      job: { title: "AC Repair" },
      organization: { stripeConnectAccountId: "acct_test", stripeConnectOnboarded: true },
    })
    const mockCreate = vi.fn().mockResolvedValue({ id: "cs_test", url: "https://checkout.stripe.com/pay/cs_test" })
    ;(stripeModule as any).stripe = { checkout: { sessions: { create: mockCreate } } }
    ;(prisma.estimate.update as any).mockResolvedValue({})
    const res = await request(publicApp).post("/token/tok-1/deposit")
    expect(res.status).toBe(200)
    expect(res.body.url).toBe("https://checkout.stripe.com/pay/cs_test")
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "payment",
        line_items: expect.arrayContaining([
          expect.objectContaining({ quantity: 1 }),
        ]),
        metadata: expect.objectContaining({ estimateId: "est-1" }),
      }),
      { stripeAccount: "acct_test" }
    )
  })
})
```

- [ ] **Step 2: Run to confirm failures**

```bash
cd backend && npm test -- --run estimates
```

Expected: the deposit tests fail.

- [ ] **Step 3: Update the deposit route in estimates.ts**

Find `publicEstimatesRouter.post("/:token/deposit", ...)` in `backend/src/routes/estimates.ts`.

Replace its body with:

```typescript
publicEstimatesRouter.post("/:token/deposit", async (req, res) => {
  const { token } = req.params

  const estimate = await prisma.estimate.findUnique({
    where: { token },
    include: {
      job: { select: { title: true } },
      organization: { select: { stripeConnectAccountId: true, stripeConnectOnboarded: true } },
    },
  })

  if (!estimate) return res.status(404).json({ error: "Estimate not found" })
  if (estimate.status !== "approved") return res.status(400).json({ error: "Estimate has not been approved" })
  if (estimate.depositPaidAt) return res.status(409).json({ error: "Deposit already paid" })
  if (!estimate.depositAmount) return res.status(400).json({ error: "No deposit required" })
  if (!estimate.organization.stripeConnectOnboarded || !estimate.organization.stripeConnectAccountId) {
    return res.status(503).json({ error: "Payments not configured for this business" })
  }
  if (!stripe) return res.status(503).json({ error: "Stripe not configured" })

  const frontendUrl = process.env.FRONTEND_URL ?? ""
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
      success_url: `${frontendUrl}/customer/estimates/${token}?deposit=paid`,
      cancel_url: `${frontendUrl}/customer/estimates/${token}?deposit=cancelled`,
    },
    { stripeAccount: estimate.organization.stripeConnectAccountId }
  )

  await prisma.estimate.update({
    where: { id: estimate.id },
    data: { stripePaymentIntentId: session.id },
  })

  return res.json({ url: session.url })
})
```

Also add the `stripe` import at the top of `estimates.ts` if not already present:

```typescript
import { stripe } from "../services/stripe.js"
```

- [ ] **Step 4: Run tests**

```bash
cd backend && npm test -- --run estimates
```

Expected: All tests pass.

- [ ] **Step 5: Run full suite**

```bash
cd backend && npm test -- --run
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/estimates.ts backend/src/__tests__/estimates.test.ts
git commit -m "feat: update deposit endpoint to create Stripe Checkout Session"
```

---

### Task 5: Webhook — handle checkout.session.completed for estimate deposits

**Files:**
- Modify: `backend/src/routes/webhooks.ts`
- Modify: `backend/src/__tests__/webhooks-billing.test.ts`

The webhook handler already has a `checkout.session.completed` case that handles invoices (checked via `invoiceId` in metadata). Extend it to also handle estimate deposits (checked via `estimateId` in metadata). Both can coexist in the same case.

- [ ] **Step 1: Write failing tests**

Add a new `describe` block to `backend/src/__tests__/webhooks-billing.test.ts`:

```typescript
describe("checkout.session.completed — estimate deposit", () => {
  function buildDepositEvent(metadata: Record<string, string>, paid = false) {
    return {
      type: "checkout.session.completed",
      data: {
        object: {
          metadata,
          payment_status: "paid",
        },
      },
    }
  }

  beforeEach(() => vi.clearAllMocks())

  it("skips estimate path when estimateId is absent from metadata", async () => {
    // Use an event with NO metadata at all — avoids triggering the invoice path
    const event = {
      type: "checkout.session.completed",
      data: { object: { metadata: {}, payment_status: "paid" } },
    }
    ;(stripeModule as any).stripe = { webhooks: { constructEvent: vi.fn().mockReturnValue(event) } }
    ;(prisma.estimate.findUnique as any).mockResolvedValue(null)
    const res = await request(app)
      .post("/stripe")
      .set("stripe-signature", "sig")
      .set("content-type", "application/json")
      .send(Buffer.from(JSON.stringify(event)))
    expect(res.status).toBe(200)
    expect(prisma.estimate.findUnique).not.toHaveBeenCalled()
  })

  it("skips when estimate not found", async () => {
    const event = buildDepositEvent({ estimateId: "est-1", jobId: "job-1", organizationId: "org-1" })
    ;(stripeModule as any).stripe = { webhooks: { constructEvent: vi.fn().mockReturnValue(event) } }
    ;(prisma.estimate.findUnique as any).mockResolvedValue(null)
    const res = await request(app)
      .post("/stripe")
      .set("stripe-signature", "sig")
      .set("content-type", "application/json")
      .send(Buffer.from(JSON.stringify(event)))
    expect(res.status).toBe(200)
    expect(prisma.estimate.update).not.toHaveBeenCalled()
  })

  it("skips when deposit already paid (idempotent)", async () => {
    const event = buildDepositEvent({ estimateId: "est-1", jobId: "job-1", organizationId: "org-1" })
    ;(stripeModule as any).stripe = { webhooks: { constructEvent: vi.fn().mockReturnValue(event) } }
    ;(prisma.estimate.findUnique as any).mockResolvedValue({
      id: "est-1", depositPaidAt: new Date(), organizationId: "org-1",
    })
    const res = await request(app)
      .post("/stripe")
      .set("stripe-signature", "sig")
      .set("content-type", "application/json")
      .send(Buffer.from(JSON.stringify(event)))
    expect(res.status).toBe(200)
    expect(prisma.estimate.update).not.toHaveBeenCalled()
  })

  it("marks deposit paid and updates job to confirmed", async () => {
    const event = buildDepositEvent({ estimateId: "est-1", jobId: "job-1", organizationId: "org-1" })
    ;(stripeModule as any).stripe = { webhooks: { constructEvent: vi.fn().mockReturnValue(event) } }
    ;(prisma.estimate.findUnique as any).mockResolvedValue({
      id: "est-1", depositPaidAt: null, organizationId: "org-1",
    })
    ;(prisma.estimate.update as any).mockResolvedValue({})
    ;(prisma.job.update as any).mockResolvedValue({})
    const res = await request(app)
      .post("/stripe")
      .set("stripe-signature", "sig")
      .set("content-type", "application/json")
      .send(Buffer.from(JSON.stringify(event)))
    expect(res.status).toBe(200)
    expect(prisma.estimate.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "est-1" },
        data: expect.objectContaining({ depositPaidAt: expect.any(Date) }),
      })
    )
    expect(prisma.job.update).toHaveBeenCalledWith({
      where: { id: "job-1" },
      data: { status: "confirmed" },
    })
  })

  it("skips and logs when org ID mismatches (cross-tenant)", async () => {
    const event = buildDepositEvent({ estimateId: "est-1", jobId: "job-1", organizationId: "org-ATTACKER" })
    ;(stripeModule as any).stripe = { webhooks: { constructEvent: vi.fn().mockReturnValue(event) } }
    ;(prisma.estimate.findUnique as any).mockResolvedValue({
      id: "est-1", depositPaidAt: null, organizationId: "org-VICTIM",
    })
    const res = await request(app)
      .post("/stripe")
      .set("stripe-signature", "sig")
      .set("content-type", "application/json")
      .send(Buffer.from(JSON.stringify(event)))
    expect(res.status).toBe(200)
    expect(prisma.estimate.update).not.toHaveBeenCalled()
  })
})
```

Note: The test file likely already imports `prisma`, `stripeModule`, `request`, and `app`. Confirm those are at the top of the existing file and don't need re-importing. Also add `prisma.estimate` and `prisma.job` mocks to the existing `vi.mock("../lib/prisma.js", ...)` call at the top of the file if they aren't already there.

- [ ] **Step 2: Update the prisma mock at the top of webhooks-billing.test.ts**

In the existing `vi.mock("../lib/prisma.js", ...)` block, ensure these are included:

```typescript
estimate: {
  findUnique: vi.fn(),
  update: vi.fn(),
},
job: {
  update: vi.fn(),
},
```

- [ ] **Step 3: Run tests to confirm they fail**

```bash
cd backend && npm test -- --run webhooks-billing
```

Expected: New deposit tests fail.

- [ ] **Step 4: Extend the webhook handler**

In `backend/src/routes/webhooks.ts`, find the `case "checkout.session.completed"` block. It currently handles `invoiceId` in metadata. Extend it to also check for `estimateId`:

```typescript
case "checkout.session.completed": {
  const session = event.data.object as Stripe.Checkout.Session
  const { invoiceId, estimateId, jobId, organizationId } = session.metadata ?? {}

  // Handle invoice payment (existing path)
  if (invoiceId) {
    try {
      await prisma.invoice.update({
        where: { id: invoiceId },
        data: { status: "paid" },
      })
      console.log(`Invoice ${invoiceId} marked as paid via Stripe`)
    } catch (err) {
      console.error(`Failed to mark invoice ${invoiceId} as paid:`, err)
      return res.status(500).json({ error: "Failed to update invoice" })
    }
  }

  // Handle estimate deposit (new path)
  if (estimateId && jobId) {
    const estimate = await prisma.estimate.findUnique({
      where: { id: estimateId },
      select: { id: true, depositPaidAt: true, organizationId: true },
    })

    if (estimate && !estimate.depositPaidAt) {
      if (estimate.organizationId !== organizationId) {
        console.error("[Webhook] Org mismatch on estimate deposit", estimateId)
      } else {
        await prisma.estimate.update({
          where: { id: estimateId },
          data: { depositPaidAt: new Date() },
        })
        await prisma.job.update({
          where: { id: jobId },
          data: { status: "confirmed" },
        })
        // Fire-and-forget
        sendDepositReceiptEmail(estimateId).catch((err: unknown) =>
          console.error("[Webhook] Receipt email failed:", err)
        )
        notifyOfficeDepositReceived(estimateId).catch((err: unknown) =>
          console.error("[Webhook] Office notification failed:", err)
        )
      }
    }
  }

  break
}
```

Also add imports at the top of `webhooks.ts`:

```typescript
import { sendDepositReceiptEmail } from "../services/email.js"
import { notifyOfficeDepositReceived } from "../services/org-notifications.js"
```

(These functions don't exist yet — they will be added in Task 6. TypeScript will error until then; that's expected.)

- [ ] **Step 5: Run tests**

```bash
cd backend && npm test -- --run webhooks-billing
```

Expected: Deposit tests pass (ignore TypeScript import errors for now — they resolve in Task 6).

- [ ] **Step 6: Run full suite**

```bash
cd backend && npm test -- --run
```

- [ ] **Step 7: Commit**

```bash
git add backend/src/routes/webhooks.ts backend/src/__tests__/webhooks-billing.test.ts
git commit -m "feat: handle estimate deposit in checkout.session.completed webhook"
```

---

### Task 6: sendDepositReceiptEmail + notifyOfficeDepositReceived

**Files:**
- Modify: `backend/src/services/email.ts`
- Modify: `backend/src/services/org-notifications.ts`

- [ ] **Step 1: Add sendDepositReceiptEmail to email.ts**

First, add `import { prisma } from "../lib/prisma.js"` near the top of `backend/src/services/email.ts` (after the existing `import { Resend }` line). The file does NOT currently import prisma.

Then, at the bottom of the file, add:

```typescript
export async function sendDepositReceiptEmail(estimateId: string): Promise<void> {
  const estimate = await prisma.estimate.findUnique({
    where: { id: estimateId },
    include: {
      job: { include: { customer: true } },
    },
  })
  if (!estimate?.job?.customer?.email) return

  const amount = estimate.depositAmount ?? 0
  const jobTitle = estimate.job.title
  const customerName = estimate.job.customer.name

  await sendEmail({
    to: estimate.job.customer.email,
    subject: `Deposit received — ${jobTitle}`,
    html: `
      <p>Hi ${customerName},</p>
      <p>We've received your deposit of <strong>$${amount.toFixed(2)}</strong> for <strong>${jobTitle}</strong>.</p>
      <p>Your appointment is confirmed. Your technician will be in touch soon.</p>
      <p>Thank you,<br/>The FlowSense Team</p>
    `,
  })
}
```

Note: `prisma` may already be imported in `email.ts` — check first and only add the import if needed.

- [ ] **Step 2: Add notifyOfficeDepositReceived to org-notifications.ts**

At the bottom of `backend/src/services/org-notifications.ts`, add:

```typescript
export async function notifyOfficeDepositReceived(estimateId: string): Promise<void> {
  const estimate = await prisma.estimate.findUnique({
    where: { id: estimateId },
    include: {
      job: { include: { customer: true } },
      organization: { select: { email: true, notificationPreferences: true } },
    },
  })
  if (!estimate) return

  const orgEmail = estimate.organization?.email
  if (!orgEmail) return

  const amount = estimate.depositAmount ?? 0
  const customerName = estimate.job?.customer?.name ?? "Customer"
  const jobTitle = estimate.job?.title ?? "job"

  await sendEmail({
    to: orgEmail,
    subject: `Deposit received — ${customerName}`,
    html: `
      <p>A deposit of <strong>$${amount.toFixed(2)}</strong> was received from <strong>${customerName}</strong> for <strong>${jobTitle}</strong>.</p>
      <p>The job has been marked as <strong>confirmed</strong>.</p>
    `,
  })
}
```

- [ ] **Step 3: Run full test suite (TypeScript compile check + tests)**

```bash
cd backend && npm test -- --run
```

Expected: All tests pass, no TypeScript errors (the imports in `webhooks.ts` from Task 5 now resolve).

- [ ] **Step 4: Commit**

```bash
git add backend/src/services/email.ts backend/src/services/org-notifications.ts
git commit -m "feat: add deposit receipt email and office notification functions"
```

---

## Chunk 3: Frontend

### Task 7: Update ApiOrganization type + wire up Connect button in OfficeSettings

**Files:**
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/pages/office/OfficeSettings.tsx`

- [ ] **Step 1: Add Connect fields to ApiOrganization**

In `frontend/src/api/types.ts`, find `export interface ApiOrganization` and add:

```typescript
estimateDepositThreshold: number
estimateDepositPercent: number
stripeConnectOnboarded: boolean
stripeConnectAccountId: string | null
```

(If `estimateDepositThreshold` and `estimateDepositPercent` are not already there, add them too.)

- [ ] **Step 2: Add Stripe Connect section to OfficeSettings**

In `frontend/src/pages/office/OfficeSettings.tsx`:

1. Add state for connect flow:

```typescript
const [connectLoading, setConnectLoading] = useState(false)
const [connectStatus, setConnectStatus] = useState<"success" | "error" | null>(null)
```

2. In the `useEffect` that loads the org, also read `?connect=success` / `?connect=error` from URL and set `connectStatus`:

```typescript
useEffect(() => {
  const params = new URLSearchParams(window.location.search)
  const connect = params.get("connect")
  if (connect === "success") setConnectStatus("success")
  else if (connect === "error") setConnectStatus("error")
}, [])
```

3. Add a handler:

```typescript
async function handleConnectStripe() {
  setConnectLoading(true)
  try {
    const data = await api.get<{ url: string }>("/api/billing/connect")
    window.location.href = data.url
  } catch {
    toast.error("Could not start Stripe Connect. Please try again.")
    setConnectLoading(false)
  }
}
```

4. Add a new Card to the settings page (after the PricebookSettings card), displaying the Connect state:

```tsx
<Card>
  <CardHeader>
    <CardTitle className="flex items-center gap-2">
      <CreditCard className="h-5 w-5" />
      Payment Collection
    </CardTitle>
  </CardHeader>
  <CardContent className="space-y-3">
    {connectStatus === "success" && (
      <div className="text-sm text-green-600 dark:text-green-400 font-medium">
        Stripe connected successfully.
      </div>
    )}
    {connectStatus === "error" && (
      <div className="text-sm text-destructive">
        Stripe connection failed. Please try again.
      </div>
    )}
    {org?.stripeConnectOnboarded ? (
      <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400 font-medium">
        <CheckCircle className="h-4 w-4" />
        Stripe Connected — deposits are enabled
      </div>
    ) : (
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          Connect your Stripe account to collect deposit payments from customers.
        </p>
        <Button onClick={handleConnectStripe} disabled={connectLoading} variant="outline">
          {connectLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Connect Stripe
        </Button>
      </div>
    )}
  </CardContent>
</Card>
```

5. Add `CreditCard` and `CheckCircle` to the lucide-react import at the top of `OfficeSettings.tsx`.

- [ ] **Step 3: Run TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/api/types.ts frontend/src/pages/office/OfficeSettings.tsx
git commit -m "feat: add Stripe Connect card to office settings"
```

---

### Task 8: Wire deposit button in estimate-approval.tsx + handle return params in CustomerEstimate.tsx

**Files:**
- Modify: `frontend/src/components/estimates/estimate-approval.tsx`
- Modify: `frontend/src/pages/customer/CustomerEstimate.tsx`

- [ ] **Step 1: Wire handlePayDeposit in estimate-approval.tsx**

In `frontend/src/components/estimates/estimate-approval.tsx`:

1. The `Props` interface currently doesn't include `orgConnected`. The component doesn't have access to org info. Instead, the deposit button should call the API and redirect. Add the `payingDeposit` state and `handlePayDeposit`:

```typescript
const [payingDeposit, setPayingDeposit] = useState(false)
const [depositError, setDepositError] = useState<string | null>(null)

async function handlePayDeposit() {
  setPayingDeposit(true)
  setDepositError(null)
  try {
    const res = await fetch(`/api/estimates/token/${token}/deposit`, { method: "POST" })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setDepositError((body as { error?: string }).error ?? "Payment setup failed. Please try again.")
      return
    }
    const { url } = await res.json() as { url: string }
    window.location.href = url
  } finally {
    setPayingDeposit(false)
  }
}
```

2. Wire the "Pay Deposit" button:

```tsx
<Button
  size="sm"
  className="flex-1 bg-amber-500 hover:bg-amber-600 text-white"
  onClick={handlePayDeposit}
  disabled={payingDeposit}
>
  {payingDeposit ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
  Pay Deposit
</Button>
```

3. Show `depositError` if set:

```tsx
{depositError && (
  <p className="text-xs text-destructive">{depositError}</p>
)}
```

4. Add `Loader2` to the lucide-react import.

- [ ] **Step 2: Handle ?deposit= URL params in CustomerEstimate.tsx**

In `frontend/src/pages/customer/CustomerEstimate.tsx`:

1. Add state:

```typescript
const [depositResult, setDepositResult] = useState<"paid" | "cancelled" | null>(null)
```

2. In the existing `useEffect` (or a new one), read the URL param on mount:

```typescript
useEffect(() => {
  const params = new URLSearchParams(window.location.search)
  const d = params.get("deposit")
  if (d === "paid") setDepositResult("paid")
  else if (d === "cancelled") setDepositResult("cancelled")
}, [])
```

3. In the `done` step render block, show a deposit confirmation if `depositResult === "paid"`:

```tsx
if (step === "done") {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 px-4 text-center">
      <CheckCircle className="h-10 w-10 text-green-500" />
      <h2 className="font-bold text-lg">
        {depositResult === "paid" ? "Deposit Received!" : "Estimate Approved"}
      </h2>
      <p className="text-sm text-muted-foreground">
        {depositResult === "paid"
          ? "Your deposit has been received and your appointment is confirmed. Your technician will be in touch soon."
          : estimate?.selectedTier
          ? `You selected the ${estimate.selectedTier} plan. Our team will be in touch soon.`
          : "Your approval has been recorded. Our team will be in touch soon."}
      </p>
    </div>
  )
}
```

4. When `depositResult === "cancelled"` and the estimate is approved, show the approval screen again with a retry banner. Since the estimate is already in `approved` state (Stripe redirects back with the same token), check `depositResult === "cancelled"` in the render and show an alert above the approval step:

```tsx
{step === "approval" && depositResult === "cancelled" && (
  <div className="max-w-sm mx-auto mb-3 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
    Payment was cancelled. You can try again below.
  </div>
)}
```

- [ ] **Step 3: TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/estimates/estimate-approval.tsx frontend/src/pages/customer/CustomerEstimate.tsx
git commit -m "feat: wire deposit payment button and handle Stripe return params"
```

---

### Task 9: Add Connect step to onboarding checklist

**Files:**
- Modify: `backend/src/routes/onboarding.ts`
- Modify: `frontend/src/components/office/onboarding-checklist.tsx`
- Modify: `frontend/src/api/types.ts`

The onboarding checklist has 4 steps (companyProfile, technician, customer, job). Add a 5th: `stripeConnect`.

- [ ] **Step 1: Find the onboarding status route**

```bash
grep -n "stripeConnect\|onboarding" backend/src/routes/onboarding.ts | head -20
```

Read the file to understand the `steps` object structure.

- [ ] **Step 2: Update onboarding route to include stripeConnect**

In `backend/src/routes/onboarding.ts`, the `GET /status` handler has a `prisma.organization.findUnique` call with a `select` block. Add `stripeConnectOnboarded: true` to that select:

```typescript
select: {
  onboardingDismissed: true,
  phone: true,
  address: true,
  stripeConnectOnboarded: true,    // ADD THIS
  _count: { select: { technicians: true, customers: true, jobs: true } },
},
```

Then in the `steps` object in the response:

```typescript
steps: {
  companyProfile: !!(org.phone && org.address),
  technician: org._count.technicians > 0,
  customer: org._count.customers > 0,
  job: org._count.jobs > 0,
  stripeConnect: org.stripeConnectOnboarded === true,  // ADD THIS
},
```

- [ ] **Step 3: Update OnboardingStatus type in types.ts**

In `frontend/src/api/types.ts`, find the `OnboardingStatus` interface's `steps` object and add:

```typescript
stripeConnect: boolean
```

- [ ] **Step 4: Add Connect step to the checklist component**

In `frontend/src/components/office/onboarding-checklist.tsx`, add to the `steps` array:

```typescript
{ key: "stripeConnect" as const, label: "Connect Stripe to accept deposits", href: "/office/settings?scroll=payments" },
```

The `href` points to the Settings page. The step navigates there; the admin connects from the settings page.

- [ ] **Step 5: Run TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: No errors. Fix any type errors (e.g. if `OnboardingStatus.steps` is used elsewhere and needs updating).

- [ ] **Step 6: Run full backend test suite**

```bash
cd backend && npm test -- --run
```

Expected: All tests pass (onboarding route tests may need updating if they snapshot the `steps` object — update expected values to include `stripeConnect: false`).

- [ ] **Step 7: Commit**

```bash
git add backend/src/routes/onboarding.ts frontend/src/components/office/onboarding-checklist.tsx frontend/src/api/types.ts
git commit -m "feat: add Stripe Connect step to onboarding checklist"
```

---

## Final verification

- [ ] Run full backend test suite: `cd backend && npm test -- --run`
- [ ] Run TypeScript check: `cd frontend && npx tsc --noEmit`
- [ ] Verify deposit button is hidden on customer portal when org not connected (backend returns 503, frontend shows error)
- [ ] Verify all 9 tasks are committed
