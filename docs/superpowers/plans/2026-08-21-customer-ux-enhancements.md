# Customer UX Enhancements Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add availability windows, customer job cancellation, and post-job star reviews to FlowSense.

**Architecture:** Three independent features layered onto the existing job/customer lifecycle. Availability is stored as JSON on Organization + a new BlockedDate model. Cancellation is a new `POST /api/jobs/:id/cancel` route. Reviews use a new JobReview model exposed via `POST /api/jobs/:id/review` and `GET /api/reviews`.

**Tech Stack:** Express, Prisma, PostgreSQL, React, TypeScript, Vitest, Supertest, Zod

**Spec:** `docs/superpowers/specs/2026-08-21-customer-ux-enhancements-design.md`

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `backend/prisma/schema.prisma` | Modify | Add `availabilitySchedule` to Org, `BlockedDate` model, `JobReview` model |
| `backend/src/routes/availability.ts` | Create | GET/PUT schedule, POST/DELETE blocked dates |
| `backend/src/__tests__/availability.test.ts` | Create | 6 tests |
| `backend/src/routes/jobs.ts` | Modify | Add `POST /:id/cancel`, `POST /:id/review`; extend GET to include review |
| `backend/src/__tests__/jobs-cancel.test.ts` | Create | 4 tests for cancel route |
| `backend/src/__tests__/reviews.test.ts` | Create | 7 tests for review routes |
| `backend/src/routes/reviews.ts` | Create | GET /api/reviews (office only) |
| `backend/src/services/org-notifications.ts` | Modify | Add `notifyOfficeCancellation` |
| `backend/src/index.ts` | Modify | Mount availabilityRouter and reviewsRouter |
| `frontend/src/api/types.ts` | Modify | Add AvailabilitySchedule, BlockedDate, JobReview; extend CustomerJobHistoryItem |
| `frontend/src/pages/office/OfficeSettings.tsx` | Modify | Add Availability section card |
| `frontend/src/pages/customer/CustomerBook.tsx` | Modify | Fetch availability, constrain date/time inputs |
| `frontend/src/pages/customer/CustomerHistory.tsx` | Modify | Cancel button for pending/scheduled; review UI for completed |
| `frontend/src/pages/office/OfficeCustomers.tsx` | Modify | Reviews section in customer detail |

---

## Chunk 1: Schema + Migration

### Task 1: Schema migration — BlockedDate, JobReview, availabilitySchedule

**Files:**
- Modify: `backend/prisma/schema.prisma`

**Context:**
- `Organization` model already exists — add `availabilitySchedule Json?` field and `blockedDates BlockedDate[]` and `reviews JobReview[]` back-relations
- `Job` model already exists — add `review JobReview?` back-relation
- `Customer` model already exists — add `reviews JobReview[]` back-relation
- Run: `cd backend && npx prisma migrate dev --name add_availability_and_reviews`

- [ ] **Step 1: Add schema changes**

Add to `Organization` model (after existing fields):
```prisma
availabilitySchedule Json?
blockedDates         BlockedDate[]
reviews              JobReview[]
```

Add new `BlockedDate` model after `Organization`:
```prisma
model BlockedDate {
  id             String       @id @default(cuid())
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  date           DateTime
  reason         String?
  createdAt      DateTime     @default(now())

  @@unique([organizationId, date])
  @@index([organizationId])
}
```

Add to `Job` model (after existing fields):
```prisma
review JobReview?
```

Add new `JobReview` model after `Job`:
```prisma
model JobReview {
  id             String       @id @default(cuid())
  jobId          String       @unique
  job            Job          @relation(fields: [jobId], references: [id], onDelete: Cascade)
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  customerId     String
  customer       Customer     @relation(fields: [customerId], references: [id], onDelete: Cascade)
  rating         Int
  comment        String?
  createdAt      DateTime     @default(now())

  @@index([organizationId])
  @@index([customerId])
}
```

Add to `Customer` model:
```prisma
reviews JobReview[]
```

- [ ] **Step 2: Run migration**

```bash
cd backend && npx prisma migrate dev --name add_availability_and_reviews
```

Expected: Migration created and applied. Prisma client regenerated.

- [ ] **Step 3: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/
git commit -m "feat: add BlockedDate and JobReview schema + availabilitySchedule on Org"
```

---

## Chunk 2: Availability Routes + Tests

### Task 2: Availability routes + tests

**Files:**
- Create: `backend/src/routes/availability.ts`
- Create: `backend/src/__tests__/availability.test.ts`

**Context:**
- Pattern: see `backend/src/routes/maintenance-plans.ts` for how routes are structured
- Auth pattern: `req.user!.role`, `req.user!.organizationId` — both always present in JWT
- `getOrgDispatch` is in `org-notifications.ts` but not needed here — use `prisma.organization` directly
- Full schedule body required — 7 keys: `mon tue wed thu fri sat sun`

- [ ] **Step 1: Write failing tests**

Create `backend/src/__tests__/availability.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest"
import request from "supertest"
import express from "express"

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    organization: { findUnique: vi.fn(), update: vi.fn() },
    blockedDate: {
      findMany: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      delete: vi.fn(),
    },
  },
}))

import { prisma } from "../lib/prisma.js"
import { availabilityRouter } from "../routes/availability.js"

const mockPrisma = prisma as unknown as {
  organization: { findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> }
  blockedDate: {
    findMany: ReturnType<typeof vi.fn>
    create: ReturnType<typeof vi.fn>
    findFirst: ReturnType<typeof vi.fn>
    delete: ReturnType<typeof vi.fn>
  }
}

function makeApp(role = "office", orgId = "org1") {
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    ;(req as express.Request & { user: unknown }).user = { userId: "u1", organizationId: orgId, role }
    next()
  })
  app.use("/", availabilityRouter)
  return app
}

const fullSchedule = {
  mon: { open: "08:00", close: "17:00" },
  tue: { open: "08:00", close: "17:00" },
  wed: { open: "08:00", close: "17:00" },
  thu: { open: "08:00", close: "17:00" },
  fri: { open: "08:00", close: "17:00" },
  sat: null,
  sun: null,
}

beforeEach(() => { vi.clearAllMocks() })

describe("GET /", () => {
  it("returns schedule and future blocked dates", async () => {
    mockPrisma.organization.findUnique.mockResolvedValue({ availabilitySchedule: fullSchedule })
    mockPrisma.blockedDate.findMany.mockResolvedValue([
      { id: "bd1", date: new Date("2026-12-25"), reason: "Christmas", createdAt: new Date() },
    ])
    const res = await request(makeApp()).get("/")
    expect(res.status).toBe(200)
    expect(res.body.schedule).toEqual(fullSchedule)
    expect(res.body.blockedDates).toHaveLength(1)
  })
})

describe("PUT /schedule", () => {
  it("returns 403 for non-office role", async () => {
    const res = await request(makeApp("customer")).put("/schedule").send(fullSchedule)
    expect(res.status).toBe(403)
  })

  it("replaces org availabilitySchedule", async () => {
    mockPrisma.organization.update.mockResolvedValue({ availabilitySchedule: fullSchedule })
    const res = await request(makeApp()).put("/schedule").send(fullSchedule)
    expect(res.status).toBe(200)
    expect(mockPrisma.organization.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { availabilitySchedule: fullSchedule } })
    )
  })
})

describe("POST /blocked-dates", () => {
  it("returns 403 for non-office role", async () => {
    const res = await request(makeApp("customer")).post("/blocked-dates").send({ date: "2026-12-25" })
    expect(res.status).toBe(403)
  })

  it("creates a blocked date and returns 409 on duplicate", async () => {
    mockPrisma.blockedDate.create.mockResolvedValue({ id: "bd1", date: new Date("2026-12-25"), reason: null, createdAt: new Date() })
    const res = await request(makeApp()).post("/blocked-dates").send({ date: "2026-12-25" })
    expect(res.status).toBe(201)
    expect(mockPrisma.blockedDate.create).toHaveBeenCalled()

    // 409 on duplicate (Prisma unique constraint error)
    mockPrisma.blockedDate.create.mockRejectedValue(Object.assign(new Error(), { code: "P2002" }))
    const res2 = await request(makeApp()).post("/blocked-dates").send({ date: "2026-12-25" })
    expect(res2.status).toBe(409)
  })
})

describe("DELETE /blocked-dates/:id", () => {
  it("removes a blocked date", async () => {
    mockPrisma.blockedDate.findFirst.mockResolvedValue({ id: "bd1" })
    mockPrisma.blockedDate.delete.mockResolvedValue({ id: "bd1" })
    const res = await request(makeApp()).delete("/blocked-dates/bd1")
    expect(res.status).toBe(204)
    expect(mockPrisma.blockedDate.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: "bd1", organizationId: "org1" }) })
    )
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && npx vitest run src/__tests__/availability.test.ts
```

Expected: FAIL — `availabilityRouter` not found

- [ ] **Step 3: Implement availability routes**

Create `backend/src/routes/availability.ts`:

```typescript
import { Router } from "express"
import { prisma } from "../lib/prisma.js"
import { z } from "zod"

export const availabilityRouter = Router()

const daySchema = z.object({ open: z.string().regex(/^\d{2}:\d{2}$/), close: z.string().regex(/^\d{2}:\d{2}$/) }).nullable()
const scheduleSchema = z.object({
  mon: daySchema, tue: daySchema, wed: daySchema, thu: daySchema,
  fri: daySchema, sat: daySchema, sun: daySchema,
})

availabilityRouter.get("/", async (req, res) => {
  try {
    const org = await prisma.organization.findUnique({
      where: { id: req.user!.organizationId },
      select: { availabilitySchedule: true },
    })
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const blockedDates = await prisma.blockedDate.findMany({
      where: { organizationId: req.user!.organizationId, date: { gte: today } },
      orderBy: { date: "asc" },
    })
    return res.json({ schedule: org?.availabilitySchedule ?? null, blockedDates })
  } catch {
    return res.status(500).json({ error: "Failed to load availability" })
  }
})

availabilityRouter.put("/schedule", async (req, res) => {
  if (req.user!.role !== "office") return res.status(403).json({ error: "Forbidden" })
  const parsed = scheduleSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })
  // validate open < close for non-null days
  for (const [, val] of Object.entries(parsed.data)) {
    if (val && val.open >= val.close) {
      return res.status(400).json({ error: "open time must be before close time" })
    }
  }
  try {
    await prisma.organization.update({
      where: { id: req.user!.organizationId },
      data: { availabilitySchedule: parsed.data },
    })
    return res.json(parsed.data)
  } catch {
    return res.status(500).json({ error: "Failed to update schedule" })
  }
})

availabilityRouter.post("/blocked-dates", async (req, res) => {
  if (req.user!.role !== "office") return res.status(403).json({ error: "Forbidden" })
  const { date, reason } = req.body as { date?: string; reason?: string }
  if (!date) return res.status(400).json({ error: "date is required" })
  try {
    const normalised = new Date(date); normalised.setUTCHours(0, 0, 0, 0)
    const record = await prisma.blockedDate.create({
      data: { organizationId: req.user!.organizationId, date: normalised, reason: reason ?? null },
    })
    return res.status(201).json(record)
  } catch (e: unknown) {
    if ((e as { code?: string }).code === "P2002") return res.status(409).json({ error: "This date is already blocked" })
    return res.status(500).json({ error: "Failed to create blocked date" })
  }
})

availabilityRouter.delete("/blocked-dates/:id", async (req, res) => {
  if (req.user!.role !== "office") return res.status(403).json({ error: "Forbidden" })
  const record = await prisma.blockedDate.findFirst({
    where: { id: req.params.id, organizationId: req.user!.organizationId },
  })
  if (!record) return res.status(404).json({ error: "Not found" })
  await prisma.blockedDate.delete({ where: { id: record.id } })
  return res.status(204).send()
})
```

- [ ] **Step 4: Run tests**

```bash
cd backend && npx vitest run src/__tests__/availability.test.ts
```

Expected: 6 tests pass

- [ ] **Step 5: Mount router in index.ts**

In `backend/src/index.ts`, add after the maintenance-plans line:
```typescript
import { availabilityRouter } from "./routes/availability.js"
// ...
app.use("/api/availability", apiLimiter, requireAuth, availabilityRouter)
```

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/availability.ts backend/src/__tests__/availability.test.ts backend/src/index.ts
git commit -m "feat: add availability windows routes and tests"
```

---

## Chunk 3: Customer Cancellation

### Task 3: Cancel route + notifyOfficeCancellation + tests

**Files:**
- Modify: `backend/src/routes/jobs.ts`
- Modify: `backend/src/services/org-notifications.ts`
- Create: `backend/src/__tests__/jobs-cancel.test.ts`

**Context:**
- `customerId` is NOT in the JWT for customer-role users — must look up via `prisma.user.findUnique({ where: { id: req.user!.userId }, select: { customerId: true } })`
- Add `POST /:id/cancel` — must come BEFORE any `/:id` param route to avoid collision
- `notifyOfficeCancellation` uses same `getOrgDispatch` pattern as other notification helpers

- [ ] **Step 1: Write failing tests**

Create `backend/src/__tests__/jobs-cancel.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest"
import request from "supertest"
import express from "express"

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    job: { findFirst: vi.fn(), update: vi.fn() },
  },
}))

vi.mock("../services/org-notifications.js", () => ({
  notifyOfficeCancellation: vi.fn().mockResolvedValue(undefined),
  notifyOrgNewBooking: vi.fn(),
  notifyOrgStatusChange: vi.fn(),
  notifyOrgJobCompleted: vi.fn(),
  notifyOfficePaymentReceived: vi.fn(),
  notifyOfficePlanCreated: vi.fn(),
}))

import { prisma } from "../lib/prisma.js"
import { notifyOfficeCancellation } from "../services/org-notifications.js"
import { jobsRouter } from "../routes/jobs.js"

const mockPrisma = prisma as unknown as {
  user: { findUnique: ReturnType<typeof vi.fn> }
  job: { findFirst: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> }
}

function makeApp(role = "customer", userId = "u1", orgId = "org1") {
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    ;(req as express.Request & { user: unknown }).user = { userId, organizationId: orgId, role }
    next()
  })
  app.use("/", jobsRouter)
  return app
}

beforeEach(() => { vi.clearAllMocks() })

describe("POST /:id/cancel", () => {
  it("returns 403 for non-customer role", async () => {
    const res = await request(makeApp("office")).post("/job1/cancel")
    expect(res.status).toBe(403)
  })

  it("returns 403 if job belongs to a different customer", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ customerId: "custA" })
    mockPrisma.job.findFirst.mockResolvedValue({ id: "job1", customerId: "custB", status: "pending", customer: { name: "Bob" } })
    const res = await request(makeApp()).post("/job1/cancel")
    expect(res.status).toBe(403)
  })

  it("returns 400 if job status is completed", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ customerId: "cust1" })
    mockPrisma.job.findFirst.mockResolvedValue({ id: "job1", customerId: "cust1", status: "completed", customer: { name: "Alice" } })
    const res = await request(makeApp()).post("/job1/cancel")
    expect(res.status).toBe(400)
  })

  it("sets status to cancelled and calls notifyOfficeCancellation", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ customerId: "cust1" })
    mockPrisma.job.findFirst.mockResolvedValue({ id: "job1", customerId: "cust1", status: "pending", customer: { name: "Alice" } })
    mockPrisma.job.update.mockResolvedValue({ id: "job1", status: "cancelled" })
    const res = await request(makeApp()).post("/job1/cancel")
    expect(res.status).toBe(200)
    expect(res.body.status).toBe("cancelled")
    expect(notifyOfficeCancellation).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: "job1", customerName: "Alice" })
    )
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && npx vitest run src/__tests__/jobs-cancel.test.ts
```

Expected: FAIL — `notifyOfficeCancellation` not exported

- [ ] **Step 3: Add notifyOfficeCancellation to org-notifications.ts**

Add at the end of `backend/src/services/org-notifications.ts`:

```typescript
export async function notifyOfficeCancellation(params: {
  jobId: string
  customerName: string
  orgId: string
}): Promise<void> {
  const { jobId, customerName, orgId } = params
  const { email } = await getOrgDispatch(orgId)
  if (!email) return
  sendEmail({
    to: email,
    subject: `Appointment cancelled — ${customerName}`,
    html: wrap(
      "Appointment Cancelled",
      `<p><strong>${escapeHtml(customerName)}</strong> has cancelled their appointment.</p>
       <div style="background:#f5f5f5;padding:16px;border-radius:8px;margin:16px 0;">
         <p style="margin:4px 0;"><strong>Reference:</strong> ${escapeHtml(jobId.slice(0, 12))}</p>
         <p style="margin:4px 0;"><strong>Customer:</strong> ${escapeHtml(customerName)}</p>
       </div>
       <p>You may wish to contact them to reschedule.</p>`
    ),
  }).catch(console.error)
}
```

- [ ] **Step 4: Add POST /:id/cancel to jobs.ts**

In `backend/src/routes/jobs.ts`, add the cancel route. It must be placed BEFORE the existing `PATCH /:id` and `GET /:id` routes to avoid Express matching "cancel" as a job id. Find the first `jobsRouter.get("/:id"` line and insert before it:

```typescript
import { notifyOfficeCancellation } from "../services/org-notifications.js"

// Add this import to the existing org-notifications import at top of file:
// notifyOfficeCancellation

jobsRouter.post("/:id/cancel", async (req, res) => {
  if (req.user!.role !== "customer") return res.status(403).json({ error: "Forbidden" })
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    select: { customerId: true },
  })
  if (!user?.customerId) return res.status(400).json({ error: "No customer profile linked to this account" })
  const job = await prisma.job.findFirst({
    where: { id: req.params.id, organizationId: req.user!.organizationId },
    include: { customer: { select: { name: true } } },
  })
  if (!job) return res.status(404).json({ error: "Job not found" })
  if (job.customerId !== user.customerId) return res.status(403).json({ error: "Forbidden" })
  if (!["pending", "scheduled"].includes(job.status)) {
    return res.status(400).json({ error: "Job cannot be cancelled at this stage" })
  }
  const updated = await prisma.job.update({ where: { id: job.id }, data: { status: "cancelled" } })
  notifyOfficeCancellation({ jobId: job.id, customerName: job.customer.name, orgId: req.user!.organizationId }).catch(console.error)
  return res.json(updated)
})
```

**Important:** At the top of `backend/src/routes/jobs.ts`, find the existing import:
```typescript
import {
  notifyOrgNewBooking,
  notifyOrgStatusChange,
  notifyOrgJobCompleted,
} from "../services/org-notifications.js"
```
Add `notifyOfficeCancellation` to that import list.

- [ ] **Step 5: Run tests**

```bash
cd backend && npx vitest run src/__tests__/jobs-cancel.test.ts
```

Expected: 4 tests pass

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/jobs.ts backend/src/services/org-notifications.ts backend/src/__tests__/jobs-cancel.test.ts
git commit -m "feat: add customer job cancellation route and office notification"
```

---

## Chunk 4: Reviews Routes + Tests

### Task 4: Post-job review routes + tests

**Files:**
- Modify: `backend/src/routes/jobs.ts` (add POST /:id/review + extend GET to include review)
- Create: `backend/src/routes/reviews.ts`
- Create: `backend/src/__tests__/reviews.test.ts`
- Modify: `backend/src/index.ts`

**Context:**
- Same `customerId` DB lookup pattern as cancel route
- `POST /:id/review` must come BEFORE `PATCH /:id` / `GET /:id` (same ordering reason)
- 409 returns existing review in body — query it from DB before returning
- `GET /api/customers/me/jobs` in customers.ts already scopes to the customer; the new review include goes on `GET /api/jobs` in jobs.ts (for customer role)

- [ ] **Step 1: Write failing tests**

Create `backend/src/__tests__/reviews.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest"
import request from "supertest"
import express from "express"

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    job: { findFirst: vi.fn() },
    jobReview: { create: vi.fn(), findUnique: vi.fn(), findMany: vi.fn() },
  },
}))

import { prisma } from "../lib/prisma.js"
import { jobsRouter } from "../routes/jobs.js"
import { reviewsRouter } from "../routes/reviews.js"

const mockPrisma = prisma as unknown as {
  user: { findUnique: ReturnType<typeof vi.fn> }
  job: { findFirst: ReturnType<typeof vi.fn> }
  jobReview: { create: ReturnType<typeof vi.fn>; findUnique: ReturnType<typeof vi.fn> }
}

function makeJobsApp(role = "customer", userId = "u1", orgId = "org1") {
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    ;(req as express.Request & { user: unknown }).user = { userId, organizationId: orgId, role }
    next()
  })
  app.use("/", jobsRouter)
  return app
}

function makeReviewsApp(role = "office", orgId = "org1") {
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    ;(req as express.Request & { user: unknown }).user = { userId: "u1", organizationId: orgId, role }
    next()
  })
  app.use("/", reviewsRouter)
  return app
}

beforeEach(() => { vi.clearAllMocks() })

describe("POST /:id/review", () => {
  it("returns 403 for non-customer role", async () => {
    const res = await request(makeJobsApp("office")).post("/job1/review").send({ rating: 5 })
    expect(res.status).toBe(403)
  })

  it("returns 400 if job not completed", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ customerId: "cust1" })
    mockPrisma.job.findFirst.mockResolvedValue({ id: "job1", customerId: "cust1", status: "pending" })
    const res = await request(makeJobsApp()).post("/job1/review").send({ rating: 5 })
    expect(res.status).toBe(400)
  })

  it("returns 403 if job belongs to different customer", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ customerId: "custA" })
    mockPrisma.job.findFirst.mockResolvedValue({ id: "job1", customerId: "custB", status: "completed" })
    const res = await request(makeJobsApp()).post("/job1/review").send({ rating: 5 })
    expect(res.status).toBe(403)
  })

  it("creates review and returns 201", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ customerId: "cust1" })
    mockPrisma.job.findFirst.mockResolvedValue({ id: "job1", customerId: "cust1", status: "completed", organizationId: "org1" })
    mockPrisma.jobReview.create.mockResolvedValue({ id: "rev1", jobId: "job1", rating: 5, comment: "Great!", createdAt: new Date() })
    const res = await request(makeJobsApp()).post("/job1/review").send({ rating: 5, comment: "Great!" })
    expect(res.status).toBe(201)
    expect(res.body.rating).toBe(5)
  })

  it("returns 409 with existing review in body if review already exists", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ customerId: "cust1" })
    mockPrisma.job.findFirst.mockResolvedValue({ id: "job1", customerId: "cust1", status: "completed", organizationId: "org1" })
    const existing = { id: "rev1", jobId: "job1", rating: 4, comment: "Good", createdAt: new Date() }
    mockPrisma.jobReview.create.mockRejectedValue(Object.assign(new Error(), { code: "P2002" }))
    mockPrisma.jobReview.findUnique.mockResolvedValue(existing)
    const res = await request(makeJobsApp()).post("/job1/review").send({ rating: 5 })
    expect(res.status).toBe(409)
    expect(res.body.existing.rating).toBe(4)
  })
})

describe("GET /reviews", () => {
  it("returns 403 for non-office role", async () => {
    const res = await request(makeReviewsApp("customer")).get("/")
    expect(res.status).toBe(403)
  })

  it("returns reviews for org", async () => {
    const mockReviews = [{ id: "r1", rating: 5, comment: "Excellent", createdAt: new Date(), customer: { name: "Alice" }, job: { scheduledAt: new Date(), equipmentType: "AC" } }]
    const mockPris = prisma as unknown as { jobReview: { findMany: ReturnType<typeof vi.fn> } }
    mockPris.jobReview.findMany.mockResolvedValue(mockReviews)
    const res = await request(makeReviewsApp()).get("/")
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && npx vitest run src/__tests__/reviews.test.ts
```

Expected: FAIL — routes not implemented

- [ ] **Step 3: Add POST /:id/review to jobs.ts**

Add before `GET /:id` in `backend/src/routes/jobs.ts`:

```typescript
jobsRouter.post("/:id/review", async (req, res) => {
  if (req.user!.role !== "customer") return res.status(403).json({ error: "Forbidden" })
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    select: { customerId: true },
  })
  if (!user?.customerId) return res.status(400).json({ error: "No customer profile linked" })
  const job = await prisma.job.findFirst({
    where: { id: req.params.id, organizationId: req.user!.organizationId },
  })
  if (!job) return res.status(404).json({ error: "Job not found" })
  if (job.customerId !== user.customerId) return res.status(403).json({ error: "Forbidden" })
  if (job.status !== "completed") return res.status(400).json({ error: "Job is not completed" })
  const { rating, comment } = req.body as { rating?: unknown; comment?: string }
  if (typeof rating !== "number" || rating < 1 || rating > 5) {
    return res.status(400).json({ error: "rating must be a number between 1 and 5" })
  }
  try {
    const review = await prisma.jobReview.create({
      data: {
        jobId: job.id,
        organizationId: req.user!.organizationId,
        customerId: user.customerId,
        rating,
        comment: comment ?? null,
      },
    })
    return res.status(201).json(review)
  } catch (e: unknown) {
    if ((e as { code?: string }).code === "P2002") {
      const existing = await prisma.jobReview.findUnique({ where: { jobId: job.id } })
      return res.status(409).json({ error: "Review already exists", existing })
    }
    return res.status(500).json({ error: "Failed to create review" })
  }
})
```

Also extend the customer-scoped `GET /` in `jobs.ts` to include `review`. In the `prisma.job.findMany` call inside the `GET /` handler, find the `include` object and add a conditional spread so `false` is never passed to Prisma (Prisma does not accept `false` as an include value — it must be omitted):

```typescript
// Inside the existing include: { ... } block in GET /:
...(role === "customer" ? { review: true } : {}),
```

This ensures office/technician responses are unaffected and customers get the review field included.

- [ ] **Step 4: Create reviews.ts**

Create `backend/src/routes/reviews.ts`:

```typescript
import { Router } from "express"
import { prisma } from "../lib/prisma.js"

export const reviewsRouter = Router()

reviewsRouter.get("/", async (req, res) => {
  if (req.user!.role !== "office") return res.status(403).json({ error: "Forbidden" })
  const { customerId } = req.query as { customerId?: string }
  try {
    const reviews = await prisma.jobReview.findMany({
      where: {
        organizationId: req.user!.organizationId,
        ...(customerId ? { customerId } : {}),
      },
      include: {
        customer: { select: { name: true } },
        job: { select: { scheduledAt: true, equipmentType: true } },
      },
      orderBy: { createdAt: "desc" },
    })
    return res.json(reviews)
  } catch {
    return res.status(500).json({ error: "Failed to load reviews" })
  }
})
```

- [ ] **Step 5: Mount reviews router in index.ts**

Add to `backend/src/index.ts`:
```typescript
import { reviewsRouter } from "./routes/reviews.js"
// ...
app.use("/api/reviews", apiLimiter, requireAuth, requireSubscription, reviewsRouter)
```

- [ ] **Step 6: Run all tests**

```bash
cd backend && npx vitest run src/__tests__/reviews.test.ts src/__tests__/jobs-cancel.test.ts src/__tests__/availability.test.ts
```

Expected: all pass

- [ ] **Step 7: Commit**

```bash
git add backend/src/routes/jobs.ts backend/src/routes/reviews.ts backend/src/__tests__/reviews.test.ts backend/src/index.ts
git commit -m "feat: add post-job review routes and GET /api/reviews for office"
```

---

## Chunk 5: Frontend Types + Availability Settings UI

### Task 5: API types + OfficeSettings availability section

**Files:**
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/pages/office/OfficeSettings.tsx`

**Context:**
- `CustomerJobHistoryItem` is at line ~421 in types.ts — extend it with `review?: JobReview | null`
- `OfficeSettings.tsx` is 465 lines — add a new card section at the bottom
- All fetches use `api.get` / `api.post` / `api.delete` from `@/api/client` which adds auth headers automatically
- For raw fetch calls, use `Authorization: Bearer ${localStorage.getItem("flowsense_token")}`

- [ ] **Step 1: Add API types**

In `frontend/src/api/types.ts`, append:

```typescript
export interface AvailabilityDayWindow {
  open: string   // "HH:MM"
  close: string  // "HH:MM"
}

export interface AvailabilitySchedule {
  mon: AvailabilityDayWindow | null
  tue: AvailabilityDayWindow | null
  wed: AvailabilityDayWindow | null
  thu: AvailabilityDayWindow | null
  fri: AvailabilityDayWindow | null
  sat: AvailabilityDayWindow | null
  sun: AvailabilityDayWindow | null
}

export interface BlockedDate {
  id: string
  date: string
  reason: string | null
}

export interface JobReview {
  id: string
  jobId: string
  rating: number
  comment: string | null
  createdAt: string
  customer?: { name: string }
  job?: { scheduledAt: string; equipmentType: string | null }
}
```

Also extend `CustomerJobHistoryItem` to add:
```typescript
review?: JobReview | null
```

- [ ] **Step 2: Add Availability section to OfficeSettings.tsx**

At the end of `frontend/src/pages/office/OfficeSettings.tsx`, before the closing `</div>` of the main container, add an `AvailabilityCard` component and render it. The component can be defined in the same file above the default export:

```typescript
const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const
const DAY_LABELS: Record<string, string> = {
  mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday",
  fri: "Friday", sat: "Saturday", sun: "Sunday",
}

type DayKey = typeof DAYS[number]
type DayWindow = { open: string; close: string } | null

const DEFAULT_SCHEDULE: Record<DayKey, DayWindow> = {
  mon: { open: "08:00", close: "17:00" },
  tue: { open: "08:00", close: "17:00" },
  wed: { open: "08:00", close: "17:00" },
  thu: { open: "08:00", close: "17:00" },
  fri: { open: "08:00", close: "17:00" },
  sat: null,
  sun: null,
}

function AvailabilityCard() {
  const [schedule, setSchedule] = useState<Record<DayKey, DayWindow>>(DEFAULT_SCHEDULE)
  const [blockedDates, setBlockedDates] = useState<{ id: string; date: string; reason: string | null }[]>([])
  const [newDate, setNewDate] = useState("")
  const [newReason, setNewReason] = useState("")
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState("")

  useEffect(() => {
    // Build headers inside the effect so the reference is stable and exhaustive-deps linters won't flag it
    const headers = { Authorization: `Bearer ${localStorage.getItem("flowsense_token")}` }
    fetch("/api/availability", { headers }).then(r => r.json()).then((data) => {
      if (data.schedule) setSchedule(data.schedule)
      if (data.blockedDates) setBlockedDates(data.blockedDates)
    }).catch(() => {})
  }, [])

  // Build auth headers inline inside each handler (not as a component-level const)
  function authHeaders() {
    return { Authorization: `Bearer ${localStorage.getItem("flowsense_token")}`, "Content-Type": "application/json" }
  }

  function toggleDay(day: DayKey) {
    setSchedule(prev => ({
      ...prev,
      [day]: prev[day] ? null : { open: "08:00", close: "17:00" },
    }))
  }

  function updateTime(day: DayKey, field: "open" | "close", value: string) {
    setSchedule(prev => ({
      ...prev,
      [day]: { ...(prev[day] ?? { open: "08:00", close: "17:00" }), [field]: value },
    }))
  }

  async function saveSchedule() {
    setSaving(true); setSaveMsg("")
    try {
      const res = await fetch("/api/availability/schedule", { method: "PUT", headers: authHeaders(), body: JSON.stringify(schedule) })
      setSaveMsg(res.ok ? "Saved" : "Failed to save")
    } catch { setSaveMsg("Failed to save") } finally { setSaving(false) }
  }

  async function addBlockedDate() {
    if (!newDate) return
    const res = await fetch("/api/availability/blocked-dates", { method: "POST", headers: authHeaders(), body: JSON.stringify({ date: newDate, reason: newReason || undefined }) })
    if (res.ok) {
      const created = await res.json()
      setBlockedDates(prev => [...prev, created])
      setNewDate(""); setNewReason("")
    }
  }

  async function removeBlockedDate(id: string) {
    await fetch(`/api/availability/blocked-dates/${id}`, { method: "DELETE", headers: authHeaders() })
    setBlockedDates(prev => prev.filter(d => d.id !== id))
  }

  return (
    <div className="rounded-xl border border-border bg-card p-6 space-y-4">
      <h2 className="text-base font-semibold">Availability</h2>
      <p className="text-sm text-muted-foreground">Set the days and hours customers can book appointments.</p>

      <div className="space-y-2">
        {DAYS.map((day) => (
          <div key={day} className="flex items-center gap-3">
            <input type="checkbox" checked={!!schedule[day]} onChange={() => toggleDay(day)} className="h-4 w-4" />
            <span className="w-24 text-sm">{DAY_LABELS[day]}</span>
            {schedule[day] ? (
              <>
                <input type="time" value={schedule[day]!.open} onChange={(e) => updateTime(day, "open", e.target.value)} className="rounded border px-2 py-1 text-sm bg-background" />
                <span className="text-muted-foreground text-sm">–</span>
                <input type="time" value={schedule[day]!.close} onChange={(e) => updateTime(day, "close", e.target.value)} className="rounded border px-2 py-1 text-sm bg-background" />
              </>
            ) : (
              <span className="text-sm text-muted-foreground">Closed</span>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <button onClick={saveSchedule} disabled={saving} className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {saving ? "Saving…" : "Save schedule"}
        </button>
        {saveMsg && <span className="text-sm text-muted-foreground">{saveMsg}</span>}
      </div>

      <div className="pt-2 border-t border-border">
        <p className="text-sm font-medium mb-2">Blocked dates</p>
        {blockedDates.length === 0 && <p className="text-sm text-muted-foreground mb-2">No blocked dates.</p>}
        <ul className="space-y-1 mb-3">
          {blockedDates.map((d) => (
            <li key={d.id} className="flex items-center gap-2 text-sm">
              <span>{new Date(d.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
              {d.reason && <span className="text-muted-foreground">— {d.reason}</span>}
              <button onClick={() => removeBlockedDate(d.id)} className="text-muted-foreground hover:text-destructive text-xs ml-auto">Remove</button>
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className="rounded border px-2 py-1 text-sm bg-background" />
          <input placeholder="Reason (optional)" value={newReason} onChange={(e) => setNewReason(e.target.value)} className="rounded border px-2 py-1 text-sm bg-background flex-1" />
          <button onClick={addBlockedDate} className="rounded bg-muted px-3 py-1.5 text-sm hover:bg-muted/80">Add</button>
        </div>
      </div>
    </div>
  )
}
```

Then add `<AvailabilityCard />` in the JSX output of `OfficeSettings` (the existing page's return value — add it at the bottom of the settings list).

Verify that `useState` and `useEffect` are already imported in `OfficeSettings.tsx` (check the first import line). If `useEffect` is missing, add it to the `react` import.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api/types.ts frontend/src/pages/office/OfficeSettings.tsx
git commit -m "feat: add availability API types and office settings availability card"
```

---

## Chunk 6: Customer Book Availability Constraints

### Task 6: Constrain CustomerBook.tsx to availability windows

**Files:**
- Modify: `frontend/src/pages/customer/CustomerBook.tsx`

**Context:**
- File is 486 lines — look for the date/time picker inputs (around the `scheduledAt` field)
- Fetch `GET /api/availability` on mount; fail open if it errors
- Day keys: `mon tue wed thu fri sat sun` — map JS `getDay()` (0=Sun,1=Mon…6=Sat) to these keys
- `blockedDates` dates come as ISO strings — compare by YYYY-MM-DD string after normalizing

- [ ] **Step 1: Read the file to find date/time handling**

```bash
grep -n "scheduledAt\|date\|time\|Date\|input" frontend/src/pages/customer/CustomerBook.tsx | head -30
```

- [ ] **Step 2: Add availability fetch and validation logic**

At the top of the `CustomerBook` component (after existing state declarations), add:

```typescript
const [availability, setAvailability] = useState<{ schedule: AvailabilitySchedule | null; blockedDates: BlockedDate[] } | null>(null)

useEffect(() => {
  api.get<{ schedule: AvailabilitySchedule | null; blockedDates: BlockedDate[] }>("/api/availability")
    .then(setAvailability)
    .catch(() => {}) // fail open
}, [])
```

Add a helper function (outside component or inside):

```typescript
const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const

function getAvailabilityError(
  dateStr: string,
  timeStr: string,
  avail: typeof availability
): string | null {
  if (!avail?.schedule || !dateStr) return null
  const d = new Date(dateStr + "T12:00:00")
  const dayKey = DAY_KEYS[d.getDay()]
  const dayWindow = avail.schedule[dayKey as keyof AvailabilitySchedule]
  if (dayWindow === null) return "The office is not available on this day."
  const isBlocked = avail.blockedDates.some((bd) => bd.date.slice(0, 10) === dateStr)
  if (isBlocked) return "This date is not available (office closed)."
  if (timeStr && dayWindow) {
    if (timeStr < dayWindow.open || timeStr > dayWindow.close) {
      return `Available hours: ${dayWindow.open} – ${dayWindow.close}`
    }
  }
  return null
}
```

In the submit handler, before calling the API, add:

```typescript
const availError = getAvailabilityError(dateValue, timeValue, availability)
if (availError) { setError(availError); return }
```

Render the availability error inline below the date/time inputs.

Add to imports: `import type { AvailabilitySchedule, BlockedDate } from "@/api/types"`

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/customer/CustomerBook.tsx
git commit -m "feat: constrain customer booking to office availability windows"
```

---

## Chunk 7: Customer History — Cancel + Review UI

### Task 7: Cancel + review UI in CustomerHistory.tsx

**Files:**
- Modify: `frontend/src/pages/customer/CustomerHistory.tsx`
- Modify: `backend/src/routes/customers.ts` (add `review` to `GET /me/jobs` select)

**Context:**
- `CustomerHistory.tsx` fetches from `GET /api/customers/me/jobs` (in `customers.ts` at line ~108), NOT `GET /api/jobs`. This plan deliberately uses the `/me/jobs` endpoint (already customer-scoped) rather than the more general `/api/jobs` endpoint mentioned in the spec. Both approaches are equivalent; `/me/jobs` is simpler for the customer portal.
- `GET /me/jobs` currently filters `status: { in: ["completed", "cancelled"] }` — we need to include `pending` and `scheduled` too so the cancel button can appear. **Remove the status filter entirely** and return all jobs; the frontend groups them into "upcoming" vs "past".
- Add `review: true` to the select block so the review widget can render without an extra fetch.
- Note: extend `CustomerJobHistoryItem` in `types.ts` with `review` (already done in Task 5). The spec says to extend `ApiJob` — ignore that; `CustomerJobHistoryItem` is the correct type for this endpoint.
- `api.post` is available from `@/api/client`

- [ ] **Step 1: Extend GET /me/jobs in customers.ts**

In `backend/src/routes/customers.ts`, at the `GET /me/jobs` handler (line ~108):

1. Remove the `status: { in: ["completed", "cancelled"] }` filter so all jobs are returned
2. Add `review: { select: { id: true, rating: true, comment: true, createdAt: true } }` to the `select` block

The updated query becomes:
```typescript
const jobs = await prisma.job.findMany({
  where: {
    customerId: user.customerId,
    organizationId: user.organizationId,
    // no status filter — return all
  },
  select: {
    id: true,
    status: true,
    scheduledAt: true,
    completedAt: true,
    equipmentType: true,
    symptomSummary: true,
    actionsTaken: true,
    technician: { select: { name: true } },
    review: { select: { id: true, rating: true, comment: true, createdAt: true } },
  },
  orderBy: { scheduledAt: "desc" },
})
```

- [ ] **Step 2: Update CustomerJobHistoryItem type**

In `frontend/src/api/types.ts`, the `review` field was already added in Task 5. Verify it includes `id`, `rating`, `comment`, `createdAt`.

- [ ] **Step 3: Rewrite CustomerHistory.tsx**

Replace `frontend/src/pages/customer/CustomerHistory.tsx` with:

```typescript
import { useEffect, useState } from "react"
import { api } from "@/api/client"
import type { CustomerJobHistoryItem } from "@/api/types"
import { Loader2, Star } from "lucide-react"

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

function StarRating({ rating, onRate }: { rating: number; onRate?: (r: number) => void }) {
  const [hover, setHover] = useState(0)
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onRate?.(n)}
          onMouseEnter={() => onRate && setHover(n)}
          onMouseLeave={() => onRate && setHover(0)}
          disabled={!onRate}
          className="disabled:cursor-default"
        >
          <Star
            className={`h-4 w-4 ${n <= (hover || rating) ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"}`}
          />
        </button>
      ))}
    </div>
  )
}

function ReviewSection({ job, onReviewed }: { job: CustomerJobHistoryItem; onReviewed: (review: NonNullable<CustomerJobHistoryItem["review"]>) => void }) {
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

  if (job.review) {
    return (
      <div className="mt-3 pt-3 border-t border-border">
        <p className="text-xs text-muted-foreground mb-1">Your review</p>
        <StarRating rating={job.review.rating} />
        {job.review.comment && <p className="text-sm text-muted-foreground mt-1">{job.review.comment}</p>}
      </div>
    )
  }

  async function submit() {
    if (!rating) { setError("Select a star rating."); return }
    setSubmitting(true); setError("")
    try {
      const res = await fetch(`/api/jobs/${job.id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("flowsense_token")}` },
        body: JSON.stringify({ rating, comment: comment || undefined }),
      })
      if (res.status === 201) { onReviewed(await res.json()) }
      else if (res.status === 409) { const data = await res.json(); onReviewed(data.existing) }
      else { setError("Could not submit review.") }
    } catch { setError("Could not submit review.") } finally { setSubmitting(false) }
  }

  return (
    <div className="mt-3 pt-3 border-t border-border">
      <p className="text-xs text-muted-foreground mb-2">Rate this visit</p>
      <StarRating rating={rating} onRate={setRating} />
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Leave a comment (optional)"
        className="mt-2 w-full rounded border px-2 py-1.5 text-sm bg-background resize-none"
        rows={2}
      />
      {error && <p className="text-xs text-destructive mt-1">{error}</p>}
      <button onClick={submit} disabled={submitting} className="mt-2 rounded bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
        {submitting ? "Submitting…" : "Submit review"}
      </button>
    </div>
  )
}

export default function CustomerHistory() {
  const [items, setItems] = useState<CustomerJobHistoryItem[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [cancellingId, setCancellingId] = useState<string | null>(null)

  useEffect(() => {
    api.get<CustomerJobHistoryItem[]>("/api/customers/me/jobs")
      .then(setItems)
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [])

  async function handleCancel(id: string) {
    if (!confirm("Cancel this appointment?")) return
    setCancellingId(id)
    try {
      await fetch(`/api/jobs/${id}/cancel`, {
        method: "POST",
        headers: { Authorization: `Bearer ${localStorage.getItem("flowsense_token")}` },
      })
      setItems(prev => prev?.map(j => j.id === id ? { ...j, status: "cancelled" } : j) ?? null)
    } catch { /* silent */ } finally { setCancellingId(null) }
  }

  function handleReviewed(jobId: string, review: NonNullable<CustomerJobHistoryItem["review"]>) {
    setItems(prev => prev?.map(j => j.id === jobId ? { ...j, review } : j) ?? null)
  }

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  if (error) return <p className="py-10 text-center text-sm text-muted-foreground">Could not load job history.</p>
  if (!items || items.length === 0) return <div className="py-10 text-center"><p className="text-sm text-muted-foreground">No service history yet.</p></div>

  const upcoming = items.filter(j => ["pending", "scheduled"].includes(j.status))
  const past = items.filter(j => !["pending", "scheduled"].includes(j.status))

  return (
    <div className="space-y-6">
      {upcoming.length > 0 && (
        <div>
          <h1 className="text-lg font-semibold mb-3">Upcoming Appointments</h1>
          <div className="space-y-3">
            {upcoming.map((item) => (
              <div key={item.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="font-semibold">{item.equipmentType ?? "Service"}</span>
                  <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">{item.status}</span>
                </div>
                <div className="text-sm text-muted-foreground mb-2">{formatDate(item.scheduledAt)}</div>
                {item.symptomSummary && <p className="text-sm text-muted-foreground">{item.symptomSummary}</p>}
                <button
                  onClick={() => handleCancel(item.id)}
                  disabled={cancellingId === item.id}
                  className="mt-3 text-xs text-destructive hover:underline disabled:opacity-50"
                >
                  {cancellingId === item.id ? "Cancelling…" : "Cancel appointment"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {past.length > 0 && (
        <div>
          <h1 className="text-lg font-semibold mb-3">Job History</h1>
          <div className="space-y-3">
            {past.map((item) => (
              <div key={item.id} className="rounded-xl border border-border bg-card p-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="font-semibold">{item.equipmentType ?? "Service"}</span>
                  <span className={item.status === "completed"
                    ? "rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700"
                    : "rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"}>
                    {item.status}
                  </span>
                </div>
                <div className="text-sm text-muted-foreground mb-1">{formatDate(item.scheduledAt)}</div>
                {item.symptomSummary && <p className="text-sm text-muted-foreground mt-1">{item.symptomSummary}</p>}
                {item.actionsTaken && <p className="text-sm text-muted-foreground mt-1 line-clamp-3"><span className="font-medium text-foreground">Work done:</span> {item.actionsTaken}</p>}
                {item.technician && <p className="text-sm text-muted-foreground mt-1">Technician: {item.technician.name}</p>}
                {item.status === "completed" && (
                  <ReviewSection job={item} onReviewed={(r) => handleReviewed(item.id, r)} />
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/customer/CustomerHistory.tsx backend/src/routes/customers.ts
git commit -m "feat: add cancel button and post-job review UI to customer history"
```

---

## Chunk 8: Office Reviews in OfficeCustomers

### Task 8: Reviews section in OfficeCustomers.tsx

**Files:**
- Modify: `frontend/src/pages/office/OfficeCustomers.tsx`

**Context:**
- `OfficeCustomers.tsx` is 105 lines and has no customer detail panel — it shows a `CustomerTable` component
- The spec says "customer detail panel/drawer" — since none exists, add a simple inline modal when a customer row is clicked showing their reviews
- `CustomerTable` is in `frontend/src/components/customers/customer-table.tsx` — check if it already has an `onRowClick` or similar prop

- [ ] **Step 1: Check CustomerTable**

```bash
grep -n "onClick\|onRowClick\|onSelect" frontend/src/components/customers/customer-table.tsx | head -10
```

- [ ] **Step 2: Add customer reviews panel**

Add a `CustomerReviewsDrawer` component in `frontend/src/pages/office/OfficeCustomers.tsx`. Add state `selectedCustomer` to `OfficeCustomersPage`. Pass `onRowClick` to `CustomerTable` if supported (or wrap the table rows).

The drawer shows:
- Customer name header
- `GET /api/reviews?customerId=X` results as a list
- Average rating displayed as `★ 4.2`
- Each review: date, star display, comment

```typescript
function CustomerReviewsDrawer({ customer, onClose }: { customer: ApiCustomer; onClose: () => void }) {
  const token = localStorage.getItem("flowsense_token")
  const [reviews, setReviews] = useState<JobReview[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/reviews?customerId=${customer.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.json()).then(setReviews).catch(() => {}).finally(() => setLoading(false))
  }, [customer.id])

  const avg = reviews.length ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1) : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-background p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold">{customer.name}</h2>
            {avg && <p className="text-sm text-muted-foreground">★ {avg} avg ({reviews.length} review{reviews.length !== 1 ? "s" : ""})</p>}
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">✕</button>
        </div>
        {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!loading && reviews.length === 0 && <p className="text-sm text-muted-foreground">No reviews yet.</p>}
        <div className="space-y-3">
          {reviews.map((r) => (
            <div key={r.id} className="rounded-lg border p-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-yellow-400">{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span>
                <span className="text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
              </div>
              {r.comment && <p className="text-sm text-muted-foreground">{r.comment}</p>}
              {r.job && <p className="text-xs text-muted-foreground mt-1">{r.job.equipmentType ?? "Service"} · {new Date(r.job.scheduledAt).toLocaleDateString()}</p>}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
```

Add `import type { JobReview } from "@/api/types"` to the imports.
Add `selectedCustomer` state and render `<CustomerReviewsDrawer>` when set.
Add a "View reviews" button or make customer rows clickable.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/office/OfficeCustomers.tsx
git commit -m "feat: add customer reviews drawer to office customers page"
```

---

## Final Verification

- [ ] Run all backend tests:
```bash
cd backend && npx vitest run
```
Expected: all pass

- [ ] Start the dev server and manually verify:
  1. `/office/settings` — Availability card appears, toggling days works, adding blocked date works
  2. `/customer/book` — Date/time picker warns on closed days
  3. Customer portal — History page shows pending jobs with Cancel button, completed jobs with star review widget
  4. `/office/customers` — Click a customer, see reviews drawer

- [ ] Final commit if any fixes needed, then done.
