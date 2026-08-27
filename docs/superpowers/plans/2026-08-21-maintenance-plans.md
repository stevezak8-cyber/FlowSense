# Maintenance Plans Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add maintenance plan contracts that group recurring service jobs under a single invoice, visible to office staff and customers.

**Architecture:** New `MaintenancePlan` + `MaintenancePlanItem` models sit above the existing `RecurringJob` layer. Plan creation is transactional (plan → items → recurring jobs → invoice). Office manages plans via `/api/maintenance-plans`; customers read their active plans via `GET /api/customers/me/plans`.

**Tech Stack:** Prisma (PostgreSQL), Express + zod, React + TypeScript, lucide-react

---

## Chunk 1: Backend

### Task 1: Schema migration

**Files:**
- Modify: `backend/prisma/schema.prisma`

- [ ] **Step 1: Add MaintenancePlan model**

Add after the `Invoice` model block (~line 234):

```prisma
model MaintenancePlan {
  id             String    @id @default(cuid())
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  customerId     String
  customer       Customer  @relation(fields: [customerId], references: [id], onDelete: Cascade)
  name           String
  price          Float
  startDate      DateTime
  endDate        DateTime
  status         String    @default("active")
  invoiceId      String?   @unique
  invoice        Invoice?  @relation(fields: [invoiceId], references: [id])
  items          MaintenancePlanItem[]
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  @@index([organizationId])
  @@index([customerId])
}

model MaintenancePlanItem {
  id             String    @id @default(cuid())
  planId         String
  plan           MaintenancePlan @relation(fields: [planId], references: [id], onDelete: Cascade)
  equipmentId    String?
  equipment      Equipment? @relation(fields: [equipmentId], references: [id], onDelete: SetNull)
  serviceType    String?
  intervalMonths Int
  recurringJobId String?   @unique
  recurringJob   RecurringJob? @relation(fields: [recurringJobId], references: [id], onDelete: SetNull)
  createdAt      DateTime  @default(now())
}
```

- [ ] **Step 2: Update existing models**

In `Invoice` model: make `jobId` nullable, add back-relation field:
```prisma
jobId            String?
job              Job?     @relation(fields: [jobId], references: [id], onDelete: Cascade)
maintenancePlan  MaintenancePlan?
```

In `Organization` model: add back-relation:
```prisma
maintenancePlans MaintenancePlan[]
```

In `Customer` model: add back-relation:
```prisma
maintenancePlans MaintenancePlan[]
```

In `Equipment` model: add back-relation:
```prisma
maintenancePlanItems MaintenancePlanItem[]
```

In `RecurringJob` model: add optional back-relation:
```prisma
maintenancePlanItem MaintenancePlanItem?
```

- [ ] **Step 3: Run migration**

```bash
cd backend && npm run db:migrate -- --name add_maintenance_plans
```

Expected: migration created and applied, Prisma client regenerated.

- [ ] **Step 4: Verify schema compiles**

```bash
cd backend && npx prisma validate
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/
git commit -m "feat: add MaintenancePlan and MaintenancePlanItem schema"
```

---

### Task 2: Maintenance plans routes + tests

**Files:**
- Create: `backend/src/routes/maintenance-plans.ts`
- Create: `backend/src/__tests__/maintenance-plans.test.ts`
- Modify: `backend/src/index.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// backend/src/__tests__/maintenance-plans.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest"
import request from "supertest"
import express from "express"

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    customer: { findFirst: vi.fn() },
    maintenancePlan: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    recurringJob: { updateMany: vi.fn() },
    $transaction: vi.fn(),
  },
}))

vi.mock("../services/org-notifications.js", () => ({
  notifyOfficePlanCreated: vi.fn().mockResolvedValue(undefined),
}))

import { prisma } from "../lib/prisma.js"
import { maintenancePlansRouter } from "../routes/maintenance-plans.js"

const mockPrisma = prisma as unknown as {
  customer: { findFirst: ReturnType<typeof vi.fn> }
  maintenancePlan: {
    create: ReturnType<typeof vi.fn>
    findMany: ReturnType<typeof vi.fn>
    findFirst: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
  }
  recurringJob: { updateMany: ReturnType<typeof vi.fn> }
  $transaction: ReturnType<typeof vi.fn>
}

function makeApp(role = "office", orgId = "org1") {
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    ;(req as express.Request & { user: unknown }).user = { id: "user1", organizationId: orgId, role }
    next()
  })
  app.use("/", maintenancePlansRouter)
  return app
}

const samplePlanBody = {
  customerId: "cust1",
  name: "Gold Plan",
  price: 299,
  startDate: "2026-01-01T00:00:00.000Z",
  endDate: "2026-12-31T00:00:00.000Z",
  items: [{ equipmentId: "eq1", serviceType: "Tune-up", intervalMonths: 12 }],
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("POST /", () => {
  it("returns 403 for non-office role", async () => {
    const res = await request(makeApp("customer")).post("/").send(samplePlanBody)
    expect(res.status).toBe(403)
  })

  it("returns 400 when items array is empty", async () => {
    const res = await request(makeApp()).post("/").send({ ...samplePlanBody, items: [] })
    expect(res.status).toBe(400)
  })

  it("returns 403 if customerId is not in org", async () => {
    mockPrisma.customer.findFirst.mockResolvedValue(null)
    const res = await request(makeApp()).post("/").send(samplePlanBody)
    expect(res.status).toBe(403)
  })

  it("creates plan, items, RecurringJobs, and Invoice in one transaction", async () => {
    mockPrisma.customer.findFirst.mockResolvedValue({ id: "cust1", name: "Alice" })
    const createdPlan = { id: "plan1", name: "Gold Plan", invoiceId: "inv1", items: [], status: "active" }
    mockPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
      return fn({
        maintenancePlan: { create: vi.fn().mockResolvedValue(createdPlan), update: vi.fn().mockResolvedValue(createdPlan) },
        maintenancePlanItem: { create: vi.fn() },
        recurringJob: { create: vi.fn().mockResolvedValue({ id: "rj1" }) },
        invoice: { create: vi.fn().mockResolvedValue({ id: "inv1" }) },
      })
    })
    const res = await request(makeApp()).post("/").send(samplePlanBody)
    expect(res.status).toBe(201)
    expect(mockPrisma.$transaction).toHaveBeenCalled()
  })
})

describe("GET /", () => {
  it("returns only active plans by default", async () => {
    mockPrisma.maintenancePlan.findMany.mockResolvedValue([{ id: "p1", status: "active" }])
    const res = await request(makeApp()).get("/")
    expect(res.status).toBe(200)
    expect(mockPrisma.maintenancePlan.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: "active" }) })
    )
  })

  it("filters by customerId when provided", async () => {
    mockPrisma.maintenancePlan.findMany.mockResolvedValue([])
    const res = await request(makeApp()).get("/?customerId=cust1")
    expect(res.status).toBe(200)
    expect(mockPrisma.maintenancePlan.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ customerId: "cust1" }) })
    )
  })
})

describe("PATCH /:id", () => {
  it("cancels plan and deactivates linked RecurringJobs", async () => {
    const plan = {
      id: "plan1",
      organizationId: "org1",
      items: [{ recurringJobId: "rj1" }, { recurringJobId: "rj2" }],
    }
    mockPrisma.maintenancePlan.findFirst.mockResolvedValue(plan)
    mockPrisma.recurringJob.updateMany.mockResolvedValue({ count: 2 })
    mockPrisma.maintenancePlan.update.mockResolvedValue({ ...plan, status: "cancelled" })
    const res = await request(makeApp()).patch("/plan1").send({ status: "cancelled" })
    expect(res.status).toBe(200)
    expect(mockPrisma.recurringJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isActive: false } })
    )
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd backend && npx vitest run src/__tests__/maintenance-plans.test.ts
```

Expected: FAIL — module `../routes/maintenance-plans.js` not found.

- [ ] **Step 3: Create the routes file**

```typescript
// backend/src/routes/maintenance-plans.ts
import { Router } from "express"
import { z } from "zod"
import { prisma } from "../lib/prisma.js"
import { notifyOfficePlanCreated } from "../services/org-notifications.js"

export const maintenancePlansRouter = Router()

const itemSchema = z.object({
  equipmentId: z.string().optional(),
  serviceType: z.string().optional(),
  intervalMonths: z.union([z.literal(6), z.literal(12)]),
})

const createSchema = z.object({
  customerId: z.string().min(1),
  name: z.string().min(1),
  price: z.number().min(0),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  items: z.array(itemSchema).min(1, "At least one equipment item is required"),
})

const INTERVAL_MAP: Record<6 | 12, number> = { 6: 180, 12: 365 }

maintenancePlansRouter.post("/", async (req, res) => {
  if (req.user!.role !== "office") return res.status(403).json({ error: "Forbidden" })

  const parsed = createSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

  const { customerId, name, price, startDate, endDate, items } = parsed.data
  const { organizationId } = req.user!

  if (new Date(endDate) <= new Date(startDate)) {
    return res.status(400).json({ error: "endDate must be after startDate" })
  }

  const customer = await prisma.customer.findFirst({ where: { id: customerId, organizationId } })
  if (!customer) return res.status(403).json({ error: "Customer not in org" })

  const plan = await prisma.$transaction(async (tx) => {
    const newPlan = await tx.maintenancePlan.create({
      data: { organizationId, customerId, name, price, startDate, endDate, status: "active" },
    })

    for (const item of items) {
      const rj = await tx.recurringJob.create({
        data: {
          organizationId,
          customerId,
          equipmentId: item.equipmentId ?? null,
          serviceType: item.serviceType ?? null,
          intervalDays: INTERVAL_MAP[item.intervalMonths],
          nextDueAt: new Date(startDate),
          isActive: true,
        },
      })
      await tx.maintenancePlanItem.create({
        data: {
          planId: newPlan.id,
          equipmentId: item.equipmentId ?? null,
          serviceType: item.serviceType ?? null,
          intervalMonths: item.intervalMonths,
          recurringJobId: rj.id,
        },
      })
    }

    const invoice = await tx.invoice.create({
      data: {
        organizationId,
        customerId,
        jobId: null,
        description: name,
        amount: price,
        status: "pending",
        issuedDate: new Date(),
        dueDate: new Date(startDate),
      },
    })

    return tx.maintenancePlan.update({
      where: { id: newPlan.id },
      data: { invoiceId: invoice.id },
      include: { items: true },
    })
  })

  notifyOfficePlanCreated({
    planName: name,
    customerName: customer.name,
    price,
    itemCount: items.length,
    orgId: organizationId,
  }).catch(() => {})

  return res.status(201).json(plan)
})

maintenancePlansRouter.get("/", async (req, res) => {
  if (req.user!.role !== "office") return res.status(403).json({ error: "Forbidden" })
  const { organizationId } = req.user!
  const status = (req.query.status as string) ?? "active"
  const customerId = req.query.customerId as string | undefined

  const where: Record<string, unknown> = { organizationId }
  if (status !== "all") where.status = status
  if (customerId) where.customerId = customerId

  const plans = await prisma.maintenancePlan.findMany({
    where,
    include: { items: true, customer: { select: { name: true } }, invoice: { select: { id: true, status: true } } },
    orderBy: { startDate: "desc" },
  })
  return res.json(plans)
})

maintenancePlansRouter.get("/:id", async (req, res) => {
  if (req.user!.role !== "office") return res.status(403).json({ error: "Forbidden" })
  const plan = await prisma.maintenancePlan.findFirst({
    where: { id: req.params.id, organizationId: req.user!.organizationId },
    include: {
      items: { include: { equipment: { select: { make: true, model: true, equipmentType: true } } } },
      invoice: true,
      customer: { select: { name: true } },
    },
  })
  if (!plan) return res.status(404).json({ error: "Not found" })
  return res.json(plan)
})

maintenancePlansRouter.patch("/:id", async (req, res) => {
  if (req.user!.role !== "office") return res.status(403).json({ error: "Forbidden" })
  const plan = await prisma.maintenancePlan.findFirst({
    where: { id: req.params.id, organizationId: req.user!.organizationId },
    include: { items: true },
  })
  if (!plan) return res.status(404).json({ error: "Not found" })

  const { status, name } = req.body as { status?: string; name?: string }

  if (status === "cancelled") {
    const rjIds = plan.items.map((i) => i.recurringJobId).filter(Boolean) as string[]
    if (rjIds.length > 0) {
      await prisma.recurringJob.updateMany({ where: { id: { in: rjIds } }, data: { isActive: false } })
    }
  }

  const updated = await prisma.maintenancePlan.update({
    where: { id: plan.id },
    data: { ...(status ? { status } : {}), ...(name ? { name } : {}) },
  })
  return res.json(updated)
})
```

- [ ] **Step 4: Run tests**

```bash
cd backend && npx vitest run src/__tests__/maintenance-plans.test.ts
```

Expected: 7 tests pass.

- [ ] **Step 5: Mount router in index.ts**

In `backend/src/index.ts`, after the existing imports add:
```typescript
import { maintenancePlansRouter } from "./routes/maintenance-plans.js"
```

After the `recurringJobsRouter` mount line add:
```typescript
app.use("/api/maintenance-plans", apiLimiter, requireAuth, requireSubscription, maintenancePlansRouter)
```

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/maintenance-plans.ts backend/src/__tests__/maintenance-plans.test.ts backend/src/index.ts
git commit -m "feat: add maintenance plans routes and tests"
```

---

### Task 3: notifyOfficePlanCreated + GET /me/plans

**Files:**
- Modify: `backend/src/services/org-notifications.ts`
- Modify: `backend/src/routes/customers.ts`
- Modify: `backend/src/__tests__/customers-me.test.ts`

- [ ] **Step 1: Add notifyOfficePlanCreated to org-notifications.ts**

At the bottom of `backend/src/services/org-notifications.ts` add:

```typescript
export async function notifyOfficePlanCreated(params: {
  planName: string
  customerName: string
  price: number
  itemCount: number
  orgId: string
}): Promise<void> {
  const { planName, customerName, price, itemCount, orgId } = params
  const dispatch = await getOrgDispatch(orgId)
  if (!dispatch?.email) return
  await sendEmail({
    to: dispatch.email,
    subject: `New maintenance plan: ${planName} — ${customerName}`,
    html: `<p>A new maintenance plan has been created.</p>
<ul>
  <li><strong>Plan:</strong> ${escapeHtml(planName)}</li>
  <li><strong>Customer:</strong> ${escapeHtml(customerName)}</li>
  <li><strong>Price:</strong> $${price.toFixed(2)}</li>
  <li><strong>Equipment items:</strong> ${itemCount}</li>
</ul>`,
  })
}
```

Check what `getOrgDispatch` is named in that file — it may be `getOrgEmail` or similar. Use whatever helper already fetches the org's dispatch email.

- [ ] **Step 2: Add GET /me/plans to customers.ts**

In `backend/src/routes/customers.ts`, add this route **before** the `/:id` route (and after the existing `/me/jobs` route):

```typescript
customersRouter.get("/me/plans", async (req, res) => {
  if (req.user!.role !== "customer") return res.status(403).json({ error: "Forbidden" })
  const { customerId, organizationId } = req.user!
  const plans = await prisma.maintenancePlan.findMany({
    where: { customerId: customerId!, organizationId, status: "active" },
    include: {
      items: {
        include: { equipment: { select: { make: true, model: true, equipmentType: true } } },
      },
    },
    orderBy: { startDate: "desc" },
  })
  return res.json(plans)
})
```

- [ ] **Step 3: Add test for GET /me/plans**

In `backend/src/__tests__/customers-me.test.ts`:

1. Add `maintenancePlan: { findMany: vi.fn() }` to the prisma mock object.
2. Add `maintenancePlan` to the `mockPrisma` type.
3. Add two tests at the bottom:

```typescript
describe("GET /me/plans", () => {
  it("returns 403 for non-customer role", async () => {
    const res = await request(makeApp("office")).get("/me/plans")
    expect(res.status).toBe(403)
  })

  it("returns active plans for the customer", async () => {
    mockPrisma.maintenancePlan.findMany.mockResolvedValue([
      { id: "plan1", name: "Gold Plan", status: "active", items: [] },
    ])
    const res = await request(makeApp()).get("/me/plans")
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].name).toBe("Gold Plan")
  })
})
```

- [ ] **Step 4: Run tests**

```bash
cd backend && npx vitest run src/__tests__/customers-me.test.ts
```

Expected: all 10 tests pass (8 existing + 2 new).

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/org-notifications.ts backend/src/routes/customers.ts backend/src/__tests__/customers-me.test.ts
git commit -m "feat: add notifyOfficePlanCreated and GET /me/plans"
```

---

## Chunk 2: Frontend

### Task 4: API types + sidebar nav + App.tsx routing

**Files:**
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/components/app-sidebar.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Add API types**

Append to `frontend/src/api/types.ts`:

```typescript
export interface MaintenancePlanItem {
  id: string
  equipmentId: string | null
  serviceType: string | null
  intervalMonths: number
  equipment: { make: string | null; model: string | null; equipmentType: string } | null
}

export interface MaintenancePlan {
  id: string
  customerId: string
  name: string
  price: number
  startDate: string
  endDate: string
  status: string
  invoiceId: string | null
  customer: { name: string }
  invoice: { id: string; status: string } | null
  items: MaintenancePlanItem[]
}

export interface CreateMaintenancePlanBody {
  customerId: string
  name: string
  price: number
  startDate: string
  endDate: string
  items: Array<{ equipmentId?: string; serviceType?: string; intervalMonths: 6 | 12 }>
}
```

- [ ] **Step 2: Add sidebar nav item**

In `frontend/src/components/app-sidebar.tsx`:

1. Add `ClipboardList` to the lucide-react import.
2. In the `navItems` array, add between Jobs and Customers:
```typescript
{ label: "Maintenance", href: "/office/maintenance", icon: ClipboardList },
```

- [ ] **Step 3: Add route in App.tsx**

In `frontend/src/App.tsx`, inside the office layout route block, add:
```tsx
<Route path="maintenance" element={<MaintenancePlans />} />
```

Also add the import at the top:
```tsx
import { MaintenancePlans } from "./pages/office/MaintenancePlans"
```

(The component doesn't exist yet — this will cause a TS error until Task 5 is done. That's fine; they'll be committed together in Task 5.)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/api/types.ts frontend/src/components/app-sidebar.tsx
git commit -m "feat: add MaintenancePlan API types and sidebar nav"
```

(Hold off committing App.tsx until Task 5 so TS compiles clean.)

---

### Task 5: MaintenancePlans page

**Files:**
- Create: `frontend/src/pages/office/MaintenancePlans.tsx`
- Modify: `frontend/src/App.tsx` (commit pending from Task 4)

- [ ] **Step 1: Create the page**

```tsx
// frontend/src/pages/office/MaintenancePlans.tsx
import { useState, useEffect, useCallback } from "react"
import { Trash2 } from "lucide-react"
import type { MaintenancePlan } from "../../api/types"
import { CreatePlanDialog } from "../../components/maintenance/CreatePlanDialog"

type TabStatus = "active" | "expired" | "all"

const TABS: { label: string; value: TabStatus }[] = [
  { label: "Active", value: "active" },
  { label: "Expired", value: "expired" },
  { label: "All", value: "all" },
]

function statusBadge(status: string) {
  if (status === "active") return <span className="rounded bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800">Active</span>
  if (status === "expired") return <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-500">Expired</span>
  return <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">Cancelled</span>
}

function invoiceBadge(invoice: MaintenancePlan["invoice"]) {
  if (!invoice) return null
  if (invoice.status === "paid") return <span className="rounded bg-purple-100 px-2 py-0.5 text-xs text-purple-700">Invoice paid</span>
  return <span className="rounded bg-yellow-100 px-2 py-0.5 text-xs text-yellow-800">Invoice pending</span>
}

export function MaintenancePlans() {
  const [tab, setTab] = useState<TabStatus>("active")
  const [plans, setPlans] = useState<MaintenancePlan[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const res = await fetch(`/api/maintenance-plans?status=${tab}`)
      if (!res.ok) throw new Error()
      setPlans(await res.json())
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [tab])

  useEffect(() => { load() }, [load])

  async function cancelPlan(id: string) {
    if (!confirm("Cancel this maintenance plan? This will also deactivate its recurring jobs.")) return
    const res = await fetch(`/api/maintenance-plans/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "cancelled" }),
    })
    if (res.ok) load()
  }

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Maintenance Plans</h1>
          <p className="text-sm text-muted-foreground">{plans.length} {tab} plan{plans.length !== 1 ? "s" : ""}</p>
        </div>
        <button
          onClick={() => setDialogOpen(true)}
          className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          + New Plan
        </button>
      </div>

      <div className="mb-4 flex border-b">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              tab === t.value ? "border-primary text-primary" : "border-transparent text-muted-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading && <p className="text-sm text-muted-foreground">Loading...</p>}
      {error && <p className="text-sm text-destructive">Could not load maintenance plans.</p>}

      {!loading && !error && plans.length === 0 && (
        <p className="text-sm text-muted-foreground">No maintenance plans yet. Create your first plan to get started.</p>
      )}

      <div className="space-y-3">
        {plans.map((plan) => (
          <div key={plan.id} className="rounded-lg border p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-semibold">{plan.name} · {plan.customer.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {plan.items.length} unit{plan.items.length !== 1 ? "s" : ""} · {new Date(plan.startDate).toLocaleDateString()} – {new Date(plan.endDate).toLocaleDateString()}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-right">
                  <p className="font-bold text-primary">${plan.price.toFixed(0)}</p>
                  {statusBadge(plan.status)}
                </div>
                {plan.status === "active" && (
                  <button onClick={() => cancelPlan(plan.id)} className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>

            <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
              {plan.items.map((item) => (
                <span key={item.id}>⚙ {item.equipment?.equipmentType ?? "Equipment"} · every {item.intervalMonths}mo</span>
              ))}
            </div>

            <div className="mt-2 flex gap-2">
              {invoiceBadge(plan.invoice)}
            </div>
          </div>
        ))}
      </div>

      <CreatePlanDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onCreated={() => { setDialogOpen(false); load() }}
      />
    </div>
  )
}
```

- [ ] **Step 2: Check TypeScript**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -30
```

Fix any type errors before committing.

- [ ] **Step 3: Commit (including App.tsx from Task 4)**

```bash
git add frontend/src/pages/office/MaintenancePlans.tsx frontend/src/App.tsx
git commit -m "feat: add MaintenancePlans page and route"
```

---

### Task 6: CreatePlanDialog

**Files:**
- Create: `frontend/src/components/maintenance/CreatePlanDialog.tsx`

- [ ] **Step 1: Create the dialog**

```tsx
// frontend/src/components/maintenance/CreatePlanDialog.tsx
import { useState, useEffect } from "react"
import type { CreateMaintenancePlanBody } from "../../api/types"

interface Customer { id: string; name: string }
interface Equipment { id: string; make: string | null; model: string | null; equipmentType: string }

interface ItemDraft {
  equipmentId: string
  serviceType: string
  intervalMonths: 6 | 12
}

interface Props {
  open: boolean
  onClose: () => void
  onCreated: () => void
}

export function CreatePlanDialog({ open, onClose, onCreated }: Props) {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [equipment, setEquipment] = useState<Equipment[]>([])
  const [customerId, setCustomerId] = useState("")
  const [name, setName] = useState("")
  const [price, setPrice] = useState("")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [items, setItems] = useState<ItemDraft[]>([{ equipmentId: "", serviceType: "", intervalMonths: 12 }])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!open) return
    fetch("/api/customers").then((r) => r.json()).then(setCustomers).catch(() => {})
  }, [open])

  useEffect(() => {
    if (!customerId) { setEquipment([]); return }
    fetch(`/api/equipment?customerId=${customerId}`).then((r) => r.json()).then(setEquipment).catch(() => {})
  }, [customerId])

  function resetForm() {
    setCustomerId(""); setName(""); setPrice(""); setStartDate(""); setEndDate("")
    setItems([{ equipmentId: "", serviceType: "", intervalMonths: 12 }])
    setError("")
  }

  function handleClose() { resetForm(); onClose() }

  function updateItem(idx: number, patch: Partial<ItemDraft>) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!customerId || !name || !startDate || !endDate) { setError("All fields are required."); return }
    if (new Date(endDate) <= new Date(startDate)) { setError("End date must be after start date."); return }
    if (items.some((it) => !it.equipmentId)) { setError("Each item must have equipment selected."); return }

    setSubmitting(true)
    setError("")
    const body: CreateMaintenancePlanBody = {
      customerId,
      name,
      price: parseFloat(price) || 0,
      startDate: new Date(startDate).toISOString(),
      endDate: new Date(endDate).toISOString(),
      items: items.map((it) => ({ equipmentId: it.equipmentId, serviceType: it.serviceType || undefined, intervalMonths: it.intervalMonths })),
    }
    try {
      const res = await fetch("/api/maintenance-plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error()
      resetForm()
      onCreated()
    } catch {
      setError("Failed to create plan. Try again.")
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-xl bg-background p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold">New Maintenance Plan</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground">Customer</label>
            <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="mt-1 w-full rounded border px-2 py-1.5 text-sm bg-background">
              <option value="">Select customer...</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs text-muted-foreground">Plan name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Gold Plan" className="mt-1 w-full rounded border px-2 py-1.5 text-sm bg-background" />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground">Start date</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="mt-1 w-full rounded border px-2 py-1.5 text-sm bg-background" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">End date</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="mt-1 w-full rounded border px-2 py-1.5 text-sm bg-background" />
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground">Price ($)</label>
            <input type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="299.00" className="mt-1 w-full rounded border px-2 py-1.5 text-sm bg-background" />
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Equipment covered</p>
            <div className="mt-2 space-y-2">
              {items.map((item, idx) => (
                <div key={idx} className="rounded border p-2">
                  <div className="flex gap-2">
                    <select value={item.equipmentId} onChange={(e) => updateItem(idx, { equipmentId: e.target.value })} className="flex-1 rounded border px-2 py-1 text-xs bg-background">
                      <option value="">{customerId ? "Select equipment..." : "Select customer first"}</option>
                      {equipment.map((eq) => <option key={eq.id} value={eq.id}>{eq.equipmentType}{eq.make ? ` — ${eq.make}` : ""}{eq.model ? ` ${eq.model}` : ""}</option>)}
                    </select>
                    <select value={item.intervalMonths} onChange={(e) => updateItem(idx, { intervalMonths: Number(e.target.value) as 6 | 12 })} className="rounded border px-2 py-1 text-xs bg-background">
                      <option value={12}>Every 12 months</option>
                      <option value={6}>Every 6 months</option>
                    </select>
                    {items.length > 1 && (
                      <button type="button" onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))} className="text-muted-foreground hover:text-destructive text-xs">✕</button>
                    )}
                  </div>
                  <input value={item.serviceType} onChange={(e) => updateItem(idx, { serviceType: e.target.value })} placeholder="Service type (e.g. Annual tune-up)" className="mt-1 w-full rounded border px-2 py-1 text-xs bg-background" />
                </div>
              ))}
            </div>
            <button type="button" onClick={() => setItems((prev) => [...prev, { equipmentId: "", serviceType: "", intervalMonths: 12 }])} className="mt-1 text-xs text-primary hover:underline">
              + Add equipment
            </button>
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={handleClose} className="rounded border px-3 py-1.5 text-sm hover:bg-muted">Cancel</button>
            <button type="submit" disabled={submitting} className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {submitting ? "Creating..." : "Create plan + generate invoice"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Check TypeScript**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/maintenance/CreatePlanDialog.tsx
git commit -m "feat: add CreatePlanDialog for maintenance plans"
```

---

### Task 7: Customer portal Plans section

**Files:**
- Modify: `frontend/src/pages/customer/CustomerEquipment.tsx`

- [ ] **Step 1: Add Plans section below the equipment list**

At the top of `CustomerEquipment.tsx`, add:
```tsx
import { useState, useEffect } from "react"  // already imported — merge
import type { MaintenancePlanItem, MaintenancePlan } from "../../api/types"
```

Add a plans state and fetch inside the component (after the equipment fetch):
```tsx
const [plans, setPlans] = useState<MaintenancePlan[]>([])

useEffect(() => {
  fetch("/api/customers/me/plans")
    .then((r) => r.ok ? r.json() : [])
    .then(setPlans)
    .catch(() => {})
}, [])
```

Below the equipment list JSX, add a Service Plans section:
```tsx
{plans.length > 0 && (
  <div className="mt-8">
    <h2 className="mb-3 text-base font-semibold">Service Plans</h2>
    <div className="space-y-3">
      {plans.map((plan) => (
        <div key={plan.id} className="rounded-lg border p-4">
          <div className="flex items-start justify-between">
            <p className="font-medium">{plan.name}</p>
            <span className="rounded bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800">Active</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {new Date(plan.startDate).toLocaleDateString()} – {new Date(plan.endDate).toLocaleDateString()}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {plan.items.map((item) => (
              <span key={item.id} className="rounded bg-muted px-2 py-0.5 text-xs">
                {item.equipment?.equipmentType ?? "Equipment"} · every {item.intervalMonths}mo
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  </div>
)}
```

- [ ] **Step 2: Check TypeScript**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/customer/CustomerEquipment.tsx
git commit -m "feat: add service plans section to customer equipment page"
```

---

## Final verification

- [ ] Run all backend tests:

```bash
cd backend && npx vitest run
```

Expected: all tests pass.

- [ ] Check frontend TypeScript:

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.
