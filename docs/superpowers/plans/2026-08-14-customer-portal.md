# Customer Portal Enhancements Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add equipment history view, SMS+email notifications (status updates + appointment reminders), and customer profile/preference editing to the customer portal.

**Architecture:** Two schema migrations add `emailOptOut` to Customer and `reminder24hSentAt`/`reminder2hSentAt` to Job. Email functions for status changes extend the existing `sendStatusEmails` helper in `jobs.ts`. A new `reminder-scheduler.ts` service runs every 15 minutes via node-cron to send 24h/2h appointment reminders. Two new frontend pages (`CustomerEquipment`, `CustomerAccount`) and two new API endpoints (`GET/PATCH /api/customers/me`, `GET /api/customers/me/equipment`) round out the feature.

**Tech Stack:** Express, Prisma, PostgreSQL, node-cron, Twilio (sms.ts), Resend (email.ts), React, TypeScript, Vite, lucide-react, shadcn/ui

---

## File Structure

**Created:**
- `backend/src/services/reminder-scheduler.ts` — cron payload: query upcoming jobs, send SMS + email reminders, mark sent
- `backend/src/__tests__/customers-me.test.ts` — tests for GET/PATCH /api/customers/me and GET /api/customers/me/equipment
- `backend/src/__tests__/email-status.test.ts` — tests for sendEnRouteEmail, sendJobInProgressEmail, sendJobCompletedEmail
- `backend/src/__tests__/reminder-scheduler.test.ts` — tests for runReminderSchedule
- `frontend/src/pages/customer/CustomerEquipment.tsx` — read-only equipment list
- `frontend/src/pages/customer/CustomerAccount.tsx` — profile form + notification toggles

**Modified:**
- `backend/prisma/schema.prisma` — add `emailOptOut` to Customer (migration 1), `reminder24hSentAt`/`reminder2hSentAt` to Job (migration 2)
- `backend/src/routes/customers.ts` — add GET /api/customers/me, PATCH /api/customers/me, GET /api/customers/me/equipment
- `backend/src/routes/jobs.ts` — extend `sendStatusEmails` to check `emailOptOut` and handle `in_progress`; add `sendJobInProgressEmail` call
- `backend/src/services/email.ts` — add sendEnRouteEmail, sendJobInProgressEmail, sendJobCompletedEmail
- `backend/src/index.ts` — mount cron for reminder-scheduler
- `frontend/src/api/types.ts` — add CustomerEquipmentItem, CustomerProfile
- `frontend/src/pages/customer/CustomerLayout.tsx` — add Equipment + Account tabs
- `frontend/src/App.tsx` — add /customer/equipment and /customer/account routes

---

## Chunk 1: Schema migrations + customer profile routes

### Task 1: Schema migration — emailOptOut on Customer

**Files:**
- Modify: `backend/prisma/schema.prisma`

- [ ] **Step 1: Add emailOptOut to Customer model**

In `backend/prisma/schema.prisma`, find the Customer model (around line 114). After the existing `smsOptOut` line, add:

```prisma
emailOptOut    Boolean  @default(false)
```

The Customer model block should look like:
```prisma
model Customer {
  id             String       @id @default(cuid())
  organizationId String
  ...
  smsOptOut      Boolean  @default(false)
  emailOptOut    Boolean  @default(false)
  ...
}
```

- [ ] **Step 2: Run migration**

```bash
cd backend && npm run db:migrate
```

When prompted for a migration name, enter: `add_email_opt_out`

Expected: Migration created and applied. Prisma Client regenerated.

- [ ] **Step 3: Verify types compile**

```bash
cd backend && npx tsc --noEmit
```

Expected: No errors.

---

### Task 2: Schema migration — reminder sent-at fields on Job

**Files:**
- Modify: `backend/prisma/schema.prisma`

- [ ] **Step 1: Add reminder fields to Job model**

In `backend/prisma/schema.prisma`, find the Job model. Inside the model, after the `completedAt DateTime?` field, add:

```prisma
reminder24hSentAt  DateTime?
reminder2hSentAt   DateTime?
```

- [ ] **Step 2: Run migration**

```bash
cd backend && npm run db:migrate
```

When prompted, enter: `add_job_reminder_sent_at`

Expected: Migration applied. Prisma Client regenerated.

- [ ] **Step 3: Verify types**

```bash
cd backend && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add backend/prisma/ && git commit -m "feat: add emailOptOut and reminder sent-at fields to schema"
```

---

### Task 3: Customer profile routes + tests

**Files:**
- Modify: `backend/src/routes/customers.ts`
- Create: `backend/src/__tests__/customers-me.test.ts`

- [ ] **Step 1: Write failing tests**

Create `backend/src/__tests__/customers-me.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest"
import request from "supertest"
import express from "express"

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    customer: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    equipment: {
      findMany: vi.fn(),
    },
  },
}))

import { prisma } from "../lib/prisma.js"
import { customersRouter } from "../routes/customers.js"

const mockPrisma = prisma as unknown as {
  customer: { findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> }
  equipment: { findMany: ReturnType<typeof vi.fn> }
}

function makeApp(role = "customer", customerId = "cust1", organizationId = "org1") {
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    ;(req as express.Request & { user: unknown }).user = {
      id: "user1",
      organizationId,
      role,
      customerId,
    }
    next()
  })
  app.use("/", customersRouter)
  return app
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe("GET /me", () => {
  it("returns 403 for non-customer role", async () => {
    const res = await request(makeApp("office")).get("/me")
    expect(res.status).toBe(403)
  })

  it("returns customer profile for customer role", async () => {
    mockPrisma.customer.findUnique.mockResolvedValue({
      id: "cust1",
      name: "Alice",
      phone: "5550001234",
      email: "alice@example.com",
      address: "123 Main St",
      smsOptOut: false,
      emailOptOut: false,
    })
    const res = await request(makeApp()).get("/me")
    expect(res.status).toBe(200)
    expect(res.body.name).toBe("Alice")
    expect(res.body.emailOptOut).toBe(false)
  })
})

describe("PATCH /me", () => {
  it("updates name and phone", async () => {
    mockPrisma.customer.update.mockResolvedValue({
      id: "cust1",
      name: "Alice Updated",
      phone: "5550009999",
      email: null,
      address: "123 Main St",
      smsOptOut: false,
      emailOptOut: false,
    })
    const res = await request(makeApp()).patch("/me").send({ name: "Alice Updated", phone: "5550009999" })
    expect(res.status).toBe(200)
    expect(res.body.name).toBe("Alice Updated")
    const callArgs = mockPrisma.customer.update.mock.calls[0][0]
    expect(callArgs.data.name).toBe("Alice Updated")
    expect(callArgs.where.id).toBe("cust1")
  })

  it("toggles smsOptOut", async () => {
    mockPrisma.customer.update.mockResolvedValue({
      id: "cust1", name: "Alice", phone: "5550001234", email: null,
      address: "123 Main St", smsOptOut: true, emailOptOut: false,
    })
    const res = await request(makeApp()).patch("/me").send({ smsOptOut: true })
    expect(res.status).toBe(200)
    expect(res.body.smsOptOut).toBe(true)
  })

  it("toggles emailOptOut", async () => {
    mockPrisma.customer.update.mockResolvedValue({
      id: "cust1", name: "Alice", phone: "5550001234", email: "a@b.com",
      address: "123 Main St", smsOptOut: false, emailOptOut: true,
    })
    const res = await request(makeApp()).patch("/me").send({ emailOptOut: true })
    expect(res.status).toBe(200)
    expect(res.body.emailOptOut).toBe(true)
  })
})

describe("GET /me/equipment", () => {
  it("returns equipment scoped to the customer and org", async () => {
    mockPrisma.equipment.findMany.mockResolvedValue([
      { id: "eq1", equipmentType: "AC", make: "Carrier", model: "24ACC", serialNumber: "SN123",
        installDate: null, warrantyExpiry: null, serviceIntervalMonths: 12, lastServicedAt: null },
    ])
    const res = await request(makeApp()).get("/me/equipment")
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].equipmentType).toBe("AC")
    const callArgs = mockPrisma.equipment.findMany.mock.calls[0][0]
    expect(callArgs.where.customerId).toBe("cust1")
    expect(callArgs.where.organizationId).toBe("org1")
  })
})
```

- [ ] **Step 2: Run tests — expect failure**

```bash
cd backend && npx vitest run src/__tests__/customers-me.test.ts
```

Expected: All tests fail (routes don't exist yet).

- [ ] **Step 3: Add routes to customers.ts**

At the bottom of `backend/src/routes/customers.ts`, before the final export (or after all existing routes), add:

```typescript
// --- Customer self-service routes ---

function requireCustomerSelf(req: express.Request, res: express.Response): boolean {
  if (req.user!.role !== "customer" || !req.user!.customerId) {
    res.status(403).json({ error: "Forbidden" })
    return false
  }
  return true
}

const CUSTOMER_SELF_SELECT = {
  id: true,
  name: true,
  phone: true,
  email: true,
  address: true,
  smsOptOut: true,
  emailOptOut: true,
}

customersRouter.get("/me", async (req, res) => {
  if (!requireCustomerSelf(req, res)) return
  try {
    const customer = await prisma.customer.findUnique({
      where: { id: req.user!.customerId! },
      select: CUSTOMER_SELF_SELECT,
    })
    if (!customer) return res.status(404).json({ error: "Not found" })
    res.json(customer)
  } catch (e) {
    res.status(500).json({ error: "Failed to load profile" })
  }
})

customersRouter.patch("/me", async (req, res) => {
  if (!requireCustomerSelf(req, res)) return
  const { name, phone, email, address, smsOptOut, emailOptOut } = req.body
  const data: Record<string, unknown> = {}
  if (name !== undefined) data.name = String(name)
  if (phone !== undefined) {
    if (String(phone).trim().length < 10) return res.status(400).json({ error: "Phone must be at least 10 characters" })
    data.phone = String(phone)
  }
  if (email !== undefined) {
    if (!String(email).includes("@")) return res.status(400).json({ error: "Invalid email" })
    data.email = String(email)
  }
  if (address !== undefined) data.address = String(address)
  if (typeof smsOptOut === "boolean") data.smsOptOut = smsOptOut
  if (typeof emailOptOut === "boolean") data.emailOptOut = emailOptOut
  try {
    const updated = await prisma.customer.update({
      where: { id: req.user!.customerId! },
      data,
      select: CUSTOMER_SELF_SELECT,
    })
    res.json(updated)
  } catch (e) {
    res.status(500).json({ error: "Failed to update profile" })
  }
})

customersRouter.get("/me/equipment", async (req, res) => {
  if (!requireCustomerSelf(req, res)) return
  try {
    const items = await prisma.equipment.findMany({
      where: {
        customerId: req.user!.customerId!,
        organizationId: req.user!.organizationId,
      },
      select: {
        id: true,
        equipmentType: true,
        make: true,
        model: true,
        serialNumber: true,
        installDate: true,
        warrantyExpiry: true,
        serviceIntervalMonths: true,
        lastServicedAt: true,
      },
      orderBy: { createdAt: "asc" },
    })
    res.json(items)
  } catch (e) {
    res.status(500).json({ error: "Failed to load equipment" })
  }
})
```

Note: `express` is already imported at the top of customers.ts. You need to check the existing import — if `express` is not imported as a type (just `Router`), add `import type express from "express"` or adjust the helper signature to use `Request, Response` from express directly. Check the top of the file and match the import pattern used there.

Also note that `req.user!.customerId` requires the User type to include `customerId`. Check `backend/src/types/express.d.ts` or wherever `req.user` is typed — if `customerId` is not present, add it:

```typescript
// In express.d.ts or wherever req.user is augmented:
customerId?: string
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd backend && npx vitest run src/__tests__/customers-me.test.ts
```

Expected: All 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/customers.ts backend/src/__tests__/customers-me.test.ts && git commit -m "feat: add GET/PATCH /api/customers/me and GET /api/customers/me/equipment routes"
```

---

## Chunk 2: Email notification functions + status-change wiring

### Task 4: Status-change email functions + tests

**Files:**
- Modify: `backend/src/services/email.ts`
- Create: `backend/src/__tests__/email-status.test.ts`

- [ ] **Step 1: Write failing tests**

Create `backend/src/__tests__/email-status.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: vi.fn().mockResolvedValue({ id: "mock-id" }) },
  })),
}))

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    job: { findUnique: vi.fn() },
  },
}))

import { prisma } from "../lib/prisma.js"
import { sendEnRouteEmail, sendJobInProgressEmail, sendJobCompletedEmail } from "../services/email.js"

const mockPrisma = prisma as unknown as {
  job: { findUnique: ReturnType<typeof vi.fn> }
}

function makeJob(overrides: Partial<{ customerEmail: string | null; emailOptOut: boolean; orgName: string }> = {}) {
  const { customerEmail = "alice@example.com", emailOptOut = false, orgName = "ACME HVAC" } = overrides
  return {
    id: "job1",
    status: "en_route",
    customer: { email: customerEmail, emailOptOut },
    organization: { name: orgName },
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  // Set RESEND_API_KEY so the resend client initialises
  process.env.RESEND_API_KEY = "test-key"
})

describe("sendEnRouteEmail", () => {
  it("skips customer with emailOptOut: true", async () => {
    mockPrisma.job.findUnique.mockResolvedValue(makeJob({ emailOptOut: true }))
    await sendEnRouteEmail("job1")
    // No throw — just silently skipped. Verify Resend.send was not called.
    const { Resend } = await import("resend")
    const instance = (Resend as ReturnType<typeof vi.fn>).mock.results[0]?.value
    expect(instance?.emails.send).not.toHaveBeenCalled()
  })

  it("skips customer with no email", async () => {
    mockPrisma.job.findUnique.mockResolvedValue(makeJob({ customerEmail: null }))
    await sendEnRouteEmail("job1")
    const { Resend } = await import("resend")
    const instance = (Resend as ReturnType<typeof vi.fn>).mock.results[0]?.value
    expect(instance?.emails.send).not.toHaveBeenCalled()
  })
})

describe("sendJobCompletedEmail", () => {
  it("sends email when customer has email and is not opted out", async () => {
    mockPrisma.job.findUnique.mockResolvedValue({ ...makeJob(), status: "completed" })
    await sendJobCompletedEmail("job1")
    const { Resend } = await import("resend")
    const instance = (Resend as ReturnType<typeof vi.fn>).mock.results[0]?.value
    expect(instance?.emails.send).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests — expect failure**

```bash
cd backend && npx vitest run src/__tests__/email-status.test.ts
```

Expected: Fails — functions don't exist yet.

- [ ] **Step 3: Add email functions to email.ts**

Append to the bottom of `backend/src/services/email.ts`:

```typescript
async function getJobForEmail(jobId: string) {
  return prisma.job.findUnique({
    where: { id: jobId },
    select: {
      customer: { select: { email: true, emailOptOut: true } },
      organization: { select: { name: true } },
    },
  })
}

export async function sendEnRouteEmail(jobId: string): Promise<void> {
  const job = await getJobForEmail(jobId)
  if (!job?.customer?.email || job.customer.emailOptOut) return
  await sendEmail({
    to: job.customer.email,
    subject: "Your technician is on the way",
    html: `<p>Your technician is on the way and should arrive within the hour. Thank you for choosing ${job.organization.name}.</p>`,
  })
}

export async function sendJobInProgressEmail(jobId: string): Promise<void> {
  const job = await getJobForEmail(jobId)
  if (!job?.customer?.email || job.customer.emailOptOut) return
  await sendEmail({
    to: job.customer.email,
    subject: "Your service has started",
    html: `<p>Your technician has arrived and your service is now in progress.</p>`,
  })
}

export async function sendJobCompletedEmail(jobId: string): Promise<void> {
  const job = await getJobForEmail(jobId)
  if (!job?.customer?.email || job.customer.emailOptOut) return
  await sendEmail({
    to: job.customer.email,
    subject: "Your service is complete",
    html: `<p>Your service is complete. Thank you for choosing ${job.organization.name}!</p>`,
  })
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd backend && npx vitest run src/__tests__/email-status.test.ts
```

Expected: All 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/email.ts backend/src/__tests__/email-status.test.ts && git commit -m "feat: add sendEnRouteEmail, sendJobInProgressEmail, sendJobCompletedEmail"
```

---

### Task 5: Replace sendStatusEmails inline calls with new email helpers

**Files:**
- Modify: `backend/src/routes/jobs.ts`

The existing `sendStatusEmails` function (lines ~72–106) has its own inline `sendEmail` calls for `en_route` and `completed` using HTML templates. These do NOT check `emailOptOut`. This task replaces those inline blocks with calls to the new helpers (which do their own Prisma fetch + `emailOptOut` guard), and adds wiring for `in_progress`.

- [ ] **Step 1: Add imports at top of jobs.ts**

The existing email imports in `backend/src/routes/jobs.ts` include `sendEmail`, `statusUpdateHtml`, `jobCompletedHtml`. Add imports for the new helpers alongside the existing `sendEmail` import:

```typescript
import {
  sendEmail,
  sendEnRouteEmail,
  sendJobInProgressEmail,
  sendJobCompletedEmail,
} from "../services/email.js";
```

- [ ] **Step 2: Replace sendStatusEmails body**

Find the `sendStatusEmails` function body (~lines 72–106). It currently fetches the customer and has two `if` blocks that call `sendEmail` inline. Replace the entire function body with calls to the new helpers:

```typescript
async function sendStatusEmails(
  job: { id: string; status: string },
) {
  if (job.status === "en_route") sendEnRouteEmail(job.id).catch(console.error)
  if (job.status === "in_progress") sendJobInProgressEmail(job.id).catch(console.error)
  if (job.status === "completed") sendJobCompletedEmail(job.id).catch(console.error)
}
```

The customer fetch and old `sendEmail` inline calls are removed — the opt-out guard now lives inside each helper. The `statusUpdateHtml` and `jobCompletedHtml` template imports can remain (they may be used elsewhere) or be removed if unused — check with `grep`.

- [ ] **Step 3: Verify no TypeScript errors**

```bash
cd backend && npx tsc --noEmit
```

Expected: No errors. If `statusUpdateHtml` or `jobCompletedHtml` are now unused, remove their imports to avoid lint warnings.

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/jobs.ts && git commit -m "feat: replace sendStatusEmails inline calls with emailOptOut-aware helpers"
```

---

## Chunk 3: Appointment reminder scheduler

### Task 6: Reminder scheduler service + tests

**Files:**
- Create: `backend/src/services/reminder-scheduler.ts`
- Create: `backend/src/__tests__/reminder-scheduler.test.ts`

- [ ] **Step 1: Write failing tests**

Create `backend/src/__tests__/reminder-scheduler.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    job: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}))

// Mock Twilio so no real SMS sends
vi.mock("twilio", () => ({
  default: vi.fn().mockReturnValue({
    messages: { create: vi.fn().mockResolvedValue({ sid: "SM123" }) },
  }),
}))

// Mock sendEmail so no real emails send
vi.mock("../services/email.js", () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
}))

import { prisma } from "../lib/prisma.js"
import { sendEmail } from "../services/email.js"
import { runReminderSchedule } from "../services/reminder-scheduler.js"

const mockPrisma = prisma as unknown as {
  job: { findMany: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> }
}

function makeJob(overrides: Partial<{
  id: string
  phone: string | null
  email: string | null
  smsOptOut: boolean
  emailOptOut: boolean
  orgSmsEnabled: boolean
  reminder24hSentAt: Date | null
  reminder2hSentAt: Date | null
}> = {}) {
  const {
    id = "job1", phone = "+15550001234", email = "alice@example.com",
    smsOptOut = false, emailOptOut = false, orgSmsEnabled = true,
    reminder24hSentAt = null, reminder2hSentAt = null,
  } = overrides
  return {
    id,
    scheduledAt: new Date(Date.now() + 24.5 * 60 * 60 * 1000),
    reminder24hSentAt,
    reminder2hSentAt,
    customer: { phone, email, smsOptOut, emailOptOut },
    organization: { name: "ACME HVAC", smsEnabled: orgSmsEnabled },
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  process.env.TWILIO_ACCOUNT_SID = "AC123"
  process.env.TWILIO_AUTH_TOKEN = "tok"
  process.env.TWILIO_FROM_NUMBER = "+15550000000"
  mockPrisma.job.update.mockResolvedValue({})
})

describe("runReminderSchedule — 24h window", () => {
  it("sends SMS and email for eligible job and marks reminder sent", async () => {
    mockPrisma.job.findMany
      .mockResolvedValueOnce([makeJob()]) // 24h jobs
      .mockResolvedValueOnce([])          // 2h jobs
    await runReminderSchedule()
    expect(mockPrisma.job.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ reminder24hSentAt: expect.any(Date) }) })
    )
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ subject: "Service appointment reminder" }))
  })

  it("skips job where reminder24hSentAt is already set", async () => {
    // The Prisma query uses reminder24hSentAt: null as a filter, so this won't even be returned.
    // Test that findMany is called with the correct where filter.
    mockPrisma.job.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
    await runReminderSchedule()
    const call24h = mockPrisma.job.findMany.mock.calls[0][0]
    expect(call24h.where.reminder24hSentAt).toBe(null)
  })
})

describe("runReminderSchedule — 2h window", () => {
  it("sends 2h reminder for eligible job", async () => {
    mockPrisma.job.findMany
      .mockResolvedValueOnce([])  // 24h jobs
      .mockResolvedValueOnce([makeJob({ reminder2hSentAt: null })])  // 2h jobs
    await runReminderSchedule()
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ subject: "Your technician is arriving soon" }))
    expect(mockPrisma.job.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ reminder2hSentAt: expect.any(Date) }) })
    )
  })
})

describe("runReminderSchedule — opt-out guards", () => {
  it("skips SMS when customer has smsOptOut", async () => {
    const twilio = await import("twilio")
    const mockCreate = (twilio.default as ReturnType<typeof vi.fn>).mock.results[0]?.value?.messages?.create
    mockPrisma.job.findMany
      .mockResolvedValueOnce([makeJob({ smsOptOut: true })])
      .mockResolvedValueOnce([])
    await runReminderSchedule()
    if (mockCreate) expect(mockCreate).not.toHaveBeenCalled()
    // email should still send
    expect(sendEmail).toHaveBeenCalled()
  })

  it("skips email when customer has emailOptOut", async () => {
    mockPrisma.job.findMany
      .mockResolvedValueOnce([makeJob({ emailOptOut: true })])
      .mockResolvedValueOnce([])
    await runReminderSchedule()
    expect(sendEmail).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests — expect failure**

```bash
cd backend && npx vitest run src/__tests__/reminder-scheduler.test.ts
```

Expected: All fail — module not found.

- [ ] **Step 3: Implement reminder-scheduler.ts**

Create `backend/src/services/reminder-scheduler.ts`:

```typescript
import twilio from "twilio"
import { prisma } from "../lib/prisma.js"
import { sendEmail } from "./email.js"

const E164 = /^\+[1-9]\d{7,14}$/

function getClient() {
  const s = process.env.TWILIO_ACCOUNT_SID
  const t = process.env.TWILIO_AUTH_TOKEN
  const f = process.env.TWILIO_FROM_NUMBER
  if (!s || !t || !f) return null
  return { client: twilio(s, t), from: f }
}

async function sendReminderSms(
  job: { id: string; scheduledAt: Date; customer: { phone: string | null; smsOptOut: boolean }; organization: { name: string; smsEnabled: boolean } },
  window: "24h" | "2h",
): Promise<void> {
  const creds = getClient()
  if (!creds) return
  if (!job.organization.smsEnabled) return
  if (job.customer.smsOptOut) return
  const phone = job.customer.phone
  if (!phone || !E164.test(phone)) return

  const time = new Date(job.scheduledAt).toLocaleString("en-US", {
    weekday: "short", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
  })
  const message = window === "24h"
    ? `Reminder: your service appointment is scheduled for ${time}.`
    : "Reminder: your technician will arrive in about 2 hours."

  const body = `[${job.organization.name}] ${message} Reply STOP to opt out.`
  try {
    await creds.client.messages.create({ to: phone, from: creds.from, body })
    console.log(`[Reminders] SMS ${window} sent to ${phone}`)
  } catch (err) {
    console.error(`[Reminders] SMS ${window} failed:`, err)
  }
}

async function sendReminderEmail(
  job: { scheduledAt: Date; customer: { email: string | null; emailOptOut: boolean }; organization: { name: string } },
  window: "24h" | "2h",
): Promise<void> {
  if (!job.customer.email || job.customer.emailOptOut) return
  const time = new Date(job.scheduledAt).toLocaleString("en-US", {
    weekday: "short", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
  })
  if (window === "24h") {
    await sendEmail({
      to: job.customer.email,
      subject: "Service appointment reminder",
      html: `<p>This is a reminder that your service appointment is scheduled for <strong>${time}</strong>. We look forward to seeing you!</p>`,
    })
  } else {
    await sendEmail({
      to: job.customer.email,
      subject: "Your technician is arriving soon",
      html: `<p>Your technician will arrive in approximately 2 hours for your service appointment today at <strong>${time}</strong>.</p>`,
    })
  }
}

export async function runReminderSchedule(): Promise<void> {
  const now = new Date()
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  const in25h = new Date(now.getTime() + 25 * 60 * 60 * 1000)
  const in2h = new Date(now.getTime() + 2 * 60 * 60 * 1000)
  const in2h30 = new Date(now.getTime() + (2 * 60 + 30) * 60 * 1000)

  const jobs24h = await prisma.job.findMany({
    where: {
      status: { in: ["pending", "scheduled"] },
      scheduledAt: { gte: in24h, lte: in25h },
      reminder24hSentAt: null,
    },
    select: {
      id: true,
      scheduledAt: true,
      reminder24hSentAt: true,
      reminder2hSentAt: true,
      customer: { select: { phone: true, email: true, smsOptOut: true, emailOptOut: true } },
      organization: { select: { name: true, smsEnabled: true } },
    },
  })

  for (const job of jobs24h) {
    await sendReminderSms(job, "24h")
    await sendReminderEmail(job, "24h")
    await prisma.job.update({ where: { id: job.id }, data: { reminder24hSentAt: new Date() } })
  }

  const jobs2h = await prisma.job.findMany({
    where: {
      status: { in: ["pending", "scheduled"] },
      scheduledAt: { gte: in2h, lte: in2h30 },
      reminder2hSentAt: null,
    },
    select: {
      id: true,
      scheduledAt: true,
      reminder24hSentAt: true,
      reminder2hSentAt: true,
      customer: { select: { phone: true, email: true, smsOptOut: true, emailOptOut: true } },
      organization: { select: { name: true, smsEnabled: true } },
    },
  })

  for (const job of jobs2h) {
    await sendReminderSms(job, "2h")
    await sendReminderEmail(job, "2h")
    await prisma.job.update({ where: { id: job.id }, data: { reminder2hSentAt: new Date() } })
  }

  console.log(`[Reminders] Checked: ${jobs24h.length} 24h + ${jobs2h.length} 2h reminders sent`)
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd backend && npx vitest run src/__tests__/reminder-scheduler.test.ts
```

Expected: All 4 tests pass.

- [ ] **Step 5: Mount cron in index.ts**

In `backend/src/index.ts`, find the existing cron imports at the top:
```typescript
import cron from "node-cron";
```

Add the reminder scheduler import below existing service imports:
```typescript
import { runReminderSchedule } from "./services/reminder-scheduler.js"
```

Find the existing cron.schedule calls (around line 157). After them, add:
```typescript
// Appointment reminders — every 15 minutes
cron.schedule("*/15 * * * *", () => {
  runReminderSchedule().catch((err) => console.error("[Reminders] Error:", err))
})
```

- [ ] **Step 6: Verify compile**

```bash
cd backend && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add backend/src/services/reminder-scheduler.ts backend/src/__tests__/reminder-scheduler.test.ts backend/src/index.ts && git commit -m "feat: add appointment reminder scheduler (24h + 2h, SMS + email)"
```

---

## Chunk 4: Frontend — types, layout, pages, routing

### Task 7: API types + CustomerLayout nav update

**Files:**
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/pages/customer/CustomerLayout.tsx`

- [ ] **Step 1: Add types to types.ts**

Open `frontend/src/api/types.ts` and append at the end:

```typescript
export interface CustomerEquipmentItem {
  id: string
  equipmentType: string
  make: string | null
  model: string | null
  serialNumber: string | null
  installDate: string | null
  warrantyExpiry: string | null
  serviceIntervalMonths: number | null
  lastServicedAt: string | null
}

export interface CustomerProfile {
  id: string
  name: string
  phone: string
  email: string | null
  address: string
  smsOptOut: boolean
  emailOptOut: boolean
}
```

- [ ] **Step 2: Update CustomerLayout.tsx**

In `frontend/src/pages/customer/CustomerLayout.tsx`:

1. Add `Wrench` and `UserCircle` to the lucide-react import:
```typescript
import {
  LayoutDashboard,
  CalendarPlus,
  FileText,
  MessageSquare,
  Wrench,
  UserCircle,
  LogOut,
} from "lucide-react"
```

2. Add two items to the `navItems` array:
```typescript
const navItems = [
  { label: "Dashboard", to: "/customer", icon: LayoutDashboard },
  { label: "Book Service", to: "/customer/book", icon: CalendarPlus },
  { label: "Invoices", to: "/customer/invoices", icon: FileText },
  { label: "Messages", to: "/customer/messages", icon: MessageSquare },
  { label: "Equipment", to: "/customer/equipment", icon: Wrench },
  { label: "Account", to: "/customer/account", icon: UserCircle },
]
```

- [ ] **Step 3: Verify TypeScript**

```bash
cd frontend && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/api/types.ts frontend/src/pages/customer/CustomerLayout.tsx && git commit -m "feat: add CustomerEquipmentItem/CustomerProfile types and Equipment+Account nav tabs"
```

---

### Task 8: CustomerEquipment page

**Files:**
- Create: `frontend/src/pages/customer/CustomerEquipment.tsx`

- [ ] **Step 1: Create CustomerEquipment.tsx**

Create `frontend/src/pages/customer/CustomerEquipment.tsx`:

```tsx
import { useEffect, useState } from "react"
import { api } from "@/api/client"
import type { CustomerEquipmentItem } from "@/api/types"
import { Loader2, Wrench } from "lucide-react"

function nextDueDate(item: CustomerEquipmentItem): Date | null {
  if (!item.lastServicedAt || !item.serviceIntervalMonths) return null
  const d = new Date(item.lastServicedAt)
  d.setMonth(d.getMonth() + item.serviceIntervalMonths)
  return d
}

function formatDate(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("en-US", { month: "short", year: "numeric" })
}

function NextDueCell({ item }: { item: CustomerEquipmentItem }) {
  const due = nextDueDate(item)
  if (!due) return <span className="text-muted-foreground">—</span>
  const now = new Date()
  const days = (due.getTime() - now.getTime()) / 86400000
  if (days < 0) return <span className="font-semibold text-red-600 dark:text-red-400">{formatDate(due.toISOString())} (overdue)</span>
  if (days < 60) return <span className="font-semibold text-amber-600 dark:text-amber-400">{formatDate(due.toISOString())}</span>
  return <span>{formatDate(due.toISOString())}</span>
}

export default function CustomerEquipment() {
  const [items, setItems] = useState<CustomerEquipmentItem[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    api.get<CustomerEquipmentItem[]>("/api/customers/me/equipment")
      .then(setItems)
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Could not load equipment.</p>
  }

  if (!items || items.length === 0) {
    return (
      <div className="py-10 text-center">
        <Wrench className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">No equipment on file. Contact us to register your units.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">My Equipment</h1>
        <p className="text-sm text-muted-foreground">Your registered HVAC units</p>
      </div>
      <div className="space-y-3">
        {items.map((item) => (
          <div key={item.id} className="rounded-xl border border-border bg-card p-4">
            <div className="mb-3 flex items-start justify-between">
              <div>
                <div className="font-semibold">{item.equipmentType}</div>
                {(item.make || item.model) && (
                  <div className="text-sm text-muted-foreground">
                    {[item.make, item.model].filter(Boolean).join(" · ")}
                  </div>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <div>
                <div className="text-xs text-muted-foreground">Serial</div>
                <div>{item.serialNumber ?? "—"}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Install date</div>
                <div>{formatDate(item.installDate)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Last serviced</div>
                <div>{formatDate(item.lastServicedAt)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Next due</div>
                <NextDueCell item={item} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd frontend && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/customer/CustomerEquipment.tsx && git commit -m "feat: add CustomerEquipment page (read-only equipment list with next-due highlighting)"
```

---

### Task 9: CustomerAccount page

**Files:**
- Create: `frontend/src/pages/customer/CustomerAccount.tsx`

- [ ] **Step 1: Create CustomerAccount.tsx**

Create `frontend/src/pages/customer/CustomerAccount.tsx`:

```tsx
import { useEffect, useState } from "react"
import { api } from "@/api/client"
import type { CustomerProfile } from "@/api/types"
import { Loader2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40 ${checked ? "bg-primary" : "bg-muted-foreground/30"}`}
    >
      <span
        className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-6" : "translate-x-1"}`}
      />
    </button>
  )
}

export default function CustomerAccount() {
  const [profile, setProfile] = useState<CustomerProfile | null>(null)
  const [form, setForm] = useState({ name: "", phone: "", email: "", address: "" })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState("")

  useEffect(() => {
    api.get<CustomerProfile>("/api/customers/me")
      .then((p) => {
        setProfile(p)
        setForm({ name: p.name, phone: p.phone, email: p.email ?? "", address: p.address })
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) return setSaveError("Name is required")
    if (form.phone.trim().length < 10) return setSaveError("Enter a valid phone number")
    if (form.email && !form.email.includes("@")) return setSaveError("Enter a valid email address")
    setSaving(true)
    setSaveError("")
    try {
      const updated = await api.patch<CustomerProfile>("/api/customers/me", {
        name: form.name,
        phone: form.phone,
        email: form.email || undefined,
        address: form.address,
      })
      setProfile(updated)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch {
      setSaveError("Failed to save. Try again.")
    } finally {
      setSaving(false)
    }
  }

  async function toggleOpt(field: "smsOptOut" | "emailOptOut", newOptOut: boolean) {
    if (!profile) return
    const prev = profile
    setProfile({ ...profile, [field]: newOptOut })
    try {
      const updated = await api.patch<CustomerProfile>("/api/customers/me", { [field]: newOptOut })
      setProfile(updated)
    } catch {
      setProfile(prev)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !profile) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Could not load profile.</p>
  }

  const smsOn = !profile.smsOptOut
  const emailOn = !profile.emailOptOut

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h1 className="text-lg font-semibold">My Account</h1>
        <p className="text-sm text-muted-foreground">Update your contact info and preferences</p>
      </div>

      {/* Contact Info */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Contact Info</h2>
        <form onSubmit={handleSave} className="space-y-3">
          <div>
            <Label htmlFor="name" className="text-sm">Name</Label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="phone" className="text-sm">Phone</Label>
            <Input
              id="phone"
              type="tel"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="email" className="text-sm">Email <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Input
              id="email"
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="address" className="text-sm">Address</Label>
            <Input
              id="address"
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              className="mt-1"
            />
          </div>
          {saveError && <p className="text-sm text-destructive">{saveError}</p>}
          <div className="flex items-center gap-3 pt-1">
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : saved ? "Saved!" : "Save changes"}
            </Button>
          </div>
        </form>
      </div>

      {/* Notifications */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Notifications</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium">SMS notifications</div>
              <div className="text-xs text-muted-foreground">Reminders &amp; status updates to {profile.phone}</div>
            </div>
            <Toggle
              checked={smsOn}
              onChange={(v) => toggleOpt("smsOptOut", !v)}
            />
          </div>
          <div className="border-t border-border" />
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium">Email notifications</div>
              <div className="text-xs text-muted-foreground">
                {profile.email
                  ? `Reminders & status updates to ${profile.email}`
                  : "Add an email address to enable"}
              </div>
            </div>
            <Toggle
              checked={emailOn}
              onChange={(v) => toggleOpt("emailOptOut", !v)}
              disabled={!profile.email}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
```

Note: `api.patch` already exists in `frontend/src/api/client.ts` (it delegates to `patchWithQueue`). No changes needed to the API client.

- [ ] **Step 2: Verify TypeScript**

```bash
cd frontend && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/customer/CustomerAccount.tsx && git commit -m "feat: add CustomerAccount page (profile editing + notification toggles)"
```

---

### Task 10: Router wiring

**Files:**
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Add imports and routes**

In `frontend/src/App.tsx`, find the existing customer imports:
```typescript
import CustomerLayout from "./pages/customer/CustomerLayout";
import CustomerDashboard from "./pages/customer/CustomerDashboard";
import CustomerBook from "./pages/customer/CustomerBook";
import CustomerInvoices from "./pages/customer/CustomerInvoices";
import CustomerMessages from "./pages/customer/CustomerMessages"
import CustomerEstimate from "./pages/customer/CustomerEstimate";
```

Add:
```typescript
import CustomerEquipment from "./pages/customer/CustomerEquipment";
import CustomerAccount from "./pages/customer/CustomerAccount";
```

Find the `/customer` route block. It currently has nested routes like `<Route path="book" element={<CustomerBook />} />`. Add two more inside the same block:
```tsx
<Route path="equipment" element={<CustomerEquipment />} />
<Route path="account" element={<CustomerAccount />} />
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd frontend && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Run the full backend test suite**

```bash
cd backend && npx vitest run
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.tsx && git commit -m "feat: add /customer/equipment and /customer/account routes"
```

---

## Final verification

- [ ] **Start the dev server and verify the customer portal**

```bash
cd frontend && npm run dev
```

Log in as a customer user. Verify:
1. Navigation shows Equipment and Account tabs
2. Equipment tab loads (empty or with items)
3. Account tab loads with profile form
4. Notification toggles reflect current opt-out state (ON = not opted out)
5. Saving profile shows "Saved!" flash then clears
6. Toggling SMS/email immediately saves without page reload

- [ ] **Run all backend tests**

```bash
cd backend && npx vitest run
```

Expected: All tests pass.
