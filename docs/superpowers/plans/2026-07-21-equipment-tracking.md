# Equipment Tracking Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-customer equipment registry with service history and maintenance scheduling — asset cards on customer profiles, a dashboard maintenance widget, an equipment picker in job creation, and equipment context in the technician job view.

**Architecture:** New `Equipment` Prisma model linked to `Customer` and `Organization`. `Job` gains an optional `equipmentId` FK. Backend CRUD + history + check-maintenance routes at `/api/equipment`. Frontend: three new components (`EquipmentCard`, `EquipmentFormDialog`, `MaintenanceDueWidget`) wired into existing pages (`OfficeCustomers`, `OfficeDashboard`, `CreateJobDialog`, `TechnicianJobs`).

**Tech Stack:** Prisma, Zod, Express, React, TypeScript, shadcn/ui (Dialog, Select, Card, Button, Badge)

**Spec:** `docs/superpowers/specs/2026-07-21-equipment-tracking-design.md`

---

## File Map

**Create:**
- `backend/src/routes/equipment.ts` — GET, POST, PATCH, DELETE, GET /:id/history, POST /check-maintenance
- `backend/src/__tests__/equipment.test.ts` — route tests
- `frontend/src/components/equipment/EquipmentCard.tsx` — single unit display
- `frontend/src/components/equipment/EquipmentFormDialog.tsx` — create/edit modal
- `frontend/src/components/equipment/MaintenanceDueWidget.tsx` — dashboard widget

**Modify:**
- `backend/prisma/schema.prisma` — Equipment model, Job.equipmentId, back-relations
- `backend/src/routes/jobs.ts` — update lastServicedAt on job completion
- `backend/src/index.ts` — mount equipmentRouter
- `frontend/src/api/types.ts` — Equipment type, equipmentId on ApiJob
- `frontend/src/pages/office/OfficeCustomers.tsx` — Equipment tab on customer detail
- `frontend/src/pages/office/OfficeDashboard.tsx` — MaintenanceDueWidget
- `frontend/src/components/jobs/create-job-dialog.tsx` — equipment picker
- `frontend/src/pages/technician/TechnicianJobs.tsx` — equipment context block

---

## Chunk 1: Backend

### Task 1: Schema migration — Equipment model

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Run: `npx prisma migrate dev`

- [ ] **Step 1: Add Equipment model**

Open `backend/prisma/schema.prisma`. Add after the `AiMessage` model:

```prisma
model Equipment {
  id             String       @id @default(cuid())
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  customerId     String
  customer       Customer     @relation(fields: [customerId], references: [id], onDelete: Cascade)

  equipmentType         String    // furnace | ac | heat-pump | boiler | mini-split | other
  make                  String?
  model                 String?
  serialNumber          String?
  installDate           DateTime?
  warrantyExpiry        DateTime?
  serviceIntervalMonths Int?      // null = no scheduled maintenance
  lastServicedAt        DateTime?
  notes                 String?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  jobs Job[]

  @@index([organizationId])
  @@index([customerId])
}
```

- [ ] **Step 2: Add equipmentId to Job model**

In the `Job` model, after `technicianId String?` / `technician Technician?` lines, add:

```prisma
  equipmentId  String?
  equipment    Equipment? @relation(fields: [equipmentId], references: [id], onDelete: SetNull)
```

Add `@@index([equipmentId])` to the Job model's index list.

- [ ] **Step 3: Add back-relations**

Add to `Customer` model:
```prisma
  equipment Equipment[]
```

Add to `Organization` model:
```prisma
  equipment Equipment[]
```

- [ ] **Step 4: Run migration**

```bash
cd backend && npx prisma migrate dev --name add_equipment
```

Expected: Migration created and applied.

- [ ] **Step 5: Validate**

```bash
cd backend && npx prisma validate
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/
git commit -m "feat: add Equipment schema with Job.equipmentId and back-relations"
```

---

### Task 2: Equipment routes + tests

**Files:**
- Create: `backend/src/routes/equipment.ts`
- Create: `backend/src/__tests__/equipment.test.ts`

- [ ] **Step 1: Write failing tests**

Create `backend/src/__tests__/equipment.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest"
import express from "express"
import request from "supertest"

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    equipment: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    customer: { findFirst: vi.fn() },
    job: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
  },
}))

import { equipmentRouter } from "../routes/equipment.js"
import { prisma } from "../lib/prisma.js"

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    ;(req as any).user = { id: "user-1", organizationId: "org-1", role: "office" }
    next()
  })
  app.use("/api/equipment", equipmentRouter)
  return app
}

describe("GET /api/equipment", () => {
  beforeEach(() => { vi.clearAllMocks() })

  it("returns equipment list for the org", async () => {
    vi.mocked(prisma.equipment.findMany).mockResolvedValue([
      { id: "eq-1", equipmentType: "ac", serviceIntervalMonths: 12,
        lastServicedAt: null, installDate: null, createdAt: new Date() } as any,
    ])
    const app = buildApp()
    const res = await request(app).get("/api/equipment")
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body[0]).toHaveProperty("nextDueAt")
  })

  it("filters by customerId when provided", async () => {
    vi.mocked(prisma.equipment.findMany).mockResolvedValue([])
    const app = buildApp()
    await request(app).get("/api/equipment?customerId=cust-1")
    expect(prisma.equipment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ customerId: "cust-1" }) })
    )
  })
})

describe("POST /api/equipment", () => {
  beforeEach(() => { vi.clearAllMocks() })

  it("returns 400 for missing required fields", async () => {
    const app = buildApp()
    const res = await request(app).post("/api/equipment").send({ customerId: "cust-1" })
    expect(res.status).toBe(400)
  })

  it("returns 403 when customer not in org", async () => {
    vi.mocked(prisma.customer.findFirst).mockResolvedValue(null)
    const app = buildApp()
    const res = await request(app).post("/api/equipment").send({
      customerId: "cust-other",
      equipmentType: "ac",
    })
    expect(res.status).toBe(403)
  })

  it("creates equipment and returns 201", async () => {
    vi.mocked(prisma.customer.findFirst).mockResolvedValue({ id: "cust-1" } as any)
    vi.mocked(prisma.equipment.create).mockResolvedValue({ id: "eq-1", equipmentType: "ac" } as any)
    const app = buildApp()
    const res = await request(app).post("/api/equipment").send({
      customerId: "cust-1",
      equipmentType: "ac",
    })
    expect(res.status).toBe(201)
  })
})

describe("PATCH /api/equipment/:id", () => {
  beforeEach(() => { vi.clearAllMocks() })

  it("returns 404 when equipment not found", async () => {
    vi.mocked(prisma.equipment.findFirst).mockResolvedValue(null)
    const app = buildApp()
    const res = await request(app).patch("/api/equipment/bad-id").send({ make: "Carrier" })
    expect(res.status).toBe(404)
  })
})

describe("DELETE /api/equipment/:id", () => {
  beforeEach(() => { vi.clearAllMocks() })

  it("returns 404 when equipment not found", async () => {
    vi.mocked(prisma.equipment.findFirst).mockResolvedValue(null)
    const app = buildApp()
    const res = await request(app).delete("/api/equipment/bad-id")
    expect(res.status).toBe(404)
  })

  it("deletes and returns 204", async () => {
    vi.mocked(prisma.equipment.findFirst).mockResolvedValue({ id: "eq-1", organizationId: "org-1" } as any)
    vi.mocked(prisma.equipment.delete).mockResolvedValue({} as any)
    const app = buildApp()
    const res = await request(app).delete("/api/equipment/eq-1")
    expect(res.status).toBe(204)
  })
})

describe("POST /api/equipment/check-maintenance", () => {
  beforeEach(() => { vi.clearAllMocks() })

  it("creates draft jobs for due units", async () => {
    const pastDate = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000) // 400 days ago
    vi.mocked(prisma.equipment.findMany).mockResolvedValue([
      {
        id: "eq-1", customerId: "cust-1", equipmentType: "ac",
        organizationId: "org-1", serviceIntervalMonths: 12,
        lastServicedAt: pastDate, installDate: null, createdAt: pastDate,
      } as any,
    ])
    vi.mocked(prisma.job.findFirst).mockResolvedValue(null) // no existing job
    vi.mocked(prisma.job.create).mockResolvedValue({ id: "job-new" } as any)
    const app = buildApp()
    const res = await request(app).post("/api/equipment/check-maintenance")
    expect(res.status).toBe(200)
    expect(res.body.created).toHaveLength(1)
    expect(prisma.job.create).toHaveBeenCalledTimes(1)
  })

  it("skips units with existing pending/scheduled jobs", async () => {
    const pastDate = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000)
    vi.mocked(prisma.equipment.findMany).mockResolvedValue([
      {
        id: "eq-1", customerId: "cust-1", equipmentType: "ac",
        organizationId: "org-1", serviceIntervalMonths: 12,
        lastServicedAt: pastDate, installDate: null, createdAt: pastDate,
      } as any,
    ])
    vi.mocked(prisma.job.findFirst).mockResolvedValue({ id: "existing-job" } as any)
    const app = buildApp()
    const res = await request(app).post("/api/equipment/check-maintenance")
    expect(res.status).toBe(200)
    expect(res.body.created).toHaveLength(0)
    expect(prisma.job.create).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd backend && npx vitest run src/__tests__/equipment.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `backend/src/routes/equipment.ts`**

```typescript
import { Router } from "express"
import { z } from "zod"
import { addMonths } from "date-fns"
import { prisma } from "../lib/prisma.js"

export const equipmentRouter = Router()

function computeNextDueAt(eq: {
  serviceIntervalMonths: number | null
  lastServicedAt: Date | null
  installDate: Date | null
  createdAt: Date
}): Date | null {
  if (!eq.serviceIntervalMonths) return null
  const base = eq.lastServicedAt ?? eq.installDate ?? eq.createdAt
  return addMonths(base, eq.serviceIntervalMonths)
}

// GET /api/equipment
equipmentRouter.get("/", async (req, res) => {
  const { organizationId } = req.user!
  const { customerId, maintenanceDue } = req.query

  const where: Record<string, unknown> = { organizationId }
  if (customerId) where.customerId = customerId as string

  const equipment = await prisma.equipment.findMany({ where, orderBy: { createdAt: "desc" } })

  const now = new Date()
  const thirtyDaysOut = addMonths(now, 1)

  const result = equipment
    .map((eq) => ({
      ...eq,
      nextDueAt: computeNextDueAt(eq)?.toISOString() ?? null,
    }))
    .filter((eq) => {
      if (maintenanceDue !== "true") return true
      if (!eq.nextDueAt) return false
      return new Date(eq.nextDueAt) <= thirtyDaysOut
    })

  res.json(result)
})

const createSchema = z.object({
  customerId: z.string().min(1),
  equipmentType: z.string().min(1),
  make: z.string().optional(),
  model: z.string().optional(),
  serialNumber: z.string().optional(),
  installDate: z.string().datetime({ offset: true }).optional(),
  warrantyExpiry: z.string().datetime({ offset: true }).optional(),
  serviceIntervalMonths: z.number().int().positive().optional(),
  notes: z.string().optional(),
})

// POST /api/equipment
equipmentRouter.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

  const { organizationId } = req.user!
  const { customerId, ...rest } = parsed.data

  const customer = await prisma.customer.findFirst({ where: { id: customerId, organizationId } })
  if (!customer) return res.status(403).json({ error: "customer_not_in_org" })

  const equipment = await prisma.equipment.create({
    data: {
      organizationId,
      customerId,
      ...rest,
      installDate: rest.installDate ? new Date(rest.installDate) : undefined,
      warrantyExpiry: rest.warrantyExpiry ? new Date(rest.warrantyExpiry) : undefined,
    },
  })
  res.status(201).json({ ...equipment, nextDueAt: computeNextDueAt(equipment)?.toISOString() ?? null })
})

const updateSchema = createSchema.partial().omit({ customerId: true })

// PATCH /api/equipment/:id
equipmentRouter.patch("/:id", async (req, res) => {
  const parsed = updateSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

  const { organizationId } = req.user!
  const existing = await prisma.equipment.findFirst({ where: { id: req.params.id, organizationId } })
  if (!existing) return res.status(404).json({ error: "not_found" })

  const { installDate, warrantyExpiry, ...rest } = parsed.data
  const equipment = await prisma.equipment.update({
    where: { id: req.params.id },
    data: {
      ...rest,
      ...(installDate !== undefined && { installDate: new Date(installDate) }),
      ...(warrantyExpiry !== undefined && { warrantyExpiry: new Date(warrantyExpiry) }),
    },
  })
  res.json({ ...equipment, nextDueAt: computeNextDueAt(equipment)?.toISOString() ?? null })
})

// DELETE /api/equipment/:id
equipmentRouter.delete("/:id", async (req, res) => {
  const { organizationId } = req.user!
  const existing = await prisma.equipment.findFirst({ where: { id: req.params.id, organizationId } })
  if (!existing) return res.status(404).json({ error: "not_found" })

  await prisma.equipment.delete({ where: { id: req.params.id } })
  res.status(204).send()
})

// GET /api/equipment/:id/history
equipmentRouter.get("/:id/history", async (req, res) => {
  const { organizationId } = req.user!
  const equipment = await prisma.equipment.findFirst({ where: { id: req.params.id, organizationId } })
  if (!equipment) return res.status(404).json({ error: "not_found" })

  const jobs = await prisma.job.findMany({
    where: { equipmentId: req.params.id },
    orderBy: { scheduledAt: "desc" },
  })
  res.json(jobs)
})

// POST /api/equipment/check-maintenance
equipmentRouter.post("/check-maintenance", async (req, res) => {
  const { organizationId } = req.user!
  const now = new Date()
  const thirtyDaysOut = addMonths(now, 1)

  const allEquipment = await prisma.equipment.findMany({
    where: { organizationId, serviceIntervalMonths: { not: null } },
  })

  const dueUnits = allEquipment.filter((eq) => {
    const nextDue = computeNextDueAt(eq)
    return nextDue && nextDue <= thirtyDaysOut
  })

  const created = []
  for (const unit of dueUnits) {
    const nextDue = computeNextDueAt(unit)!

    const existing = await prisma.job.findFirst({
      where: {
        equipmentId: unit.id,
        status: { in: ["pending", "scheduled"] },
      },
    })
    if (existing) continue

    const job = await prisma.job.create({
      data: {
        organizationId,
        customerId: unit.customerId,
        equipmentId: unit.id,
        status: "pending",
        priority: "normal",
        scheduledAt: nextDue,
        equipmentType: unit.equipmentType,
        serviceType: "maintenance",
        symptomSummary: `Scheduled maintenance — ${unit.equipmentType} tune-up`,
      },
    })
    created.push(job)
  }

  res.json({ created })
})
```

**Note:** `date-fns` is already installed (check `backend/package.json`). If not, install it: `cd backend && npm install date-fns`

- [ ] **Step 4: Check date-fns availability**

```bash
cd backend && node -e "import('date-fns').then(m => console.log('ok', Object.keys(m).slice(0,3)))" 2>/dev/null || npm install date-fns
```

- [ ] **Step 5: Run tests — verify they pass**

```bash
cd backend && npx vitest run src/__tests__/equipment.test.ts
```

Expected: All tests pass.

- [ ] **Step 6: Run full backend test suite**

```bash
cd backend && npx vitest run
```

Expected: All passing.

- [ ] **Step 7: Commit**

```bash
git add backend/src/routes/equipment.ts backend/src/__tests__/equipment.test.ts
git commit -m "feat: add equipment routes (CRUD, history, check-maintenance)"
```

---

### Task 3: Mount router + wire lastServicedAt into jobs completion

**Files:**
- Modify: `backend/src/index.ts`
- Modify: `backend/src/routes/jobs.ts`

- [ ] **Step 1: Mount in index.ts**

Add import near other route imports:
```typescript
import { equipmentRouter } from "./routes/equipment.js"
```

Add mount after the AI router line:
```typescript
app.use("/api/equipment", apiLimiter, requireAuth, requireSubscription, equipmentRouter);
```

- [ ] **Step 2: Wire lastServicedAt in jobs.ts**

In `backend/src/routes/jobs.ts`, find the PATCH handler where a job is updated. After the `job` update resolves and `parsed.data.status === "completed"`, add the fire-and-forget update:

```typescript
if (parsed.data.status === "completed" && job.equipmentId) {
  prisma.equipment.update({
    where: { id: job.equipmentId },
    data: { lastServicedAt: new Date() },
  }).catch(console.error)
}
```

`job` here is the result of the Prisma update (which includes `equipmentId`). Add this after the response is sent (fire-and-forget) or before `res.json(job)` if the update result is needed.

- [ ] **Step 3: Run full backend test suite**

```bash
cd backend && npx vitest run
```

Expected: All passing.

- [ ] **Step 4: Commit**

```bash
git add backend/src/index.ts backend/src/routes/jobs.ts
git commit -m "feat: mount equipmentRouter and update lastServicedAt on job completion"
```

---

## Chunk 2: Frontend Types + Components

### Task 4: Frontend API types

**Files:**
- Modify: `frontend/src/api/types.ts`

- [ ] **Step 1: Add Equipment interface and equipmentId to ApiJob**

Open `frontend/src/api/types.ts`. Add the `Equipment` interface near the other API types:

```typescript
export interface Equipment {
  id: string
  organizationId: string
  customerId: string
  equipmentType: string
  make: string | null
  model: string | null
  serialNumber: string | null
  installDate: string | null
  warrantyExpiry: string | null
  serviceIntervalMonths: number | null
  lastServicedAt: string | null
  notes: string | null
  nextDueAt: string | null
  createdAt: string
  updatedAt: string
}
```

Also add `equipmentId: string | null` to the `ApiJob` interface.

- [ ] **Step 2: Run TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api/types.ts
git commit -m "feat: add Equipment API type and equipmentId to ApiJob"
```

---

### Task 5: EquipmentCard + EquipmentFormDialog components

**Files:**
- Create: `frontend/src/components/equipment/EquipmentCard.tsx`
- Create: `frontend/src/components/equipment/EquipmentFormDialog.tsx`

- [ ] **Step 1: Create `frontend/src/components/equipment/EquipmentCard.tsx`**

```tsx
import { useState } from "react"
import type { Equipment } from "@/api/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Wrench, ChevronDown, ChevronUp, AlertTriangle } from "lucide-react"
import { api } from "@/api/client"
import { toast } from "sonner"
import { EquipmentFormDialog } from "./EquipmentFormDialog"

interface Props {
  equipment: Equipment
  onUpdated: (eq: Equipment) => void
  onDeleted: (id: string) => void
}

function formatDate(iso: string | null) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString("en-US", { month: "short", year: "numeric" })
}

function isExpired(iso: string | null) {
  if (!iso) return false
  return new Date(iso) < new Date()
}

function isDue(nextDueAt: string | null) {
  if (!nextDueAt) return false
  const thirtyDaysOut = new Date()
  thirtyDaysOut.setDate(thirtyDaysOut.getDate() + 30)
  return new Date(nextDueAt) <= thirtyDaysOut
}

function daysUntil(iso: string | null) {
  if (!iso) return null
  const diff = Math.round((new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  return diff
}

export function EquipmentCard({ equipment: eq, onUpdated, onDeleted }: Props) {
  const [historyOpen, setHistoryOpen] = useState(false)
  const [history, setHistory] = useState<{ id: string; scheduledAt: string; symptomSummary: string | null; status: string }[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const title = [eq.make, eq.model].filter(Boolean).join(" ") || eq.equipmentType
  const due = isDue(eq.nextDueAt)
  const expired = isExpired(eq.warrantyExpiry)
  const days = daysUntil(eq.nextDueAt)

  async function toggleHistory() {
    if (!historyOpen && history.length === 0) {
      setLoadingHistory(true)
      try {
        const data = await api.get<typeof history>(`/api/equipment/${eq.id}/history`)
        setHistory(data)
      } catch {
        toast.error("Failed to load history")
      } finally {
        setLoadingHistory(false)
      }
    }
    setHistoryOpen((o) => !o)
  }

  async function handleDelete() {
    if (!confirm(`Delete ${title}? This cannot be undone.`)) return
    setDeleting(true)
    try {
      await api.delete(`/api/equipment/${eq.id}`)
      onDeleted(eq.id)
      toast.success("Equipment deleted")
    } catch {
      toast.error("Failed to delete equipment")
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Card className="border-border bg-card">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Wrench className="h-4 w-4 text-primary flex-shrink-0" />
              <span className="font-semibold text-sm">{title}</span>
              <span className="text-xs text-muted-foreground">— {eq.equipmentType}</span>
            </div>

            <div className="mt-1 text-xs text-muted-foreground space-y-0.5">
              {eq.serialNumber && <div>S/N: {eq.serialNumber}</div>}
              <div className="flex gap-3 flex-wrap">
                {eq.installDate && <span>Installed {formatDate(eq.installDate)}</span>}
                {eq.warrantyExpiry && (
                  <span className={expired ? "text-destructive" : ""}>
                    Warranty {expired ? "expired" : "exp."} {formatDate(eq.warrantyExpiry)}
                  </span>
                )}
              </div>
            </div>

            <div className="mt-2 flex items-center gap-2 flex-wrap">
              {due && (
                <Badge variant="destructive" className="text-xs gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  {days !== null && days < 0 ? `${Math.abs(days)}d overdue` : "Maintenance due"}
                </Badge>
              )}
              {eq.nextDueAt && !due && (
                <span className="text-xs text-muted-foreground">
                  Next due {days !== null && days > 0 ? `in ${days} days` : formatDate(eq.nextDueAt)}
                </span>
              )}
              {eq.lastServicedAt && (
                <span className="text-xs text-muted-foreground">
                  Last serviced {formatDate(eq.lastServicedAt)}
                </span>
              )}
            </div>
          </div>

          <div className="flex gap-2 flex-shrink-0">
            <Button size="sm" variant="outline" onClick={toggleHistory} disabled={loadingHistory}>
              History {historyOpen ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>Edit</Button>
            <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={handleDelete} disabled={deleting}>
              Delete
            </Button>
          </div>
        </div>

        {historyOpen && (
          <div className="mt-3 border-t pt-3 space-y-2">
            {history.length === 0 ? (
              <p className="text-xs text-muted-foreground">No service history yet.</p>
            ) : (
              history.slice(0, 5).map((j) => (
                <div key={j.id} className="text-xs flex gap-3">
                  <span className="text-muted-foreground w-20 flex-shrink-0">
                    {new Date(j.scheduledAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </span>
                  <span>{j.symptomSummary ?? "—"}</span>
                  <Badge variant="outline" className="text-xs ml-auto flex-shrink-0">{j.status}</Badge>
                </div>
              ))
            )}
          </div>
        )}
      </CardContent>

      <EquipmentFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        customerId={eq.customerId}
        existing={eq}
        onSaved={onUpdated}
      />
    </Card>
  )
}
```

- [ ] **Step 2: Create `frontend/src/components/equipment/EquipmentFormDialog.tsx`**

```tsx
import { useState, useEffect } from "react"
import type { Equipment } from "@/api/types"
import { api } from "@/api/client"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Loader2 } from "lucide-react"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  customerId: string
  existing?: Equipment
  onSaved: (eq: Equipment) => void
}

const EQUIPMENT_TYPES = ["ac", "furnace", "heat-pump", "boiler", "mini-split", "other"]
const INTERVALS = [
  { label: "None", value: "" },
  { label: "Every 3 months", value: "3" },
  { label: "Every 6 months", value: "6" },
  { label: "Every 12 months", value: "12" },
  { label: "Every 24 months", value: "24" },
]

function toDateInput(iso: string | null) {
  if (!iso) return ""
  return iso.split("T")[0]
}

export function EquipmentFormDialog({ open, onOpenChange, customerId, existing, onSaved }: Props) {
  const [equipmentType, setEquipmentType] = useState(existing?.equipmentType ?? "ac")
  const [make, setMake] = useState(existing?.make ?? "")
  const [model, setModel] = useState(existing?.model ?? "")
  const [serialNumber, setSerialNumber] = useState(existing?.serialNumber ?? "")
  const [installDate, setInstallDate] = useState(toDateInput(existing?.installDate ?? null))
  const [warrantyExpiry, setWarrantyExpiry] = useState(toDateInput(existing?.warrantyExpiry ?? null))
  const [serviceIntervalMonths, setServiceIntervalMonths] = useState(
    existing?.serviceIntervalMonths?.toString() ?? ""
  )
  const [notes, setNotes] = useState(existing?.notes ?? "")
  const [submitting, setSubmitting] = useState(false)

  // Reset form when dialog opens for a new item
  useEffect(() => {
    if (open && !existing) {
      setEquipmentType("ac")
      setMake(""); setModel(""); setSerialNumber("")
      setInstallDate(""); setWarrantyExpiry("")
      setServiceIntervalMonths(""); setNotes("")
    }
  }, [open, existing])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      const body = {
        customerId,
        equipmentType,
        ...(make && { make }),
        ...(model && { model }),
        ...(serialNumber && { serialNumber }),
        ...(installDate && { installDate: new Date(installDate).toISOString() }),
        ...(warrantyExpiry && { warrantyExpiry: new Date(warrantyExpiry).toISOString() }),
        ...(serviceIntervalMonths && { serviceIntervalMonths: parseInt(serviceIntervalMonths) }),
        ...(notes && { notes }),
      }
      const saved: Equipment = existing
        ? await api.patch(`/api/equipment/${existing.id}`, body)
        : await api.post("/api/equipment", body)
      onSaved(saved)
      onOpenChange(false)
      toast.success(existing ? "Equipment updated" : "Equipment added")
    } catch {
      toast.error("Failed to save equipment")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{existing ? "Edit Equipment" : "Add Equipment"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Equipment Type *</label>
            <Select value={equipmentType} onValueChange={setEquipmentType}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {EQUIPMENT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Make</label>
              <Input className="mt-1" value={make} onChange={(e) => setMake(e.target.value)} placeholder="e.g. Carrier" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Model</label>
              <Input className="mt-1" value={model} onChange={(e) => setModel(e.target.value)} placeholder="e.g. 24ACC636A003" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Serial Number</label>
            <Input className="mt-1" value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} placeholder="S/N" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Install Date</label>
              <Input className="mt-1" type="date" value={installDate} onChange={(e) => setInstallDate(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Warranty Expiry</label>
              <Input className="mt-1" type="date" value={warrantyExpiry} onChange={(e) => setWarrantyExpiry(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Service Interval</label>
            <Select value={serviceIntervalMonths} onValueChange={setServiceIntervalMonths}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>
                {INTERVALS.map((i) => (
                  <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Notes</label>
            <Input className="mt-1" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={submitting || !equipmentType}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {existing ? "Save changes" : "Add equipment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 3: TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/equipment/
git commit -m "feat: add EquipmentCard and EquipmentFormDialog components"
```

---

### Task 6: MaintenanceDueWidget + wire into OfficeDashboard

**Files:**
- Create: `frontend/src/components/equipment/MaintenanceDueWidget.tsx`
- Modify: `frontend/src/pages/office/OfficeDashboard.tsx`

- [ ] **Step 1: Create `frontend/src/components/equipment/MaintenanceDueWidget.tsx`**

```tsx
import { useState, useEffect } from "react"
import type { Equipment } from "@/api/types"
import { api } from "@/api/client"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Wrench, Loader2 } from "lucide-react"

function daysLabel(nextDueAt: string) {
  const diff = Math.round((new Date(nextDueAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  if (diff < 0) return `${Math.abs(diff)}d overdue`
  if (diff === 0) return "due today"
  return `due in ${diff}d`
}

export function MaintenanceDueWidget() {
  const [items, setItems] = useState<Equipment[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    api.get<Equipment[]>("/api/equipment?maintenanceDue=true")
      .then(setItems)
      .catch(() => {}) // silent fail — widget is non-critical
      .finally(() => setLoading(false))
  }, [])

  async function handleCreateJobs() {
    setCreating(true)
    try {
      const { created } = await api.post<{ created: unknown[] }>("/api/equipment/check-maintenance", {})
      if (created.length === 0) {
        toast.success("No new draft jobs needed — jobs already exist for all due units")
      } else {
        toast.success(`Created ${created.length} draft job${created.length === 1 ? "" : "s"}`)
      }
      // Refresh list
      const updated = await api.get<Equipment[]>("/api/equipment?maintenanceDue=true")
      setItems(updated)
    } catch {
      toast.error("Failed to create maintenance jobs")
    } finally {
      setCreating(false)
    }
  }

  if (loading || items.length === 0) return null

  return (
    <Card className="border-border bg-card">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-xs font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          <Wrench className="h-4 w-4" />
          Maintenance Due ({items.length})
        </CardTitle>
        <Button size="sm" variant="outline" onClick={handleCreateJobs} disabled={creating}>
          {creating && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
          Create draft jobs
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.map((eq) => (
          <div key={eq.id} className="flex items-center justify-between text-sm">
            <div className="min-w-0">
              <span className="font-medium">{[eq.make, eq.model].filter(Boolean).join(" ") || eq.equipmentType}</span>
              <span className="text-muted-foreground text-xs ml-2">· {eq.equipmentType}</span>
            </div>
            {eq.nextDueAt && (
              <Badge
                variant={new Date(eq.nextDueAt) < new Date() ? "destructive" : "outline"}
                className="text-xs flex-shrink-0 ml-3"
              >
                {daysLabel(eq.nextDueAt)}
              </Badge>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: Add widget to OfficeDashboard**

In `frontend/src/pages/office/OfficeDashboard.tsx`, add the import:
```typescript
import { MaintenanceDueWidget } from "@/components/equipment/MaintenanceDueWidget"
```

In the JSX return, add `<MaintenanceDueWidget />` after `<StatCards>` and before `<JobChart>` or the recent jobs section. Place it so it's visible without scrolling on first load.

- [ ] **Step 3: TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/equipment/MaintenanceDueWidget.tsx frontend/src/pages/office/OfficeDashboard.tsx
git commit -m "feat: add MaintenanceDueWidget and wire into OfficeDashboard"
```

---

### Task 7: Equipment tab on customer page + equipment picker in CreateJobDialog

**Files:**
- Modify: `frontend/src/pages/office/OfficeCustomers.tsx`
- Modify: `frontend/src/components/jobs/create-job-dialog.tsx`

- [ ] **Step 1: Add equipment tab to OfficeCustomers.tsx**

The customer page currently shows a table list of customers (`CustomerTable`). The equipment tab needs to appear when viewing a single customer's detail. Look at how `OfficeCustomers.tsx` currently handles customer detail view (click-to-expand or route-based). Add an "Equipment" tab/section that:

1. Fetches `GET /api/equipment?customerId={customerId}` when a customer is selected/expanded
2. Renders `<EquipmentCard>` for each unit with `onUpdated` and `onDeleted` handlers
3. Has a "+ Add Equipment" button that opens `<EquipmentFormDialog>` in create mode

Add the needed imports:
```typescript
import type { Equipment } from "@/api/types"
import { EquipmentCard } from "@/components/equipment/EquipmentCard"
import { EquipmentFormDialog } from "@/components/equipment/EquipmentFormDialog"
```

Read the current `OfficeCustomers.tsx` fully before editing to understand how customer detail is currently rendered.

- [ ] **Step 2: Add equipment picker to CreateJobDialog**

In `frontend/src/components/jobs/create-job-dialog.tsx`:

1. Add state: `const [equipmentId, setEquipmentId] = useState<string>("")`
2. Add state: `const [customerEquipment, setCustomerEquipment] = useState<Equipment[]>([])`
3. When `customerId` changes (useEffect), fetch `GET /api/equipment?customerId={customerId}` and set `customerEquipment`
4. Add a select field in the form between the customer selector and equipment type:
   ```tsx
   {customerEquipment.length > 0 && (
     <Select value={equipmentId} onValueChange={(val) => {
       setEquipmentId(val)
       const eq = customerEquipment.find((e) => e.id === val)
       if (eq) setEquipmentType(eq.equipmentType)
     }}>
       <SelectTrigger><SelectValue placeholder="Link to equipment unit (optional)" /></SelectTrigger>
       <SelectContent>
         <SelectItem value="">None</SelectItem>
         {customerEquipment.map((eq) => (
           <SelectItem key={eq.id} value={eq.id}>
             {[eq.make, eq.model].filter(Boolean).join(" ") || eq.equipmentType} — {eq.equipmentType}
           </SelectItem>
         ))}
       </SelectContent>
     </Select>
   )}
   ```
5. Include `equipmentId` in the POST body when submitting (only if non-empty):
   ```typescript
   ...(equipmentId && { equipmentId }),
   ```

Add `import type { Equipment } from "@/api/types"` at the top.

- [ ] **Step 3: TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/office/OfficeCustomers.tsx frontend/src/components/jobs/create-job-dialog.tsx
git commit -m "feat: add equipment tab to customer page and equipment picker to job dialog"
```

---

### Task 8: Equipment context in TechnicianJobs

**Files:**
- Modify: `frontend/src/pages/technician/TechnicianJobs.tsx`

- [ ] **Step 1: Add equipment context block**

In `TechnicianJobs.tsx`, when an expanded job has `equipmentId`, fetch and display the equipment details. 

Add state per job expansion (or fetch lazily on expand):
```typescript
const [jobEquipment, setJobEquipment] = useState<Record<string, import("@/api/types").Equipment | null>>({})
```

When a job is expanded (`expandedId` set) and `job.equipmentId` is present, fetch:
```typescript
api.get<import("@/api/types").Equipment>(`/api/equipment/${job.equipmentId}`)
  .then((eq) => setJobEquipment((prev) => ({ ...prev, [job.id]: eq })))
  .catch(() => {})
```

In the expanded job card JSX, after the pre-arrival notes section, add:
```tsx
{job.equipmentId && jobEquipment[job.id] && (() => {
  const eq = jobEquipment[job.id]!
  const expired = eq.warrantyExpiry && new Date(eq.warrantyExpiry) < new Date()
  return (
    <div className="mx-3 mb-3 rounded-lg border border-border bg-muted p-3 text-xs space-y-1">
      <div className="font-semibold text-foreground text-xs uppercase tracking-wide mb-1">Equipment</div>
      <div className="font-medium">{[eq.make, eq.model].filter(Boolean).join(" ") || eq.equipmentType} — {eq.equipmentType}</div>
      {eq.serialNumber && <div className="text-muted-foreground">S/N: {eq.serialNumber}</div>}
      <div className="flex gap-3 text-muted-foreground flex-wrap">
        {eq.installDate && <span>Installed {new Date(eq.installDate).toLocaleDateString("en-US", { month: "short", year: "numeric" })}</span>}
        {eq.warrantyExpiry && (
          <span className={expired ? "text-destructive" : ""}>
            Warranty {expired ? "EXPIRED" : `exp. ${new Date(eq.warrantyExpiry).toLocaleDateString("en-US", { month: "short", year: "numeric" })}`}
          </span>
        )}
      </div>
      {eq.lastServicedAt && (
        <div className="text-muted-foreground">Last serviced {new Date(eq.lastServicedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</div>
      )}
    </div>
  )
})()}
```

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Run full backend test suite one final time**

```bash
cd backend && npx vitest run
```

Expected: All passing.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/technician/TechnicianJobs.tsx
git commit -m "feat: add equipment context block to technician job card"
```

---

## Done

Verify end-to-end:
1. **Office → Customers** — open a customer, find the Equipment tab, add a unit with a 12-month service interval
2. **Office → Dashboard** — confirm `MaintenanceDueWidget` appears if any units are due (or set `lastServicedAt` to 13 months ago in the DB to trigger it)
3. **Office → Jobs → Create Job** — select the customer, confirm the equipment dropdown appears and selecting it auto-fills equipment type
4. **Technician view** — expand a job linked to a unit, confirm the equipment context block appears with serial number and warranty status
5. **POST /api/equipment/check-maintenance** — confirm draft jobs are created for due units and not duplicated on re-run
