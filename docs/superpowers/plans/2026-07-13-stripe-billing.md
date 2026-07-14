# Stripe Billing Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Stripe subscription billing — $297/mo Entry plan with 30-day free trial via public self-serve checkout, manual admin upgrades to Core/Premium, and a Stripe Customer Portal for self-service billing management.

**Architecture:** The `Organization` model gains four billing fields (`stripeCustomerId`, `stripeSubscriptionId`, `plan`, `trialEndsAt`). Registration creates a Stripe Customer and redirects to Stripe Checkout. Webhooks update plan state. A `requireSubscription` middleware blocks cancelled orgs. The frontend adds a registration page, trial banner, and billing portal link.

**Tech Stack:** Stripe Node SDK (already installed), Prisma, Express, React/TypeScript/Vite

**Spec:** `docs/superpowers/specs/2026-07-13-stripe-billing-design.md`

---

## File Map

**Backend — create:**
- `backend/src/services/stripe.ts` — Stripe singleton + price ID helper
- `backend/src/routes/billing.ts` — `POST /api/billing/portal`, `POST /api/admin/billing/upgrade`
- `backend/src/middleware/require-subscription.ts` — 402 on cancelled plan
- `backend/src/middleware/require-admin.ts` — 403 on non-admin
- `backend/src/__tests__/billing.test.ts` — billing route tests
- `backend/src/__tests__/webhooks-billing.test.ts` — webhook subscription event tests

**Backend — modify:**
- `backend/prisma/schema.prisma` — add 4 billing fields to `Organization`
- `backend/src/routes/auth.ts` — extend `POST /api/auth/register` to create Stripe Customer + return `checkoutUrl`; extend `GET /api/auth/me` to include `organization.plan` + `trialEndsAt`
- `backend/src/routes/webhooks.ts` — handle `customer.subscription.created/updated/deleted`, `invoice.payment_succeeded/payment_failed`
- `backend/src/index.ts` — register billing router, apply `requireSubscription` middleware
- `backend/.env.example` — add Stripe billing env vars
- `backend/src/middleware/types.ts` — add `plan` to org shape if needed

**Frontend — create:**
- `frontend/src/pages/RegisterPage.tsx` — public signup form → redirects to Stripe Checkout
- `frontend/src/components/office/trial-banner.tsx` — dismissible banner shown during trial
- `frontend/src/components/office/subscription-cancelled-screen.tsx` — full-screen block on 402

**Frontend — modify:**
- `frontend/src/App.tsx` — add `/register` public route
- `frontend/src/auth/auth-context.tsx` — add `organization: { plan, trialEndsAt }` to `AuthUser`
- `frontend/src/api/types.ts` — add org billing fields
- `frontend/src/api/client.ts` — intercept 402 and trigger cancelled screen
- `frontend/src/pages/office/OfficeLayout.tsx` — render trial banner + billing nav link

---

## Chunk 1: Database + Stripe Service

### Task 1: Add billing fields to Organization schema

**Files:**
- Modify: `backend/prisma/schema.prisma`

- [ ] **Step 1: Add the four billing fields to `Organization`**

Open `backend/prisma/schema.prisma`. Find the `Organization` model and add after `updatedAt`:

```prisma
stripeCustomerId      String?
stripeSubscriptionId  String?
plan                  String    @default("trial")
trialEndsAt           DateTime?
```

- [ ] **Step 2: Create and apply the migration**

```bash
cd backend
npm run db:migrate
# When prompted for migration name: add_billing_fields_to_organization
```

Expected: migration file created in `prisma/migrations/`, Prisma Client regenerated.

- [ ] **Step 3: Verify schema compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/
git commit -m "feat: add billing fields to Organization schema"
```

---

### Task 2: Stripe service singleton

**Files:**
- Create: `backend/src/services/stripe.ts`

- [ ] **Step 1: Write the failing test**

Create `backend/src/__tests__/billing.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest"

// We test the price ID resolver — the rest is Stripe API calls (not unit-testable)
describe("getPriceId", () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it("returns entry price ID for 'entry' plan", async () => {
    process.env.STRIPE_PRICE_ID_ENTRY = "price_entry_test"
    process.env.STRIPE_PRICE_ID_CORE = "price_core_test"
    process.env.STRIPE_PRICE_ID_PREMIUM = "price_premium_test"
    const { getPriceId } = await import("../services/stripe.js")
    expect(getPriceId("entry")).toBe("price_entry_test")
  })

  it("returns core price ID for 'core' plan", async () => {
    const { getPriceId } = await import("../services/stripe.js")
    expect(getPriceId("core")).toBe("price_core_test")
  })

  it("returns premium price ID for 'premium' plan", async () => {
    const { getPriceId } = await import("../services/stripe.js")
    expect(getPriceId("premium")).toBe("price_premium_test")
  })

  it("throws for unknown plan", async () => {
    const { getPriceId } = await import("../services/stripe.js")
    expect(() => getPriceId("unknown")).toThrow("Unknown plan")
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd backend
npx vitest run src/__tests__/billing.test.ts
```

Expected: FAIL — `getPriceId` not found.

- [ ] **Step 3: Create the Stripe service**

Create `backend/src/services/stripe.ts`:

```typescript
import Stripe from "stripe"

const key = process.env.STRIPE_SECRET_KEY
export const stripe = key ? new Stripe(key, { apiVersion: "2026-04-22.dahlia" }) : null

export function getPriceId(plan: "entry" | "core" | "premium" | string): string {
  const map: Record<string, string | undefined> = {
    entry: process.env.STRIPE_PRICE_ID_ENTRY,
    core: process.env.STRIPE_PRICE_ID_CORE,
    premium: process.env.STRIPE_PRICE_ID_PREMIUM,
  }
  const id = map[plan]
  if (!id) throw new Error(`Unknown plan: ${plan}`)
  return id
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/__tests__/billing.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/stripe.ts backend/src/__tests__/billing.test.ts
git commit -m "feat: add Stripe service singleton and price ID resolver"
```

---

## Chunk 2: Registration + /api/auth/me Extension

### Task 3: Extend registration to create Stripe Customer and return checkout URL

**Files:**
- Modify: `backend/src/routes/auth.ts`

> **Context:** The register route already exists at `POST /api/auth/register`. It creates `Organization` + `User` and returns a JWT. We need to:
> 1. Create a Stripe Customer before the DB transaction
> 2. Create org + user with `stripeCustomerId` stored
> 3. Create a Stripe Checkout Session after the DB transaction
> 4. Return `{ checkoutUrl }` instead of `{ token }`
> 5. If Stripe checkout session creation fails, delete the Stripe Customer and rollback

The register route currently returns `{ token, user }`. After this change it returns `{ checkoutUrl }`. The frontend will redirect to Stripe, then after checkout success land on `/office?checkout=success` where the user will still need to log in (Stripe doesn't give us a session). So we also return `{ token, user }` alongside `checkoutUrl` and the frontend stores the token before redirecting.

- [ ] **Step 1: Add Stripe imports to auth.ts**

Open `backend/src/routes/auth.ts`. Add at the top after existing imports:

```typescript
import { stripe, getPriceId } from "../services/stripe.js"
```

- [ ] **Step 2: Replace the registration handler body**

Find the `authRouter.post("/register", ...)` handler. The current handler creates org + user then returns `{ token, user }`. Replace the `try` block body (after the email uniqueness check and slug logic) with:

```typescript
    const passwordHash = await bcrypt.hash(password, 10)

    // Step 1: Create Stripe Customer (before DB write so we can store the ID)
    let stripeCustomerId: string | undefined
    if (stripe) {
      try {
        const customer = await stripe.customers.create({
          email,
          name,
          metadata: { companyName },
        })
        stripeCustomerId = customer.id
      } catch (e) {
        console.error("[register] Failed to create Stripe customer:", e)
        return res.status(503).json({ error: "Registration temporarily unavailable. Please try again." })
      }
    }

    // Step 2: Create org + user atomically in a DB transaction
    let org: { id: string; name: string; slug: string }
    let newUser: { id: string; email: string; name: string | null; role: string; organizationId: string }

    try {
      const result = await prisma.$transaction(async (tx) => {
        const organization = await tx.organization.create({
          data: {
            name: companyName,
            slug,
            email,
            ...(stripeCustomerId ? { stripeCustomerId, plan: "trial", trialEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) } : {}),
          },
        })
        const user = await tx.user.create({
          data: {
            email,
            name,
            passwordHash,
            role: "office",
            organizationId: organization.id,
          },
        })
        return { organization, user }
      })
      org = result.organization
      newUser = result.user
    } catch (e) {
      // DB failed — clean up the Stripe customer we already created
      if (stripeCustomerId && stripe) {
        await stripe.customers.del(stripeCustomerId).catch(() => {})
      }
      console.error("[register] DB transaction failed:", e)
      return res.status(500).json({ error: "Registration failed. Please try again." })
    }

    // Issue a JWT so the frontend can store it before redirecting to Stripe
    const token = jwt.sign(
      { userId: newUser.id, organizationId: org.id, role: newUser.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    )

    // Step 3: Create Stripe Checkout Session
    if (stripe) {
      try {
        const appUrl = process.env.APP_URL ?? "http://localhost:5173"
        const session = await stripe.checkout.sessions.create({
          mode: "subscription",
          customer: stripeCustomerId,
          line_items: [{ price: getPriceId("entry"), quantity: 1 }],
          subscription_data: { trial_period_days: 30 },
          payment_method_collection: "always",
          success_url: `${appUrl}/office?checkout=success`,
          cancel_url: `${appUrl}/register`,
          metadata: { organizationId: org.id },
        })
        return res.status(201).json({
          checkoutUrl: session.url,
          token,
          user: { id: newUser.id, email: newUser.email, name: newUser.name, role: newUser.role, organizationId: org.id },
        })
      } catch (e) {
        // Checkout session failed — clean up Stripe Customer and the DB records
        if (stripeCustomerId && stripe) {
          await stripe.customers.del(stripeCustomerId).catch(() => {})
        }
        await prisma.organization.delete({ where: { id: org.id } }).catch(() => {})
        console.error("[register] Failed to create checkout session:", e)
        return res.status(503).json({ error: "Registration temporarily unavailable. Please try again." })
      }
    }

    // Stripe not configured (dev/test without STRIPE_SECRET_KEY) — skip checkout
    return res.status(201).json({
      token,
      user: { id: newUser.id, email: newUser.email, name: newUser.name, role: newUser.role, organizationId: org.id },
    })
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd backend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/auth.ts
git commit -m "feat: extend register route to create Stripe Customer and Checkout Session"
```

---

### Task 4: Extend GET /api/auth/me to return org billing fields

**Files:**
- Modify: `backend/src/routes/auth.ts`

> **Context:** The `/api/auth/me` route currently returns `{ id, email, name, role, organizationId }`. The frontend needs `organization: { plan, trialEndsAt }` to show the trial banner.

- [ ] **Step 1: Find the /api/auth/me handler in auth.ts**

Search for `authRouter.get("/me"`. It fetches the user and returns user fields.

- [ ] **Step 2: Add org billing fields to the response**

Update the handler to also fetch `organization.plan` and `organization.trialEndsAt`:

```typescript
authRouter.get("/me", requireAuth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      include: { organization: { select: { plan: true, trialEndsAt: true } } },
    })
    if (!user) return res.status(404).json({ error: "User not found" })

    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      organizationId: user.organizationId,
      organization: {
        plan: user.organization.plan,
        trialEndsAt: user.organization.trialEndsAt,
      },
    })
  } catch {
    return res.status(500).json({ error: "Failed to fetch user" })
  }
})
```

> Note: If the existing handler already has this shape, just add the `include` and `organization` field to the response.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/auth.ts
git commit -m "feat: include organization plan and trialEndsAt in /api/auth/me response"
```

---

## Chunk 3: Webhook Extension

### Task 5: Extend webhook handler with subscription events

**Files:**
- Modify: `backend/src/routes/webhooks.ts`
- Create: `backend/src/__tests__/webhooks-billing.test.ts`

- [ ] **Step 1: Write failing tests**

Create `backend/src/__tests__/webhooks-billing.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest"
import request from "supertest"
import express from "express"

// Mock prisma
vi.mock("../lib/prisma.js", () => ({
  prisma: {
    organization: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    invoice: {
      update: vi.fn(),
    },
  },
}))

// Mock Stripe — we skip signature verification in tests by not setting STRIPE_WEBHOOK_SECRET
vi.mock("stripe", () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      webhooks: {
        constructEvent: vi.fn(),
      },
    })),
  }
})

import { prisma } from "../lib/prisma.js"
import { webhooksRouter } from "../routes/webhooks.js"

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use("/webhooks", webhooksRouter)
  return app
}

function makeEvent(type: string, object: object) {
  return { type, data: { object } }
}

describe("Stripe webhook — subscription events", () => {
  beforeEach(() => vi.clearAllMocks())

  it("sets plan=trial and trialEndsAt on customer.subscription.created", async () => {
    vi.mocked(prisma.organization.findFirst).mockResolvedValue({ id: "org-1", plan: "trial" } as never)
    vi.mocked(prisma.organization.update).mockResolvedValue({} as never)

    const trialEnd = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60
    const event = makeEvent("customer.subscription.created", {
      id: "sub_123",
      customer: "cus_abc",
      trial_end: trialEnd,
      items: { data: [{ price: { id: "price_entry_test" } }] },
      status: "trialing",
    })

    const app = makeApp()
    const res = await request(app).post("/webhooks/stripe").send(event)
    expect(res.status).toBe(200)
    expect(prisma.organization.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          plan: "trial",
          stripeSubscriptionId: "sub_123",
        }),
      })
    )
  })

  it("sets plan=cancelled on customer.subscription.deleted", async () => {
    vi.mocked(prisma.organization.findFirst).mockResolvedValue({ id: "org-1", plan: "entry" } as never)
    vi.mocked(prisma.organization.update).mockResolvedValue({} as never)

    const event = makeEvent("customer.subscription.deleted", {
      id: "sub_123",
      customer: "cus_abc",
    })

    const app = makeApp()
    const res = await request(app).post("/webhooks/stripe").send(event)
    expect(res.status).toBe(200)
    expect(prisma.organization.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { plan: "cancelled" } })
    )
  })

  it("updates plan on invoice.payment_succeeded for subscription invoice", async () => {
    vi.mocked(prisma.organization.findFirst).mockResolvedValue({ id: "org-1", plan: "trial" } as never)
    vi.mocked(prisma.organization.update).mockResolvedValue({} as never)

    process.env.STRIPE_PRICE_ID_ENTRY = "price_entry_test"
    const event = makeEvent("invoice.payment_succeeded", {
      customer: "cus_abc",
      subscription: "sub_123",
      billing_reason: "subscription_cycle",
      lines: { data: [{ price: { id: "price_entry_test" } }] },
    })

    const app = makeApp()
    const res = await request(app).post("/webhooks/stripe").send(event)
    expect(res.status).toBe(200)
    expect(prisma.organization.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ plan: "entry" }) })
    )
  })
})
```

- [ ] **Step 2: Run to verify they fail**

```bash
cd backend && npx vitest run src/__tests__/webhooks-billing.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Extend the webhook handler**

Open `backend/src/routes/webhooks.ts`. Add the Stripe service import at the top:

```typescript
import { getPriceId } from "../services/stripe.js"
```

Add these cases to the `switch (event.type)` block after the existing `checkout.session.expired` case:

```typescript
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription
      const org = await prisma.organization.findFirst({
        where: { stripeCustomerId: sub.customer as string },
      })
      if (!org) break

      // Skip if already in target state (idempotency)
      const priceId = sub.items.data[0]?.price?.id
      let plan: string = org.plan
      try {
        if (priceId === process.env.STRIPE_PRICE_ID_ENTRY) plan = sub.status === "trialing" ? "trial" : "entry"
        else if (priceId === process.env.STRIPE_PRICE_ID_CORE) plan = "core"
        else if (priceId === process.env.STRIPE_PRICE_ID_PREMIUM) plan = "premium"
      } catch { /* unknown price — keep current plan */ }

      const trialEnd = sub.trial_end ? new Date(sub.trial_end * 1000) : null

      await prisma.organization.update({
        where: { id: org.id },
        data: {
          plan,
          stripeSubscriptionId: sub.id,
          ...(trialEnd ? { trialEndsAt: trialEnd } : {}),
        },
      })
      break
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription
      const org = await prisma.organization.findFirst({
        where: { stripeCustomerId: sub.customer as string },
      })
      if (!org || org.plan === "cancelled") break
      await prisma.organization.update({ where: { id: org.id }, data: { plan: "cancelled" } })
      break
    }

    case "invoice.payment_succeeded": {
      const inv = event.data.object as Stripe.Invoice
      // Only handle subscription invoices — customer job invoices are handled by checkout.session.completed
      if (!inv.subscription) break
      const org = await prisma.organization.findFirst({
        where: { stripeCustomerId: inv.customer as string },
      })
      if (!org) break

      // Determine plan from the invoice line item price ID
      const priceId = (inv.lines?.data[0] as { price?: { id: string } })?.price?.id
      let plan = org.plan
      if (priceId === process.env.STRIPE_PRICE_ID_ENTRY) plan = "entry"
      else if (priceId === process.env.STRIPE_PRICE_ID_CORE) plan = "core"
      else if (priceId === process.env.STRIPE_PRICE_ID_PREMIUM) plan = "premium"

      if (plan !== org.plan) {
        await prisma.organization.update({ where: { id: org.id }, data: { plan } })
      }
      break
    }

    case "invoice.payment_failed": {
      // Stripe handles retries automatically — just log
      const inv = event.data.object as Stripe.Invoice
      console.warn(`[webhook] Payment failed for customer ${inv.customer as string}`)
      break
    }
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/__tests__/webhooks-billing.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/webhooks.ts backend/src/__tests__/webhooks-billing.test.ts
git commit -m "feat: extend webhook handler with subscription lifecycle events"
```

---

## Chunk 4: Billing Routes + Middleware

### Task 6: Billing routes (portal + admin upgrade)

**Files:**
- Create: `backend/src/routes/billing.ts`
- Add tests to: `backend/src/__tests__/billing.test.ts`

- [ ] **Step 1: Add failing tests for billing routes**

Append to `backend/src/__tests__/billing.test.ts`:

```typescript
import request from "supertest"
import express from "express"

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    organization: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}))

vi.mock("../services/stripe.js", () => ({
  stripe: {
    billingPortal: {
      sessions: { create: vi.fn() },
    },
    subscriptions: { update: vi.fn() },
  },
  getPriceId: vi.fn((plan: string) => `price_${plan}_test`),
}))

vi.mock("../middleware/auth.js", () => ({
  requireAuth: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.user = { userId: "user-1", organizationId: "org-1", role: "office" }
    next()
  },
}))

import { prisma } from "../lib/prisma.js"
import { stripe } from "../services/stripe.js"
import { billingRouter } from "../routes/billing.js"

function makeBillingApp() {
  const app = express()
  app.use(express.json())
  app.use("/api/billing", billingRouter)
  return app
}

describe("POST /api/billing/portal", () => {
  it("returns portal URL", async () => {
    vi.mocked(prisma.organization.findUnique).mockResolvedValue({ stripeCustomerId: "cus_abc" } as never)
    vi.mocked(stripe!.billingPortal.sessions.create).mockResolvedValue({ url: "https://billing.stripe.com/test" } as never)

    const res = await request(makeBillingApp()).post("/api/billing/portal")
    expect(res.status).toBe(200)
    expect(res.body.url).toBe("https://billing.stripe.com/test")
  })

  it("returns 404 if org has no stripeCustomerId", async () => {
    vi.mocked(prisma.organization.findUnique).mockResolvedValue({ stripeCustomerId: null } as never)

    const res = await request(makeBillingApp()).post("/api/billing/portal")
    expect(res.status).toBe(404)
  })
})
```

- [ ] **Step 2: Run to verify they fail**

```bash
npx vitest run src/__tests__/billing.test.ts
```

Expected: new tests FAIL.

- [ ] **Step 3: Create the billing router**

Create `backend/src/routes/billing.ts`:

```typescript
import { Router } from "express"
import { prisma } from "../lib/prisma.js"
import { stripe, getPriceId } from "../services/stripe.js"
import { requireAuth } from "../middleware/auth.js"
import { z } from "zod"

export const billingRouter = Router()

// POST /api/billing/portal — generate Stripe Customer Portal session
billingRouter.post("/portal", requireAuth, async (req, res) => {
  if (!stripe) return res.status(503).json({ error: "Billing portal temporarily unavailable" })

  const org = await prisma.organization.findUnique({
    where: { id: req.user.organizationId },
    select: { stripeCustomerId: true },
  })

  if (!org?.stripeCustomerId) {
    return res.status(404).json({ error: "No billing account found" })
  }

  try {
    const appUrl = process.env.APP_URL ?? "http://localhost:5173"
    const session = await stripe.billingPortal.sessions.create({
      customer: org.stripeCustomerId,
      return_url: `${appUrl}/office/settings`,
    })
    return res.json({ url: session.url })
  } catch (e) {
    console.error("[billing/portal] Stripe error:", e)
    return res.status(503).json({ error: "Billing portal temporarily unavailable" })
  }
})

const upgradeSchema = z.object({
  organizationId: z.string().min(1),
  plan: z.enum(["entry", "core", "premium"]),
})

// POST /api/admin/billing/upgrade — manually upgrade a subscription (admin only)
// Mounted at /api/admin/billing in index.ts, so this route path is just "/upgrade"
billingRouter.post("/upgrade", requireAuth, async (req, res) => {
  // requireAdmin is applied at the router level in index.ts
  if (!stripe) return res.status(503).json({ error: "Stripe not configured" })

  const parsed = upgradeSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0]?.message ?? "Invalid data" })
  }

  const { organizationId, plan } = parsed.data

  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { stripeCustomerId: true, stripeSubscriptionId: true },
  })

  if (!org?.stripeSubscriptionId) {
    return res.status(404).json({ error: "No active subscription found for this organization" })
  }

  try {
    const priceId = getPriceId(plan)
    const sub = await stripe.subscriptions.retrieve(org.stripeSubscriptionId)
    await stripe.subscriptions.update(org.stripeSubscriptionId, {
      items: [{ id: sub.items.data[0].id, price: priceId }],
      proration_behavior: "always_invoice",
    })
    // Webhook will update the plan field — but also update immediately for responsiveness
    await prisma.organization.update({ where: { id: organizationId }, data: { plan } })
    return res.json({ ok: true, plan })
  } catch (e) {
    console.error("[admin/billing/upgrade] Stripe error:", e)
    return res.status(503).json({ error: "Failed to upgrade subscription" })
  }
})
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/__tests__/billing.test.ts
```

Expected: all billing tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/billing.ts backend/src/__tests__/billing.test.ts
git commit -m "feat: add billing portal and admin upgrade routes"
```

---

### Task 7: requireSubscription and requireAdmin middleware

**Files:**
- Create: `backend/src/middleware/require-subscription.ts`
- Create: `backend/src/middleware/require-admin.ts`

- [ ] **Step 1: Create requireSubscription middleware**

Create `backend/src/middleware/require-subscription.ts`:

```typescript
import type { Request, Response, NextFunction } from "express"
import { prisma } from "../lib/prisma.js"

export async function requireSubscription(req: Request, res: Response, next: NextFunction) {
  try {
    const org = await prisma.organization.findUnique({
      where: { id: req.user.organizationId },
      select: { plan: true },
    })
    if (org?.plan === "cancelled") {
      return res.status(402).json({
        error: "subscription_cancelled",
        message: "Your subscription has ended.",
      })
    }
    next()
  } catch {
    next() // on DB error, don't block — fail open
  }
}
```

- [ ] **Step 2: Create requireAdmin middleware**

Create `backend/src/middleware/require-admin.ts`:

```typescript
import type { Request, Response, NextFunction } from "express"

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ error: "Admin access required" })
  }
  next()
}
```

- [ ] **Step 3: Register routes and middleware in index.ts**

Open `backend/src/index.ts`. Add imports near the top with the other route imports:

```typescript
import { billingRouter } from "./routes/billing.js"
import { requireSubscription } from "./middleware/require-subscription.js"
import { requireAdmin } from "./middleware/require-admin.js"
```

After the `app.use("/api/organizations", ...)` line, add:

```typescript
// Billing — portal (any authenticated user) and admin upgrade
app.use("/api/billing", apiLimiter, requireAuth, billingRouter)
app.use("/api/admin/billing", apiLimiter, requireAuth, requireAdmin, billingRouter)
```

Then add `requireSubscription` to all protected routes (after `requireAuth`):

```typescript
app.use("/api/jobs", apiLimiter, requireAuth, requireSubscription, jobsRouter)
app.use("/api/technicians", apiLimiter, requireAuth, requireSubscription, techniciansRouter)
app.use("/api/customers", apiLimiter, requireAuth, requireSubscription, customersRouter)
app.use("/api/compliance", apiLimiter, requireAuth, requireSubscription, complianceRouter)
app.use("/api/dashboard", apiLimiter, requireAuth, requireSubscription, dashboardRouter)
app.use("/api/invoices", apiLimiter, requireAuth, requireSubscription, invoicesRouter)
app.use("/api/conversations", apiLimiter, requireAuth, requireSubscription, conversationsRouter)
app.use("/api/dispatch", apiLimiter, requireAuth, requireSubscription, dispatchRouter)
app.use("/api/organizations", apiLimiter, requireAuth, requireSubscription, organizationsRouter)
```

- [ ] **Step 4: Add Stripe billing env vars to .env.example**

Open `backend/.env.example`. Add after the existing Stripe vars:

```env
STRIPE_PRICE_ID_ENTRY=price_...
STRIPE_PRICE_ID_CORE=price_...
STRIPE_PRICE_ID_PREMIUM=price_...
APP_URL=http://localhost:5173
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd backend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add backend/src/middleware/require-subscription.ts backend/src/middleware/require-admin.ts backend/src/index.ts backend/.env.example
git commit -m "feat: add requireSubscription and requireAdmin middleware, wire billing routes"
```

---

## Chunk 5: Frontend — Auth Context + Registration Page

### Task 8: Extend auth context with org billing fields

**Files:**
- Modify: `frontend/src/auth/auth-context.tsx`
- Modify: `frontend/src/api/types.ts`

- [ ] **Step 1: Add org billing fields to api/types.ts**

Open `frontend/src/api/types.ts`. Add or extend the org type:

```typescript
export interface ApiOrganization {
  plan: "trial" | "entry" | "core" | "premium" | "cancelled"
  trialEndsAt: string | null
}
```

- [ ] **Step 3: Add billing fields to AuthUser type**

Open `frontend/src/auth/auth-context.tsx`. Add the import and update `AuthUser`:

```typescript
import type { ApiOrganization } from "@/api/types"
```

Update the `AuthUser` interface:

```typescript
export interface AuthUser {
  id: string
  email: string
  name: string | null
  role: UserRole
  organizationId: string
  organization: ApiOrganization
}
```

- [ ] **Step 2: Add 402 handling to the api client**

Open `frontend/src/api/client.ts`. Find where non-ok responses are handled. Add a check for 402:

```typescript
if (res.status === 402) {
  // Subscription cancelled — dispatch a custom event the layout can listen to
  window.dispatchEvent(new CustomEvent("subscription-cancelled"))
  throw new Error("subscription_cancelled")
}
```

This goes inside the fetch wrapper before the general error throw.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors (may need to fix call sites that access `user.organization`).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/auth/auth-context.tsx frontend/src/api/client.ts
git commit -m "feat: add organization plan fields to auth context, handle 402 in api client"
```

---

### Task 9: Registration page

**Files:**
- Create: `frontend/src/pages/RegisterPage.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Create the registration page**

Create `frontend/src/pages/RegisterPage.tsx`:

```tsx
import { useState } from "react"
import { Link, Navigate } from "react-router-dom"
import { useAuth } from "@/auth/auth-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { FlowSenseLogo } from "@/components/brand"
import { ThemeToggle } from "@/components/theme-toggle"
import { Loader2, AlertCircle } from "lucide-react"

export default function RegisterPage() {
  const { user, loading } = useAuth()
  const [companyName, setCompanyName] = useState("")
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (!loading && user) return <Navigate to="/office" replace />

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyName, name, email, password }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? "Registration failed. Please try again.")
        return
      }
      // Store token so user is logged in after returning from Stripe
      if (data.token) localStorage.setItem("flowsense_token", data.token)
      // Redirect to Stripe Checkout
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl
      } else {
        // Stripe not configured (dev mode) — go straight to the app
        window.location.href = "/office"
      }
    } catch {
      setError("Something went wrong. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex h-[60px] items-center justify-between px-6 border-b border-border">
        <FlowSenseLogo size="sm" />
        <ThemeToggle />
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Start your free trial</h1>
            <p className="mt-2 text-sm text-muted-foreground">30 days free · No charge until day 31 · Cancel anytime</p>
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Company name</label>
              <Input
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Acme HVAC Services"
                required
                minLength={2}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Your name</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="John Smith"
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Email</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="john@acmehvac.com"
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Password</label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                required
                minLength={8}
              />
            </div>

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Start free trial →"}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link to="/login" className="text-primary underline hover:text-primary/80">Sign in</Link>
          </p>

          <p className="text-center text-xs text-muted-foreground">
            By signing up you agree to our terms of service. Your card won't be charged during the 30-day trial.
          </p>
        </div>
      </main>
    </div>
  )
}
```

- [ ] **Step 2: Add /register route to App.tsx**

Open `frontend/src/App.tsx`. Find the public routes section (near the `LoginPage` route). Add:

```tsx
import RegisterPage from "./pages/RegisterPage"
// ...
<Route path="/register" element={<RegisterPage />} />
```

- [ ] **Step 3: Add "Create account" link to LoginPage**

Open `frontend/src/pages/LoginPage.tsx`. Find the bottom of the login form and add a link:

```tsx
<p className="text-center text-sm text-muted-foreground">
  New company?{" "}
  <Link to="/register" className="text-primary underline hover:text-primary/80">Start free trial</Link>
</p>
```

- [ ] **Step 4: Verify TypeScript and build**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/RegisterPage.tsx frontend/src/App.tsx frontend/src/pages/LoginPage.tsx
git commit -m "feat: add registration page with Stripe Checkout redirect"
```

---

## Chunk 6: Frontend — Trial Banner + Cancelled Screen + Billing Link

### Task 10: Trial banner

**Files:**
- Create: `frontend/src/components/office/trial-banner.tsx`

- [ ] **Step 1: Create the trial banner component**

Create `frontend/src/components/office/trial-banner.tsx`:

```tsx
import { useState } from "react"
import { X } from "lucide-react"

interface TrialBannerProps {
  trialEndsAt: string
  onOpenBilling: () => void
}

export function TrialBanner({ trialEndsAt, onOpenBilling }: TrialBannerProps) {
  const [dismissed, setDismissed] = useState(() =>
    sessionStorage.getItem("trial-banner-dismissed") === "true"
  )

  if (dismissed) return null

  const endsAt = new Date(trialEndsAt)
  const daysLeft = Math.ceil((endsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  const dateStr = endsAt.toLocaleDateString(undefined, { month: "short", day: "numeric" })

  function dismiss() {
    sessionStorage.setItem("trial-banner-dismissed", "true")
    setDismissed(true)
  }

  return (
    <div className="flex items-center justify-between gap-3 bg-primary/10 border-b border-primary/20 px-4 py-2">
      <p className="text-sm text-foreground">
        <span className="font-medium">Free trial — {daysLeft} day{daysLeft !== 1 ? "s" : ""} left.</span>
        {" "}Your card will be charged $297/mo on {dateStr}.{" "}
        <button type="button" onClick={onOpenBilling} className="underline text-primary hover:text-primary/80">
          Manage billing
        </button>
      </p>
      <button type="button" onClick={dismiss} className="text-muted-foreground hover:text-foreground flex-shrink-0">
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Create the subscription cancelled screen**

Create `frontend/src/components/office/subscription-cancelled-screen.tsx`:

```tsx
import { useState } from "react"
import { api } from "@/api/client"
import { Loader2, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"

export function SubscriptionCancelledScreen() {
  const [loading, setLoading] = useState(false)

  async function handleReactivate() {
    setLoading(true)
    try {
      const data = await api.post<{ url: string }>("/api/billing/portal", {})
      window.location.href = data.url
    } catch {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
        <AlertTriangle className="h-8 w-8 text-destructive" />
      </div>
      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-foreground">Your subscription has ended</h1>
        <p className="text-muted-foreground max-w-sm">
          Reactivate your FlowSense subscription to regain access to your account and all your data.
        </p>
      </div>
      <Button onClick={handleReactivate} disabled={loading} size="lg">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Reactivate subscription"}
      </Button>
    </div>
  )
}
```

- [ ] **Step 3: Wire both into OfficeLayout**

Open `frontend/src/pages/office/OfficeLayout.tsx` (or wherever the office shell lives). Add:

```tsx
import { useState, useEffect } from "react"
import { useAuth } from "@/auth/auth-context"
import { api } from "@/api/client"
import { TrialBanner } from "@/components/office/trial-banner"
import { SubscriptionCancelledScreen } from "@/components/office/subscription-cancelled-screen"
import { CreditCard } from "lucide-react"
```

Inside the component:

```tsx
const { user } = useAuth()
const [cancelled, setCancelled] = useState(false)

useEffect(() => {
  const handler = () => setCancelled(true)
  window.addEventListener("subscription-cancelled", handler)
  return () => window.removeEventListener("subscription-cancelled", handler)
}, [])

async function openBillingPortal() {
  try {
    const data = await api.post<{ url: string }>("/api/billing/portal", {})
    window.location.href = data.url
  } catch { /* ignore */ }
}

if (cancelled) return <SubscriptionCancelledScreen />
```

In the JSX, render the trial banner just inside the outermost div, before the sidebar/content:

```tsx
{user?.organization.plan === "trial" && user.organization.trialEndsAt && (
  <TrialBanner trialEndsAt={user.organization.trialEndsAt} onOpenBilling={openBillingPortal} />
)}
```

Add a "Billing" nav item to the sidebar nav items list:

```tsx
{ label: "Billing", href: "#", icon: CreditCard, onClick: openBillingPortal }
```

Handle the `onClick` in the nav item render: if the item has an `onClick`, call it instead of navigating.

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/office/ frontend/src/pages/office/OfficeLayout.tsx
git commit -m "feat: add trial banner, cancelled screen, and billing nav link to office layout"
```

---

### Task 11: Final verification

- [ ] **Step 1: Run all backend tests**

```bash
cd backend && npx vitest run
```

Expected: all tests pass.

- [ ] **Step 2: Run frontend TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Smoke test in dev (Stripe not configured)**

```bash
# Terminal 1
cd backend && npm run dev

# Terminal 2
cd frontend && npm run dev
```

- Navigate to `http://localhost:5173/register`
- Fill out the form — should redirect to `/office` directly (Stripe not configured in dev)
- Verify `/office` loads without errors
- Verify no trial banner (plan is "trial" but `trialEndsAt` is set — banner should show if you seed the DB)

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: Stripe billing — registration, subscription lifecycle, portal, trial banner"
```
