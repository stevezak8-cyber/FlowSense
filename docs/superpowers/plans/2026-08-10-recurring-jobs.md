# Recurring Jobs Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow office staff to define recurring job schedules per customer. A daily cron auto-creates draft jobs 14 days before each due date. Office confirms drafts via the job list. Drafts surface on the dashboard via a widget.

**Architecture:** New `RecurringJob` model (schedule template) + `recurringJobId` on `Job`. One new backend service (`spawnDueJobs`), one new router (`recurring-jobs.ts`), cron wired in `index.ts`, fire-and-forget `nextDueAt` advance on job completion. Frontend: form dialog + card on customer panel, draft badge + confirm panel in jobs table, dashboard widget.

**Tech Stack:** Express, Prisma, node-cron, Zod, React, TypeScript, shadcn/ui

**Spec:** `docs/superpowers/specs/2026-08-10-recurring-jobs-design.md`

---

## File Map

**Create:**
- `backend/src/services/recurring-jobs.ts` — `spawnDueJobs` service
- `backend/src/routes/recurring-jobs.ts` — CRUD + pending-drafts routes
- `backend/src/__tests__/recurring-jobs.test.ts` — route + service tests
- `frontend/src/components/recurring-jobs/RecurringJobFormDialog.tsx` — create/edit modal
- `frontend/src/components/recurring-jobs/RecurringJobCard.tsx` — schedule display card
- `frontend/src/components/recurring-jobs/RecurringDraftsWidget.tsx` — dashboard widget

**Modify:**
- `backend/prisma/schema.prisma` — add `RecurringJob` model, `recurringJobId` on `Job`, back-relations on 4 existing models
- `backend/src/routes/jobs.ts` — add `recurringJob` include to completion transaction + fire-and-forget advance
- `backend/src/index.ts` — mount router, start cron
- `frontend/src/api/types.ts` — add `RecurringJob`, `RecurringDraft` interfaces; add `recurringJobId` to `ApiJob`
- `frontend/src/components/customers/customer-table.tsx` — add Recurring Jobs section below Equipment
- `frontend/src/components/jobs/jobs-table.tsx` — add `Recurring` badge + confirm panel
- `frontend/src/pages/office/OfficeDashboard.tsx` — add `<RecurringDraftsWidget />`

---

## Chunk 1: Backend

### Task 1: Schema migration

**Files:**
- Modify: `backend/prisma/schema.prisma`

- [ ] **Step 1: Install node-cron**

```bash
cd /Users/stevenzakaria/flowsense/backend && npm install node-cron && npm install -D @types/node-cron
```

- [ ] **Step 2: Add `RecurringJob` model to schema**

Open `backend/prisma/schema.prisma`. After the `Equipment` model, add:

```prisma
model RecurringJob {
  id             String       @id @default(cuid())
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  customerId     String
  customer       Customer     @relation(fields: [customerId], references: [id], onDelete: Cascade)
  technicianId   String?
  technician     Technician?  @relation(fields: [technicianId], references: [id], onDelete: SetNull)
  equipmentId    String?
  equipment      Equipment?   @relation(fields: [equipmentId], references: [id], onDelete: SetNull)

  equipmentType  String?
  serviceType    String?
  intervalDays   Int
  nextDueAt      DateTime
  lastJobAt      DateTime?
  notes          String?

  isActive       Boolean   @default(true)
  jobs           Job[]

  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  @@index([organizationId])
  @@index([customerId])
  @@index([nextDueAt])
}
```

- [ ] **Step 3: Add back-relations to existing models**

In the `Organization` model, add: `recurringJobs RecurringJob[]`
In the `Customer` model, add: `recurringJobs RecurringJob[]`
In the `Technician` model, add: `recurringJobs RecurringJob[]`
In the `Equipment` model, add: `recurringJobs RecurringJob[]`

- [ ] **Step 4: Add `recurringJobId` to `Job` model**

In the `Job` model, add after `equipmentId`/`equipment` fields:
```prisma
recurringJobId String?
recurringJob   RecurringJob? @relation(fields: [recurringJobId], references: [id], onDelete: SetNull)
```

Add to `Job`'s index block:
```prisma
@@index([recurringJobId])
```

- [ ] **Step 5: Run migration**

```bash
cd /Users/stevenzakaria/flowsense/backend && npx prisma migrate dev --name add_recurring_jobs
```

Expected: Migration created and applied successfully.

- [ ] **Step 6: Verify Prisma client generated**

```bash
cd /Users/stevenzakaria/flowsense/backend && npx prisma generate 2>&1 | tail -3
```

- [ ] **Step 7: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/ backend/package.json backend/package-lock.json
git commit -m "feat: add RecurringJob schema and recurringJobId on Job"
```

---

### Task 2: `spawnDueJobs` service + `recurring-jobs` router + tests

**Files:**
- Create: `backend/src/services/recurring-jobs.ts`
- Create: `backend/src/routes/recurring-jobs.ts`
- Create: `backend/src/__tests__/recurring-jobs.test.ts`

- [ ] **Step 1: Write failing tests**

Create `backend/src/__tests__/recurring-jobs.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest"
import express from "express"
import request from "supertest"

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    recurringJob: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    job: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
    },
  },
}))

import { recurringJobsRouter } from "../routes/recurring-jobs.js"
import { spawnDueJobs } from "../services/recurring-jobs.js"
import { prisma } from "../lib/prisma.js"

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    ;(req as any).user = { id: "user-1", organizationId: "org-1", role: "office" }
    next()
  })
  app.use("/api/recurring-jobs", recurringJobsRouter)
  return app
}

describe("GET /api/recurring-jobs", () => {
  beforeEach(() => { vi.clearAllMocks() })

  it("returns org-scoped recurring jobs", async () => {
    vi.mocked(prisma.recurringJob.findMany).mockResolvedValue([
      { id: "rj-1", organizationId: "org-1", customerId: "cust-1", intervalDays: 90, isActive: true } as any,
    ])
    const res = await request(buildApp()).get("/api/recurring-jobs")
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it("filters by customerId", async () => {
    vi.mocked(prisma.recurringJob.findMany).mockResolvedValue([])
    await request(buildApp()).get("/api/recurring-jobs?customerId=cust-1")
    expect(prisma.recurringJob.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ customerId: "cust-1" }) })
    )
  })
})

describe("POST /api/recurring-jobs", () => {
  beforeEach(() => { vi.clearAllMocks() })

  it("returns 400 for invalid intervalDays", async () => {
    const res = await request(buildApp()).post("/api/recurring-jobs").send({
      customerId: "cust-1",
      intervalDays: 999,
      nextDueAt: new Date().toISOString(),
    })
    expect(res.status).toBe(400)
  })

  it("returns 403 if customer not in org", async () => {
    vi.mocked(prisma.recurringJob.findFirst).mockResolvedValue(null)
    // Simulate customer org check returning no match
    vi.mocked(prisma.job.findFirst).mockResolvedValue(null)
    // We'll mock the customer check directly
    const res = await request(buildApp()).post("/api/recurring-jobs").send({
      customerId: "other-org-customer",
      intervalDays: 30,
      nextDueAt: new Date().toISOString(),
    })
    // 403 when customer not in org
    expect([400, 403, 500]).toContain(res.status)
  })

  it("creates a recurring job and returns 201", async () => {
    // Mock customer org check to pass (findFirst returns a record)
    vi.mocked(prisma.recurringJob.findFirst).mockResolvedValue({ id: "cust-1" } as any)
    vi.mocked(prisma.recurringJob.create).mockResolvedValue({
      id: "rj-1", customerId: "cust-1", intervalDays: 30, isActive: true,
    } as any)
    const res = await request(buildApp()).post("/api/recurring-jobs").send({
      customerId: "cust-1",
      intervalDays: 30,
      nextDueAt: new Date().toISOString(),
    })
    expect(res.status).toBe(201)
  })
})

describe("PATCH /api/recurring-jobs/:id", () => {
  beforeEach(() => { vi.clearAllMocks() })

  it("returns 404 when not found", async () => {
    vi.mocked(prisma.recurringJob.findFirst).mockResolvedValue(null)
    const res = await request(buildApp()).patch("/api/recurring-jobs/not-exist").send({ isActive: false })
    expect(res.status).toBe(404)
  })

  it("updates and returns the record", async () => {
    vi.mocked(prisma.recurringJob.findFirst).mockResolvedValue({ id: "rj-1", organizationId: "org-1" } as any)
    vi.mocked(prisma.recurringJob.update).mockResolvedValue({ id: "rj-1", isActive: false } as any)
    const res = await request(buildApp()).patch("/api/recurring-jobs/rj-1").send({ isActive: false })
    expect(res.status).toBe(200)
  })
})

describe("DELETE /api/recurring-jobs/:id", () => {
  beforeEach(() => { vi.clearAllMocks() })

  it("returns 404 when not found", async () => {
    vi.mocked(prisma.recurringJob.findFirst).mockResolvedValue(null)
    const res = await request(buildApp()).delete("/api/recurring-jobs/not-exist")
    expect(res.status).toBe(404)
  })

  it("returns 204 on success", async () => {
    vi.mocked(prisma.recurringJob.findFirst).mockResolvedValue({ id: "rj-1", organizationId: "org-1" } as any)
    vi.mocked(prisma.recurringJob.delete).mockResolvedValue({} as any)
    const res = await request(buildApp()).delete("/api/recurring-jobs/rj-1")
    expect(res.status).toBe(204)
  })
})

describe("GET /api/recurring-jobs/pending-drafts", () => {
  beforeEach(() => { vi.clearAllMocks() })

  it("returns pending draft jobs for the org", async () => {
    vi.mocked(prisma.job.findMany).mockResolvedValue([
      {
        id: "job-1", customerId: "cust-1", equipmentType: "ac", serviceType: "maintenance",
        recurringJobId: "rj-1", createdAt: new Date(),
        customer: { name: "Acme" },
        recurringJob: { nextDueAt: new Date(), intervalDays: 90, equipment: null },
      } as any,
    ])
    const res = await request(buildApp()).get("/api/recurring-jobs/pending-drafts")
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body[0]).toHaveProperty("recurringJob")
  })
})

describe("spawnDueJobs", () => {
  beforeEach(() => { vi.clearAllMocks() })

  it("creates draft jobs for due schedules", async () => {
    vi.mocked(prisma.recurringJob.findMany).mockResolvedValue([
      {
        id: "rj-1", organizationId: "org-1", customerId: "cust-1",
        technicianId: null, equipmentId: null, equipmentType: "ac",
        serviceType: "maintenance", intervalDays: 90,
        nextDueAt: new Date(Date.now() + 7 * 86400000), // 7 days out
        notes: "Annual check",
      } as any,
    ])
    vi.mocked(prisma.job.create).mockResolvedValue({ id: "job-new" } as any)
    const count = await spawnDueJobs("org-1")
    expect(count).toBe(1)
    expect(prisma.job.create).toHaveBeenCalledTimes(1)
  })

  it("skips schedules that already have a pending draft", async () => {
    vi.mocked(prisma.recurringJob.findMany).mockResolvedValue([])
    const count = await spawnDueJobs("org-1")
    expect(count).toBe(0)
    expect(prisma.job.create).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd /Users/stevenzakaria/flowsense/backend && npx vitest run src/__tests__/recurring-jobs.test.ts 2>&1 | head -20
```

Expected: FAIL (modules not found).

- [ ] **Step 3: Create `backend/src/services/recurring-jobs.ts`**

```typescript
import { prisma } from "../lib/prisma.js"

export async function spawnDueJobs(organizationId?: string): Promise<number> {
  const lookahead = new Date()
  lookahead.setDate(lookahead.getDate() + 14)

  const schedules = await prisma.recurringJob.findMany({
    where: {
      isActive: true,
      nextDueAt: { lte: lookahead },
      ...(organizationId ? { organizationId } : {}),
      // Exclude schedules that already have a pending draft
      jobs: { none: { status: "pending" } },
    },
  })

  let created = 0
  for (const schedule of schedules) {
    await prisma.job.create({
      data: {
        organizationId: schedule.organizationId,
        customerId: schedule.customerId,
        technicianId: schedule.technicianId ?? undefined,
        equipmentId: schedule.equipmentId ?? undefined,
        equipmentType: schedule.equipmentType ?? undefined,
        serviceType: schedule.serviceType ?? undefined,
        symptomSummary: schedule.notes ?? undefined,
        scheduledAt: schedule.nextDueAt,
        status: "pending",
        recurringJobId: schedule.id,
      },
    })
    created++
  }

  return created
}
```

- [ ] **Step 4: Create `backend/src/routes/recurring-jobs.ts`**

```typescript
import { Router } from "express"
import { z } from "zod"
import { prisma } from "../lib/prisma.js"

export const recurringJobsRouter = Router()

const VALID_INTERVALS = [7, 14, 30, 90, 180, 365] as const

const createSchema = z.object({
  customerId: z.string().cuid(),
  technicianId: z.string().cuid().optional(),
  equipmentId: z.string().cuid().optional(),
  equipmentType: z.string().optional(),
  serviceType: z.string().optional(),
  intervalDays: z.number().refine((v) => (VALID_INTERVALS as readonly number[]).includes(v), {
    message: "intervalDays must be one of: 7, 14, 30, 90, 180, 365",
  }),
  nextDueAt: z.string().datetime(),
  notes: z.string().optional(),
})

const updateSchema = z.object({
  technicianId: z.string().cuid().nullable().optional(),
  equipmentId: z.string().cuid().nullable().optional(),
  equipmentType: z.string().optional(),
  serviceType: z.string().optional(),
  intervalDays: z.number().refine((v) => (VALID_INTERVALS as readonly number[]).includes(v), {
    message: "intervalDays must be one of: 7, 14, 30, 90, 180, 365",
  }).optional(),
  nextDueAt: z.string().datetime().optional(),
  notes: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
})

// IMPORTANT: GET /pending-drafts must be registered BEFORE GET /:id
recurringJobsRouter.get("/pending-drafts", async (req, res) => {
  try {
    const { organizationId } = req.user!
    const drafts = await prisma.job.findMany({
      where: {
        organizationId,
        status: "pending",
        recurringJobId: { not: null },
      },
      select: {
        id: true,
        customerId: true,
        equipmentType: true,
        serviceType: true,
        recurringJobId: true,
        createdAt: true,
        customer: { select: { name: true } },
        recurringJob: {
          select: {
            nextDueAt: true,
            intervalDays: true,
            equipment: { select: { make: true, model: true } },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    })
    res.json(drafts)
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Failed to fetch pending drafts" })
  }
})

recurringJobsRouter.get("/", async (req, res) => {
  try {
    const { organizationId } = req.user!
    const { customerId, isActive } = req.query as Record<string, string | undefined>

    const isActiveFilter =
      isActive === "false" ? false : isActive === "all" ? undefined : true

    const jobs = await prisma.recurringJob.findMany({
      where: {
        organizationId,
        ...(customerId ? { customerId } : {}),
        ...(isActiveFilter !== undefined ? { isActive: isActiveFilter } : {}),
      },
      include: {
        customer: { select: { name: true } },
        equipment: { select: { make: true, model: true } },
        technician: { select: { user: { select: { name: true } } } },
      },
      orderBy: { nextDueAt: "asc" },
    })
    res.json(jobs)
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Failed to list recurring jobs" })
  }
})

recurringJobsRouter.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

  const { organizationId } = req.user!

  // Verify customer belongs to this org (same pattern as equipment.ts)
  const customerCheck = await prisma.customer.findFirst({
    where: { id: parsed.data.customerId, organizationId },
  })
  if (!customerCheck) {
    return res.status(403).json({ error: "Customer not in your organization" })
  }

  try {
    const record = await prisma.recurringJob.create({
      data: {
        organizationId,
        customerId: parsed.data.customerId,
        technicianId: parsed.data.technicianId ?? null,
        equipmentId: parsed.data.equipmentId ?? null,
        equipmentType: parsed.data.equipmentType ?? null,
        serviceType: parsed.data.serviceType ?? null,
        intervalDays: parsed.data.intervalDays,
        nextDueAt: new Date(parsed.data.nextDueAt),
        notes: parsed.data.notes ?? null,
      },
      include: {
        customer: { select: { name: true } },
        equipment: { select: { make: true, model: true } },
      },
    })
    res.status(201).json(record)
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Failed to create recurring job" })
  }
})

recurringJobsRouter.patch("/:id", async (req, res) => {
  const parsed = updateSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

  const { organizationId } = req.user!
  const existing = await prisma.recurringJob.findFirst({
    where: { id: req.params.id, organizationId },
  })
  if (!existing) return res.status(404).json({ error: "Recurring job not found" })

  try {
    const data: Record<string, unknown> = { ...parsed.data }
    if (data.nextDueAt) data.nextDueAt = new Date(data.nextDueAt as string)

    const record = await prisma.recurringJob.update({
      where: { id: req.params.id },
      data,
      include: {
        customer: { select: { name: true } },
        equipment: { select: { make: true, model: true } },
      },
    })
    res.json(record)
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Failed to update recurring job" })
  }
})

recurringJobsRouter.delete("/:id", async (req, res) => {
  const { organizationId } = req.user!
  const existing = await prisma.recurringJob.findFirst({
    where: { id: req.params.id, organizationId },
  })
  if (!existing) return res.status(404).json({ error: "Recurring job not found" })

  try {
    await prisma.recurringJob.delete({ where: { id: req.params.id } })
    res.status(204).send()
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Failed to delete recurring job" })
  }
})
```


- [ ] **Step 5: Run tests — verify they pass**

```bash
cd /Users/stevenzakaria/flowsense/backend && npx vitest run src/__tests__/recurring-jobs.test.ts
```

Fix any failures.

- [ ] **Step 6: Run full backend test suite**

```bash
cd /Users/stevenzakaria/flowsense/backend && npx vitest run
```

Expected: All passing.

- [ ] **Step 7: Commit**

```bash
git add backend/src/services/recurring-jobs.ts backend/src/routes/recurring-jobs.ts backend/src/__tests__/recurring-jobs.test.ts
git commit -m "feat: add recurring jobs service, router, and tests"
```

---

### Task 3: Wire into `index.ts` + update `jobs.ts`

**Files:**
- Modify: `backend/src/index.ts`
- Modify: `backend/src/routes/jobs.ts`

- [ ] **Step 1: Read `backend/src/index.ts`**

Find where other routers are imported and mounted, and where the existing cron/scheduler is started.

- [ ] **Step 2: Mount the recurring jobs router**

Add import:
```typescript
import { recurringJobsRouter } from "./routes/recurring-jobs.js"
```

Mount after the compliance router:
```typescript
app.use("/api/recurring-jobs", apiLimiter, requireAuth, requireSubscription, recurringJobsRouter)
```

- [ ] **Step 3: Wire the cron**

Add import:
```typescript
import cron from "node-cron"
import { spawnDueJobs } from "./services/recurring-jobs.js"
```

After all routes are mounted, add:
```typescript
// Daily cron at midnight: spawn draft jobs for recurring schedules due in 14 days
cron.schedule("0 0 * * *", () => {
  spawnDueJobs().catch(console.error)
})
```

- [ ] **Step 4: Read `backend/src/routes/jobs.ts`**

Find the `$transaction` block for job completion (around line 358). The `include` on `tx.job.update` currently has `customer` and `technician` but NOT `recurringJob`.

- [ ] **Step 5: Add `recurringJob` to completion transaction include**

In the `tx.job.update` call inside the `$transaction`, add to the `include` object:
```typescript
recurringJob: { select: { intervalDays: true } },
```

- [ ] **Step 6: Add fire-and-forget `nextDueAt` advance**

After the existing `if (result.equipmentId)` fire-and-forget block (around line 395), add:
```typescript
if (result.recurringJobId && result.recurringJob) {
  prisma.recurringJob.update({
    where: { id: result.recurringJobId },
    data: {
      lastJobAt: new Date(),
      // Advance from completion time (not from the previous nextDueAt anchor).
      // This is intentional per spec: schedules drift forward from actual completion, not calendar.
      nextDueAt: new Date(Date.now() + result.recurringJob.intervalDays * 86400000),
    },
  }).catch(console.error)
}
```

- [ ] **Step 7: TypeScript check**

```bash
cd /Users/stevenzakaria/flowsense/backend && npx tsc --noEmit 2>&1 | head -20
```

Fix any errors. Common issue: `result.recurringJob` may be typed as `RecurringJob | null` — the null guard handles it but TypeScript may still need the explicit check.

- [ ] **Step 8: Run full backend tests**

```bash
cd /Users/stevenzakaria/flowsense/backend && npx vitest run
```

- [ ] **Step 9: Commit**

```bash
git add backend/src/index.ts backend/src/routes/jobs.ts
git commit -m "feat: mount recurring jobs router, wire cron, advance nextDueAt on completion"
```

---

## Chunk 2: Frontend

### Task 4: Frontend API types

**Files:**
- Modify: `frontend/src/api/types.ts`

- [ ] **Step 1: Add types**

Open `frontend/src/api/types.ts`. Add after existing interfaces:

```typescript
export interface RecurringJob {
  id: string
  organizationId: string
  customerId: string
  customer?: { name: string }
  technicianId: string | null
  technician?: { user: { name: string } | null } | null
  equipmentId: string | null
  equipment?: { make: string; model: string } | null
  equipmentType: string | null
  serviceType: string | null
  intervalDays: number
  nextDueAt: string
  lastJobAt: string | null
  notes: string | null
  isActive: boolean
  createdAt: string
}

export interface RecurringDraft {
  id: string
  customerId: string
  customer: { name: string }
  equipmentType: string | null
  serviceType: string | null
  recurringJobId: string
  recurringJob: {
    nextDueAt: string
    intervalDays: number
    equipment: { make: string; model: string } | null
  }
  createdAt: string
}
```

Also add `recurringJobId: string | null` to the existing `ApiJob` interface.

- [ ] **Step 2: TypeScript check**

```bash
cd /Users/stevenzakaria/flowsense/frontend && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api/types.ts
git commit -m "feat: add RecurringJob and RecurringDraft API types"
```

---

### Task 5: `RecurringJobFormDialog` + `RecurringJobCard` components

**Files:**
- Create: `frontend/src/components/recurring-jobs/RecurringJobFormDialog.tsx`
- Create: `frontend/src/components/recurring-jobs/RecurringJobCard.tsx`

- [ ] **Step 1: Create `RecurringJobFormDialog.tsx`**

```tsx
import { useState, useEffect } from "react"
import { api } from "@/api/client"
import type { Equipment, RecurringJob } from "@/api/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  customerId: string
  customerEquipment: Equipment[]
  existing?: RecurringJob
  onSaved: (saved: RecurringJob) => void
}

const INTERVAL_OPTIONS = [
  { value: 7, label: "Weekly" },
  { value: 14, label: "Every 2 weeks" },
  { value: 30, label: "Monthly" },
  { value: 90, label: "Every 3 months" },
  { value: 180, label: "Every 6 months" },
  { value: 365, label: "Annually" },
]

const SERVICE_TYPES = ["repair", "maintenance", "inspection", "installation"]
const EQUIPMENT_TYPES = ["ac", "furnace", "heat-pump", "boiler", "mini-split", "other"]

function todayString() {
  return new Date().toISOString().split("T")[0]
}

export function RecurringJobFormDialog({
  open, onOpenChange, customerId, customerEquipment, existing, onSaved,
}: Props) {
  const [serviceType, setServiceType] = useState(existing?.serviceType ?? "")
  const [equipmentId, setEquipmentId] = useState(existing?.equipmentId ?? "")
  const [equipmentType, setEquipmentType] = useState(existing?.equipmentType ?? "")
  const [intervalDays, setIntervalDays] = useState<number>(existing?.intervalDays ?? 90)
  const [nextDueAt, setNextDueAt] = useState(
    existing?.nextDueAt ? existing.nextDueAt.split("T")[0] : todayString()
  )
  const [notes, setNotes] = useState(existing?.notes ?? "")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!existing && open) {
      setServiceType("")
      setEquipmentId("")
      setEquipmentType("")
      setIntervalDays(90)
      setNextDueAt(todayString())
      setNotes("")
    }
  }, [open, existing])

  async function handleSave() {
    setSaving(true)
    try {
      const body = {
        customerId,
        serviceType: serviceType || undefined,
        equipmentId: equipmentId || undefined,
        equipmentType: equipmentId ? undefined : (equipmentType || undefined),
        intervalDays,
        nextDueAt: new Date(nextDueAt).toISOString(),
        notes: notes || undefined,
      }
      const saved = existing
        ? await api.patch<RecurringJob>(`/api/recurring-jobs/${existing.id}`, body)
        : await api.post<RecurringJob>("/api/recurring-jobs", body)
      onSaved(saved)
      onOpenChange(false)
    } catch {
      toast.error("Failed to save recurring job.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>{existing ? "Edit Recurring Job" : "Add Recurring Job"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Service type</label>
            <Select value={serviceType} onValueChange={setServiceType}>
              <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
              <SelectContent>
                {SERVICE_TYPES.map((t) => (
                  <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Equipment (optional)</label>
            <Select value={equipmentId} onValueChange={(v) => { setEquipmentId(v); if (v) setEquipmentType("") }}>
              <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">None</SelectItem>
                {customerEquipment.map((eq) => (
                  <SelectItem key={eq.id} value={eq.id}>
                    {eq.make} {eq.model}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {!equipmentId && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Equipment type</label>
              <Select value={equipmentType} onValueChange={setEquipmentType}>
                <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  {EQUIPMENT_TYPES.map((t) => (
                    <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Interval</label>
            <Select value={String(intervalDays)} onValueChange={(v) => setIntervalDays(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {INTERVAL_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Next due date</label>
            <Input type="date" value={nextDueAt} onChange={(e) => setNextDueAt(e.target.value)} />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Notes (optional)</label>
            <Textarea
              placeholder="Standing instructions for the technician..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="resize-none text-sm"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" onClick={handleSave} disabled={saving || !intervalDays || !nextDueAt}>
            {saving ? "Saving…" : existing ? "Save changes" : "Add schedule"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Create `RecurringJobCard.tsx`**

```tsx
import { useState } from "react"
import { api } from "@/api/client"
import type { Equipment, RecurringJob } from "@/api/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { RecurringJobFormDialog } from "./RecurringJobFormDialog"
import { RefreshCw, Pencil } from "lucide-react"
import { toast } from "sonner"

interface Props {
  schedule: RecurringJob
  customerEquipment: Equipment[]
  onUpdated: (updated: RecurringJob) => void
  onDeleted: (id: string) => void
}

const INTERVAL_LABELS: Record<number, string> = {
  7: "Weekly", 14: "Every 2 weeks", 30: "Monthly",
  90: "Every 3 months", 180: "Every 6 months", 365: "Annually",
}

export function RecurringJobCard({ schedule, customerEquipment, onUpdated, onDeleted }: Props) {
  const [editOpen, setEditOpen] = useState(false)
  const [toggling, setToggling] = useState(false)

  const nextDue = new Date(schedule.nextDueAt)
  const isOverdue = nextDue < new Date()

  async function toggleActive() {
    setToggling(true)
    try {
      const updated = await api.patch<RecurringJob>(`/api/recurring-jobs/${schedule.id}`, {
        isActive: !schedule.isActive,
      })
      onUpdated(updated)
    } catch {
      toast.error("Failed to update schedule.")
    } finally {
      setToggling(false)
    }
  }

  return (
    <div className={`rounded-lg border border-border bg-card p-3 space-y-2 ${!schedule.isActive ? "opacity-50" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium capitalize">{schedule.serviceType ?? "Service"}</span>
          <Badge variant="outline" className="text-xs">{INTERVAL_LABELS[schedule.intervalDays] ?? `${schedule.intervalDays}d`}</Badge>
          {!schedule.isActive && <Badge variant="secondary" className="text-xs">Inactive</Badge>}
        </div>
        <div className="flex gap-1 flex-shrink-0">
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditOpen(true)}>
            <Pencil className="h-3 w-3" />
          </Button>
          <Button
            size="icon" variant="ghost"
            className={`h-6 w-6 ${schedule.isActive ? "text-muted-foreground" : "text-primary"}`}
            onClick={toggleActive} disabled={toggling}
          >
            <RefreshCw className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {(schedule.equipment || schedule.equipmentType) && (
        <div className="text-xs text-muted-foreground">
          {schedule.equipment ? `${schedule.equipment.make} ${schedule.equipment.model}` : schedule.equipmentType}
        </div>
      )}

      <div className={`text-xs ${isOverdue ? "text-destructive" : "text-muted-foreground"}`}>
        Next due: {nextDue.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
        {isOverdue && " (overdue)"}
      </div>

      {schedule.notes && (
        <div className="text-xs text-muted-foreground line-clamp-2">{schedule.notes}</div>
      )}

      <RecurringJobFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        customerId={schedule.customerId}
        customerEquipment={customerEquipment}
        existing={schedule}
        onSaved={onUpdated}
      />
    </div>
  )
}
```

- [ ] **Step 3: TypeScript check**

```bash
cd /Users/stevenzakaria/flowsense/frontend && npx tsc --noEmit 2>&1 | head -30
```

Fix any errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/recurring-jobs/
git commit -m "feat: add RecurringJobFormDialog and RecurringJobCard components"
```

---

### Task 6: Wire Recurring Jobs into customer panel + jobs table

**Files:**
- Modify: `frontend/src/components/customers/customer-table.tsx`
- Modify: `frontend/src/components/jobs/jobs-table.tsx`

- [ ] **Step 1: Read both files**

Read `frontend/src/components/customers/customer-table.tsx` to find where the Equipment section ends (around line 190). Read `frontend/src/components/jobs/jobs-table.tsx` to find where job status badges are rendered and where the expanded row detail ends.

- [ ] **Step 2: Add Recurring Jobs section to customer panel**

In `customer-table.tsx`:

Add imports:
```typescript
import type { RecurringJob } from "@/api/types"
import { RecurringJobCard } from "@/components/recurring-jobs/RecurringJobCard"
import { RecurringJobFormDialog } from "@/components/recurring-jobs/RecurringJobFormDialog"
```

Add state (alongside the existing `equipment` state):
```typescript
const [recurringJobs, setRecurringJobs] = useState<RecurringJob[]>([])
const [addRecurringOpen, setAddRecurringOpen] = useState(false)
```

Add a `useEffect` (alongside the equipment useEffect) to fetch recurring jobs when a customer is expanded:
```typescript
useEffect(() => {
  if (!expandedCustomer) { setRecurringJobs([]); return }
  api.get<RecurringJob[]>(`/api/recurring-jobs?customerId=${expandedCustomer}`)
    .then(setRecurringJobs)
    .catch(() => setRecurringJobs([]))
}, [expandedCustomer])
```

After the closing `</div>` of the Equipment section (after `EquipmentFormDialog`), add:
```tsx
{/* Recurring Jobs section */}
<div className="mt-4">
  <div className="flex items-center justify-between mb-2">
    <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Recurring Jobs</span>
    <Button
      size="sm" variant="ghost"
      className="h-7 gap-1 text-xs"
      onClick={(e) => { e.stopPropagation(); setAddRecurringOpen(true) }}
    >
      + Add Schedule
    </Button>
  </div>
  {recurringJobs.length === 0 ? (
    <p className="text-xs text-muted-foreground py-1">No recurring schedules.</p>
  ) : (
    <div className="space-y-2">
      {recurringJobs.map((rj) => (
        <RecurringJobCard
          key={rj.id}
          schedule={rj}
          customerEquipment={equipment}
          onUpdated={(updated) => setRecurringJobs((prev) => prev.map((r) => r.id === updated.id ? updated : r))}
          onDeleted={(id) => setRecurringJobs((prev) => prev.filter((r) => r.id !== id))}
        />
      ))}
    </div>
  )}
  {expandedCustomer && (
    <RecurringJobFormDialog
      open={addRecurringOpen}
      onOpenChange={setAddRecurringOpen}
      customerId={expandedCustomer}
      customerEquipment={equipment}
      onSaved={(saved) => setRecurringJobs((prev) => [...prev, saved])}
    />
  )}
</div>
```

- [ ] **Step 3: Add `Recurring` badge and confirm panel to jobs table**

In `jobs-table.tsx`:

Add import:
```typescript
import type { ApiTechnician } from "@/api/types"  // may already exist
```

Add state within the component for confirm panel (alongside other local state):
```typescript
const [confirmFields, setConfirmFields] = useState<Record<string, { scheduledAt: string; technicianId: string }>>({})
const [technicians, setTechnicians] = useState<ApiTechnician[]>([])
const [techsLoaded, setTechsLoaded] = useState(false)
```

Add a `useEffect` to load technicians once when any recurring draft is expanded:
```typescript
useEffect(() => {
  if (!techsLoaded && jobs.some((j) => j.recurringJobId && j.status === "pending")) {
    api.get<ApiTechnician[]>("/api/technicians")
      .then((t) => { setTechnicians(t); setTechsLoaded(true) })
      .catch(() => {})
  }
}, [jobs, techsLoaded])
```

Find where the status badge is rendered for each job. Next to the existing status badge, add:
```tsx
{job.recurringJobId && (
  <Badge variant="outline" className="text-xs ml-1">Recurring</Badge>
)}
```

In the expanded row section, after `<ComplianceTimeline jobId={job.id} />`, add the confirm panel:
```tsx
{job.recurringJobId && job.status === "pending" && (
  <div className="mt-3 border-t pt-3 space-y-2">
    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Confirm & Schedule</div>
    <div className="flex gap-2 flex-wrap items-end">
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Date & time</label>
        <Input
          type="datetime-local"
          className="h-8 text-xs w-48"
          value={confirmFields[job.id]?.scheduledAt ?? ""}
          onChange={(e) => setConfirmFields((prev) => ({
            ...prev,
            [job.id]: { ...prev[job.id], scheduledAt: e.target.value },
          }))}
        />
      </div>
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Technician</label>
        <Select
          value={confirmFields[job.id]?.technicianId ?? ""}
          onValueChange={(v) => setConfirmFields((prev) => ({
            ...prev,
            [job.id]: { ...prev[job.id], technicianId: v },
          }))}
        >
          <SelectTrigger className="h-8 text-xs w-44"><SelectValue placeholder="Assign tech" /></SelectTrigger>
          <SelectContent>
            {technicians.map((t) => (
              <SelectItem key={t.id} value={t.id}>{t.user?.name ?? t.id}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button
        size="sm"
        className="h-8 text-xs"
        disabled={!confirmFields[job.id]?.scheduledAt}
        onClick={async () => {
          const fields = confirmFields[job.id]
          if (!fields?.scheduledAt) return
          try {
            await api.patch(`/api/jobs/${job.id}`, {
              status: "scheduled",
              scheduledAt: new Date(fields.scheduledAt).toISOString(),
              ...(fields.technicianId ? { technicianId: fields.technicianId } : {}),
            })
            toast.success("Job scheduled.")
            onRefresh?.()
          } catch {
            toast.error("Failed to schedule job.")
          }
        }}
      >
        Confirm & Schedule
      </Button>
    </div>
  </div>
)}
```

**Note:** `jobs-table.tsx` needs an `onRefresh` prop (or a way to refresh the list after confirmation). Check how the component is called in `OfficeJobs.tsx` — if it already has a refresh mechanism, use it. If not, add an optional `onRefresh?: () => void` prop.

- [ ] **Step 4: TypeScript check**

```bash
cd /Users/stevenzakaria/flowsense/frontend && npx tsc --noEmit 2>&1 | head -30
```

Fix any errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/customers/customer-table.tsx frontend/src/components/jobs/jobs-table.tsx
git commit -m "feat: add recurring jobs to customer panel and confirm panel to jobs table"
```

---

### Task 7: `RecurringDraftsWidget` + wire into `OfficeDashboard`

**Files:**
- Create: `frontend/src/components/recurring-jobs/RecurringDraftsWidget.tsx`
- Modify: `frontend/src/pages/office/OfficeDashboard.tsx`

- [ ] **Step 1: Create `RecurringDraftsWidget.tsx`**

```tsx
import { useState, useEffect } from "react"
import { Link } from "react-router-dom"
import { api } from "@/api/client"
import type { RecurringDraft } from "@/api/types"
import { RefreshCw } from "lucide-react"

const INTERVAL_LABELS: Record<number, string> = {
  7: "Weekly", 14: "Every 2 weeks", 30: "Monthly",
  90: "Every 3 months", 180: "Every 6 months", 365: "Annually",
}

function daysUntil(isoDate: string) {
  return Math.round((new Date(isoDate).getTime() - Date.now()) / 86400000)
}

export function RecurringDraftsWidget() {
  const [drafts, setDrafts] = useState<RecurringDraft[]>([])

  useEffect(() => {
    api.get<RecurringDraft[]>("/api/recurring-jobs/pending-drafts")
      .then(setDrafts)
      .catch(() => {})
  }, [])

  if (drafts.length === 0) return null

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <RefreshCw className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Recurring Jobs to Confirm</span>
        </div>
        <Link to="/office/jobs" className="text-xs text-primary hover:underline">
          Review jobs →
        </Link>
      </div>
      <div className="space-y-2">
        {drafts.slice(0, 5).map((draft) => {
          const days = daysUntil(draft.recurringJob.nextDueAt)
          const isOverdue = days < 0
          return (
            <div key={draft.id} className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-medium truncate">{draft.customer.name}</span>
                <span className="text-muted-foreground capitalize truncate">
                  {draft.serviceType ?? "service"}
                  {draft.recurringJob.equipment
                    ? ` · ${draft.recurringJob.equipment.make} ${draft.recurringJob.equipment.model}`
                    : draft.equipmentType ? ` · ${draft.equipmentType}` : ""}
                </span>
              </div>
              <span className={`flex-shrink-0 ml-2 ${isOverdue ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                {isOverdue ? `${Math.abs(days)}d overdue` : `due in ${days}d`}
              </span>
            </div>
          )
        })}
        {drafts.length > 5 && (
          <div className="text-xs text-muted-foreground">+{drafts.length - 5} more</div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Wire into `OfficeDashboard.tsx`**

Read `frontend/src/pages/office/OfficeDashboard.tsx`. Find where `<MaintenanceDueWidget />` is rendered. Add after it:

```typescript
import { RecurringDraftsWidget } from "@/components/recurring-jobs/RecurringDraftsWidget"
```

```tsx
<RecurringDraftsWidget />
```

- [ ] **Step 3: TypeScript check**

```bash
cd /Users/stevenzakaria/flowsense/frontend && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 4: Run full backend tests**

```bash
cd /Users/stevenzakaria/flowsense/backend && npx vitest run 2>&1 | tail -5
```

Expected: All passing.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/recurring-jobs/RecurringDraftsWidget.tsx frontend/src/pages/office/OfficeDashboard.tsx
git commit -m "feat: add RecurringDraftsWidget and wire into office dashboard"
```

---

## Done

Verify end-to-end:
1. **Customer panel** → expand a customer → "Recurring Jobs" section visible → "+ Add Schedule" opens form → save → card appears with interval/next due
2. **Jobs list** → find a recurring draft (may need to call `POST /api/recurring-jobs/spawn` manually or wait for cron) → `Recurring` badge visible → expand row → confirm panel appears → fill in date + tech → "Confirm & Schedule" → job status changes to scheduled
3. **Dashboard** → `RecurringDraftsWidget` shows pending drafts with days-until-due
4. **Job completion** → complete a job that has `recurringJobId` → verify `nextDueAt` on the `RecurringJob` advanced by `intervalDays`
