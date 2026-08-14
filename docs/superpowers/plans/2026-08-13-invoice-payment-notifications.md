# Invoice Payment Notifications Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a customer pays an invoice via Stripe, send a customer receipt email, an office notification email, and an office SMS (if smsEnabled); show the customer a success banner on redirect.

**Architecture:** Extend `email.ts` with `sendInvoiceReceiptEmail` and `org-notifications.ts` with `notifyOfficePaymentReceived`. Wire both into the existing `invoiceId` branch of `webhooks.ts` as fire-and-forget calls. Add a `?payment=success` banner to `CustomerDashboard.tsx` using `useSearchParams` + `useNavigate`.

**Tech Stack:** Express/Prisma/TypeScript (backend), Resend (email), Twilio (SMS), React/React Router v6 (frontend), vitest/supertest (tests)

---

## File Structure

| File | Change |
|---|---|
| `backend/src/services/email.ts` | Add `sendInvoiceReceiptEmail` |
| `backend/src/services/org-notifications.ts` | Add `notifyOfficePaymentReceived` |
| `backend/src/routes/webhooks.ts` | Wire notifications into `invoiceId` branch |
| `backend/src/__tests__/webhooks-invoice.test.ts` | New test file for invoice webhook path |
| `frontend/src/pages/customer/CustomerDashboard.tsx` | Add success banner |

---

## Chunk 1: Backend notifications + webhook wiring

### Task 1: sendInvoiceReceiptEmail + notifyOfficePaymentReceived + webhook wiring

**Files:**
- Modify: `backend/src/services/email.ts`
- Modify: `backend/src/services/org-notifications.ts`
- Modify: `backend/src/routes/webhooks.ts`
- Create: `backend/src/__tests__/webhooks-invoice.test.ts`

**Context:**
- `email.ts` uses Resend. `sendEmail({ to, subject, html })` is the internal helper. Follow `sendDepositReceiptEmail` pattern — the new function takes plain args (not an id to fetch), because the webhook will have already fetched what's needed.
- `org-notifications.ts` uses `getOrgDispatch(organizationId)` to get org email — but `notifyOfficePaymentReceived` does NOT use `getOrgDispatch` because that helper only selects `{ email, notificationPreferences }` and does not return `phone` or `smsEnabled`. Instead, do a direct `prisma.organization.findUnique({ select: { name, email, phone, smsEnabled } })`.
- SMS is sent via Twilio directly (not via `sms.ts` exports, which all fetch customer data internally). `sms.ts` has a private `getClient()` that reads env vars — we cannot import it. Duplicate the env-var reading inline in `notifyOfficePaymentReceived`; this is intentional since we're texting the org phone, not a customer phone, and the logic is short enough to not warrant a shared helper.
- Twilio credentials: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` env vars. Import `twilio` from `"twilio"`.
- Org `phone` field is `String?` (nullable). `smsEnabled` is `Boolean`. Only send SMS if both are set and valid E.164.
- `webhooks.ts` `invoiceId` branch: after `prisma.invoice.update`, do two sequential prisma fetches (invoice+customer, org), then fire both notifications. All failures caught and logged — never return non-200 to Stripe from a notification failure.
- Test file pattern: see `backend/src/__tests__/webhooks-billing.test.ts` — mock prisma, mock Stripe (no webhook secret so signature check is skipped), mock services, use `express.raw` body, `makeEvent()` helper.

- [ ] **Step 1: Write failing tests**

Create `backend/src/__tests__/webhooks-invoice.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest"
import request from "supertest"
import express from "express"

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    invoice: { update: vi.fn(), findUnique: vi.fn() },
    organization: { findUnique: vi.fn() },
    estimate: { findUnique: vi.fn() },
    job: { update: vi.fn() },
  },
}))

vi.mock("stripe", () => {
  function MockStripe() {
    return { webhooks: { constructEvent: vi.fn() } }
  }
  return { default: MockStripe }
})

vi.mock("../services/email.js", () => ({
  sendEmail: vi.fn(),
  sendDepositReceiptEmail: vi.fn().mockResolvedValue(undefined),
  sendInvoiceReceiptEmail: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("../services/org-notifications.js", () => ({
  notifyOrgNewBooking: vi.fn(),
  notifyOrgStatusChange: vi.fn(),
  notifyOrgJobCompleted: vi.fn(),
  notifyOfficeDepositReceived: vi.fn().mockResolvedValue(undefined),
  notifyOfficePaymentReceived: vi.fn().mockResolvedValue(undefined),
}))

import { prisma } from "../lib/prisma.js"
import { sendInvoiceReceiptEmail } from "../services/email.js"
import { notifyOfficePaymentReceived } from "../services/org-notifications.js"
import { webhooksRouter } from "../routes/webhooks.js"

const mockPrisma = prisma as unknown as {
  invoice: { update: ReturnType<typeof vi.fn>; findUnique: ReturnType<typeof vi.fn> }
  organization: { findUnique: ReturnType<typeof vi.fn> }
  estimate: { findUnique: ReturnType<typeof vi.fn> }
  job: { update: ReturnType<typeof vi.fn> }
}

function makeApp() {
  const app = express()
  app.use(express.raw({ type: "application/json" }))
  app.use(webhooksRouter)
  return app
}

function makeEvent(type: string, object: object) {
  return { type, data: { object } }
}

describe("Stripe webhook — invoice payment", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.STRIPE_SECRET_KEY = "sk_test_dummy"
    delete process.env.STRIPE_WEBHOOK_SECRET
  })

  it("marks invoice as paid on checkout.session.completed", async () => {
    mockPrisma.invoice.update.mockResolvedValue({ id: "inv1", status: "paid" })
    mockPrisma.invoice.findUnique.mockResolvedValue({
      id: "inv1",
      amount: 350,
      description: "AC repair",
      issuedDate: new Date("2026-08-01"),
      customer: { name: "Alice Johnson", email: "alice@example.com" },
    })
    mockPrisma.organization.findUnique.mockResolvedValue({
      name: "Cool Air HVAC",
      phone: "+15550001234",
      email: "office@coolair.com",
    })

    const event = makeEvent("checkout.session.completed", {
      metadata: { invoiceId: "inv1", organizationId: "org1" },
    })

    const res = await request(makeApp())
      .post("/stripe")
      .set("Content-Type", "application/json")
      .send(Buffer.from(JSON.stringify(event)))

    expect(res.status).toBe(200)
    expect(mockPrisma.invoice.update).toHaveBeenCalledWith({
      where: { id: "inv1" },
      data: { status: "paid" },
    })
  })

  it("calls sendInvoiceReceiptEmail after invoice is marked paid", async () => {
    mockPrisma.invoice.update.mockResolvedValue({})
    mockPrisma.invoice.findUnique.mockResolvedValue({
      id: "inv1",
      amount: 350,
      description: "AC repair",
      issuedDate: new Date("2026-08-01"),
      customer: { name: "Alice Johnson", email: "alice@example.com" },
    })
    mockPrisma.organization.findUnique.mockResolvedValue({
      name: "Cool Air HVAC",
      phone: "+15550001234",
      email: "office@coolair.com",
    })

    const event = makeEvent("checkout.session.completed", {
      metadata: { invoiceId: "inv1", organizationId: "org1" },
    })

    await request(makeApp())
      .post("/stripe")
      .set("Content-Type", "application/json")
      .send(Buffer.from(JSON.stringify(event)))

    // fire-and-forget — give microtasks a tick to settle
    await new Promise((r) => setTimeout(r, 10))
    expect(sendInvoiceReceiptEmail).toHaveBeenCalled()
  })

  it("calls notifyOfficePaymentReceived after invoice is marked paid", async () => {
    mockPrisma.invoice.update.mockResolvedValue({})
    mockPrisma.invoice.findUnique.mockResolvedValue({
      id: "inv1",
      amount: 350,
      description: "AC repair",
      issuedDate: new Date("2026-08-01"),
      customer: { name: "Alice Johnson", email: "alice@example.com" },
    })
    mockPrisma.organization.findUnique.mockResolvedValue({
      name: "Cool Air HVAC",
      phone: "+15550001234",
      email: "office@coolair.com",
    })

    const event = makeEvent("checkout.session.completed", {
      metadata: { invoiceId: "inv1", organizationId: "org1" },
    })

    await request(makeApp())
      .post("/stripe")
      .set("Content-Type", "application/json")
      .send(Buffer.from(JSON.stringify(event)))

    await new Promise((r) => setTimeout(r, 10))
    expect(notifyOfficePaymentReceived).toHaveBeenCalled()
  })

  it("still returns 200 if invoice findUnique returns null after update", async () => {
    mockPrisma.invoice.update.mockResolvedValue({})
    mockPrisma.invoice.findUnique.mockResolvedValue(null)
    mockPrisma.organization.findUnique.mockResolvedValue(null)

    const event = makeEvent("checkout.session.completed", {
      metadata: { invoiceId: "inv1", organizationId: "org1" },
    })

    const res = await request(makeApp())
      .post("/stripe")
      .set("Content-Type", "application/json")
      .send(Buffer.from(JSON.stringify(event)))

    expect(res.status).toBe(200)
  })

  it("still returns 200 if sendInvoiceReceiptEmail throws", async () => {
    mockPrisma.invoice.update.mockResolvedValue({})
    mockPrisma.invoice.findUnique.mockResolvedValue({
      id: "inv1",
      amount: 350,
      description: "AC repair",
      issuedDate: new Date("2026-08-01"),
      customer: { name: "Alice Johnson", email: "alice@example.com" },
    })
    mockPrisma.organization.findUnique.mockResolvedValue({
      name: "Cool Air HVAC",
      phone: null,
      email: "office@coolair.com",
    })
    vi.mocked(sendInvoiceReceiptEmail).mockRejectedValue(new Error("Email failed"))

    const event = makeEvent("checkout.session.completed", {
      metadata: { invoiceId: "inv1", organizationId: "org1" },
    })

    const res = await request(makeApp())
      .post("/stripe")
      .set("Content-Type", "application/json")
      .send(Buffer.from(JSON.stringify(event)))

    expect(res.status).toBe(200)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && npx vitest run src/__tests__/webhooks-invoice.test.ts
```

Expected: FAIL — `sendInvoiceReceiptEmail` and `notifyOfficePaymentReceived` not exported yet

- [ ] **Step 3: Add sendInvoiceReceiptEmail to email.ts**

Append to `backend/src/services/email.ts`:

```typescript
export async function sendInvoiceReceiptEmail(params: {
  invoiceId: string
  amount: number
  description: string
  issuedDate: Date
  customerName: string
  customerEmail: string | null
  orgName: string
  orgContactPhone: string | null
  orgContactEmail: string | null
}): Promise<void> {
  if (!params.customerEmail) return

  const { customerName, customerEmail, amount, description, orgName, orgContactPhone, orgContactEmail } = params

  await sendEmail({
    to: customerEmail,
    subject: `Payment received — ${orgName}`,
    html: `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
        <h2 style="color:#1a1a1a;">Payment Received</h2>
        <p>Hi ${customerName},</p>
        <p>Thank you — we've received your payment of <strong>$${amount.toFixed(2)}</strong> for <strong>${description}</strong>.</p>
        <div style="background:#f5f5f5;padding:16px;border-radius:8px;margin:16px 0;">
          <p style="margin:4px 0;"><strong>Amount paid:</strong> $${amount.toFixed(2)}</p>
          <p style="margin:4px 0;"><strong>Service:</strong> ${description}</p>
          <p style="margin:4px 0;"><strong>Date:</strong> ${new Date(params.issuedDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</p>
        </div>
        ${orgContactPhone || orgContactEmail ? `
        <p style="color:#555;font-size:14px;">Questions? Contact us:<br/>
          ${orgContactPhone ? `Phone: ${orgContactPhone}<br/>` : ""}
          ${orgContactEmail ? `Email: ${orgContactEmail}` : ""}
        </p>` : ""}
        <p>Thank you,<br/>${orgName}</p>
        <p style="color:#888;font-size:13px;margin-top:24px;">— FlowSense</p>
      </div>
    `,
  })
}
```

- [ ] **Step 4: Add notifyOfficePaymentReceived to org-notifications.ts**

Append to `backend/src/services/org-notifications.ts`:

```typescript
import twilio from "twilio"

export async function notifyOfficePaymentReceived(params: {
  invoiceId: string
  amount: number
  description: string
  customerName: string
  orgId: string
}): Promise<void> {
  const { amount, description, customerName, orgId } = params

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { name: true, email: true, phone: true, smsEnabled: true },
  })
  if (!org) return

  // Email notification
  if (org.email) {
    sendEmail({
      to: org.email,
      subject: `Payment received: $${amount.toFixed(2)} from ${customerName}`,
      html: wrap(
        "Payment Received",
        `<p><strong>${customerName}</strong> has paid <strong>$${amount.toFixed(2)}</strong> for <strong>${escapeHtml(description)}</strong>.</p>
         <div style="background:#f5f5f5;padding:16px;border-radius:8px;margin:16px 0;">
           <p style="margin:4px 0;"><strong>Customer:</strong> ${escapeHtml(customerName)}</p>
           <p style="margin:4px 0;"><strong>Amount:</strong> $${amount.toFixed(2)}</p>
           <p style="margin:4px 0;"><strong>Service:</strong> ${escapeHtml(description)}</p>
           <p style="margin:4px 0;"><strong>Time:</strong> ${new Date().toLocaleString("en-US")}</p>
         </div>`
      ),
    }).catch((e: unknown) => console.error("[OrgNotify] Payment email failed:", e))
  }

  // SMS notification (only if smsEnabled and org has a valid phone)
  if (org.smsEnabled && org.phone) {
    const E164 = /^\+[1-9]\d{7,14}$/
    if (!E164.test(org.phone)) return

    const sid = process.env.TWILIO_ACCOUNT_SID
    const token = process.env.TWILIO_AUTH_TOKEN
    const from = process.env.TWILIO_FROM_NUMBER
    if (!sid || !token || !from) return

    const client = twilio(sid, token)
    const body = `[FlowSense] Payment received: $${amount.toFixed(2)} from ${customerName} (${description})`
    client.messages
      .create({ to: org.phone, from, body })
      .catch((e: unknown) => console.error("[OrgNotify] Payment SMS failed:", e))
  }
}
```

- [ ] **Step 5: Wire into webhooks.ts**

In `backend/src/routes/webhooks.ts`, update imports to add the new functions:

```typescript
import { sendDepositReceiptEmail, sendInvoiceReceiptEmail } from "../services/email.js"
import { notifyOfficeDepositReceived, notifyOfficePaymentReceived } from "../services/org-notifications.js"
```

Then in the `invoiceId` branch, after the `prisma.invoice.update` succeeds, add:

```typescript
// Fetch invoice + customer for receipt email, org for office email footer
const [paidInvoice, org] = await Promise.all([
  prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { customer: { select: { name: true, email: true } } },
  }),
  prisma.organization.findUnique({
    where: { id: organizationId },
    select: { name: true, phone: true, email: true },
  }),
])

if (paidInvoice && org) {
  sendInvoiceReceiptEmail({
    invoiceId: paidInvoice.id,
    amount: paidInvoice.amount,
    description: paidInvoice.description,
    issuedDate: paidInvoice.issuedDate,
    customerName: paidInvoice.customer.name,
    customerEmail: paidInvoice.customer.email,
    orgName: org.name,
    orgContactPhone: org.phone,
    orgContactEmail: org.email,
  }).catch((e: unknown) => console.error("[Webhook] Invoice receipt email failed:", e))

  notifyOfficePaymentReceived({
    invoiceId: paidInvoice.id,
    amount: paidInvoice.amount,
    description: paidInvoice.description,
    customerName: paidInvoice.customer.name,
    orgId: organizationId,
  }).catch((e: unknown) => console.error("[Webhook] Office payment notification failed:", e))
}
```

The `prisma.invoice.update` call currently sits inside a try/catch that returns `res.status(500)` on failure — that is correct and must stay. The new fetches and notification calls go **after** the update, **inside** a separate try/catch that logs but does NOT return a non-200 to Stripe:

```typescript
// In the invoiceId branch — full updated structure:
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

  // Notifications — fire-and-forget; failures must not affect webhook response
  try {
    const [paidInvoice, org] = await Promise.all([
      prisma.invoice.findUnique({
        where: { id: invoiceId },
        include: { customer: { select: { name: true, email: true } } },
      }),
      prisma.organization.findUnique({
        where: { id: organizationId },
        select: { name: true, phone: true, email: true },
      }),
    ])

    if (paidInvoice && org) {
      sendInvoiceReceiptEmail({
        invoiceId: paidInvoice.id,
        amount: paidInvoice.amount,
        description: paidInvoice.description,
        issuedDate: paidInvoice.issuedDate,
        customerName: paidInvoice.customer.name,
        customerEmail: paidInvoice.customer.email,
        orgName: org.name,
        orgContactPhone: org.phone,
        orgContactEmail: org.email,
      }).catch((e: unknown) => console.error("[Webhook] Invoice receipt email failed:", e))

      notifyOfficePaymentReceived({
        invoiceId: paidInvoice.id,
        amount: paidInvoice.amount,
        description: paidInvoice.description,
        customerName: paidInvoice.customer.name,
        orgId: organizationId,
      }).catch((e: unknown) => console.error("[Webhook] Office payment notification failed:", e))
    }
  } catch (e) {
    console.error("[Webhook] Failed to fetch invoice/org for notifications:", e)
    // intentionally do not return error — invoice is already marked paid
  }
}
```

- [ ] **Step 6: Run tests**

```bash
cd backend && npx vitest run src/__tests__/webhooks-invoice.test.ts
```

Expected: PASS — 5 tests

- [ ] **Step 7: Run full backend suite to check for regressions**

```bash
cd backend && npx vitest run
```

Expected: all tests pass

- [ ] **Step 8: TypeScript check**

```bash
cd backend && npx tsc --noEmit
```

Expected: no errors. If `twilio` import in `org-notifications.ts` causes a type error, check that `twilio` is already in `backend/package.json` (it is — used by `sms.ts`).

- [ ] **Step 9: Commit**

```bash
git add backend/src/services/email.ts backend/src/services/org-notifications.ts backend/src/routes/webhooks.ts backend/src/__tests__/webhooks-invoice.test.ts
git commit -m "feat: send customer receipt email and office notification on invoice payment"
```

---

## Chunk 2: Frontend success banner

### Task 2: Payment success banner in CustomerDashboard.tsx

**Files:**
- Modify: `frontend/src/pages/customer/CustomerDashboard.tsx`

**Context:**
- Stripe success_url is already `${appUrl}/customer?payment=success&invoice=${invoice.id}`
- The file currently starts with `"use client"` (harmless in Vite — leave it)
- React Router v6 is used. `useNavigate` is already used in `CustomerLayout.tsx`. Import `useSearchParams` and `useNavigate` from `"react-router-dom"`.
- `useEffect` and `useState` are already imported.
- The banner uses Tailwind classes matching the existing green style in `CustomerDashboard.tsx` (look at the job-confirmed banner in `ConciergeChatWidget.tsx` for the color pattern: `bg-green-50 border border-green-200 text-green-800 dark:bg-green-950 dark:text-green-300 dark:border-green-800`).
- The `X` icon from `lucide-react` is already imported in this file.

- [ ] **Step 1: Write the updated CustomerDashboard.tsx**

Read the current file fully first. Then make these targeted edits:

**Add to imports** (merge into existing `react-router-dom` import or add new one):
```typescript
import { Link, useSearchParams, useNavigate } from "react-router-dom"
```

**Add state** (alongside existing `useState` calls):
```typescript
const [showPaymentSuccess, setShowPaymentSuccess] = useState(false)
```

**Add ref for timer** (alongside existing state):
```typescript
const paymentBannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
```

Add `useRef` to the React import.

**Add `useSearchParams` and `useNavigate`** at the **top of the component function** (before any other hooks — these must be called at the top level, never inside a callback or effect):

At the **top of the component function** (before any other hooks), add:
```typescript
const [searchParams] = useSearchParams()
const navigate = useNavigate()
```

Then add a `useEffect` that runs once on mount:
```typescript
useEffect(() => {
  if (searchParams.get("payment") === "success") {
    navigate("/customer", { replace: true })  // clear URL first
    setShowPaymentSuccess(true)
    paymentBannerTimer.current = setTimeout(() => setShowPaymentSuccess(false), 5000)
  }
  return () => {
    if (paymentBannerTimer.current) clearTimeout(paymentBannerTimer.current)
  }
}, []) // intentionally empty — only runs on mount; searchParams is read synchronously above
```

**Add banner JSX** — render just below the opening `<div>` of the main return, before any other content:
```tsx
{showPaymentSuccess && (
  <div className="flex items-center justify-between gap-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3 dark:border-green-800 dark:bg-green-950">
    <div className="flex items-center gap-2">
      <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600 dark:text-green-400" />
      <p className="text-sm font-medium text-green-800 dark:text-green-300">
        Payment received — thank you!
      </p>
    </div>
    <button
      onClick={() => {
        setShowPaymentSuccess(false)
        if (paymentBannerTimer.current) clearTimeout(paymentBannerTimer.current)
      }}
      className="shrink-0 text-green-600 hover:text-green-800 dark:text-green-400"
      aria-label="Dismiss"
    >
      <X className="h-4 w-4" />
    </button>
  </div>
)}
```

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors. If `useRef` causes a conflict with existing imports, ensure `useRef` is added to the React import line.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/customer/CustomerDashboard.tsx
git commit -m "feat: show payment success banner on customer portal after Stripe redirect"
```

---

## Final verification

- [ ] **Run full backend test suite**

```bash
cd backend && npx vitest run
```

Expected: all tests pass
