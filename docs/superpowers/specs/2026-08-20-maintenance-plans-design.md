# Maintenance Plans — Design Spec

**Date:** 2026-08-20
**Feature:** Recurring service contracts — office creates a plan for a customer, selects which equipment units are covered and how often, sets a price → invoice auto-generated → customer pays → RecurringJobs created per item → jobs spawn on schedule → office notified
**Status:** Approved for implementation

---

## Overview

A maintenance plan is a service contract between the HVAC company and a customer. It sits above the existing `RecurringJob` layer: a plan groups one or more equipment-level schedules under a single contract with a price, a date range, and an invoice.

Three new concepts:
1. **MaintenancePlan** — the contract (customer, name, price, start/end, status, invoice link)
2. **MaintenancePlanItem** — one equipment unit under the plan (equipment, service type, interval)
3. **Invoice update** — `jobId` made nullable so invoices can be issued for plans, not just jobs

---

## Backend

### 1. Schema changes

**File:** `backend/prisma/schema.prisma`

**New model: MaintenancePlan**
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
  status         String    @default("active")  // active | expired | cancelled
  invoiceId      String?   @unique
  invoice        Invoice?  @relation(fields: [invoiceId], references: [id])
  items          MaintenancePlanItem[]
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  @@index([organizationId])
  @@index([customerId])
}
```

**New model: MaintenancePlanItem**
```prisma
model MaintenancePlanItem {
  id             String    @id @default(cuid())
  planId         String
  plan           MaintenancePlan @relation(fields: [planId], references: [id], onDelete: Cascade)
  equipmentId    String?
  equipment      Equipment? @relation(fields: [equipmentId], references: [id], onDelete: SetNull)
  serviceType    String?
  intervalMonths Int       // 6 or 12
  recurringJobId String?   @unique
  recurringJob   RecurringJob? @relation(fields: [recurringJobId], references: [id], onDelete: SetNull)
  createdAt      DateTime  @default(now())
}
```

**Changes to existing models:**

`Invoice` — make `jobId` nullable, add `maintenancePlanId`:
```prisma
jobId            String?           // was required — nullable for plan invoices
job              Job?              @relation(...)
maintenancePlanId String?          @unique
maintenancePlan  MaintenancePlan?  @relation(...)  // inverse of the plan's invoiceId relation
```

Note: because `Invoice` has a back-relation from `MaintenancePlan` via `invoiceId`, and `Invoice` also needs its own `maintenancePlanId` to allow Prisma to resolve the relation from the Invoice side, only one direction is needed. Use the `MaintenancePlan.invoiceId` foreign key as the owner. Remove `maintenancePlanId` from Invoice — the relation is resolved via `MaintenancePlan.invoiceId` pointing at `Invoice.id`.

`RecurringJob` — add optional plan item back-link:
```prisma
maintenancePlanItem MaintenancePlanItem?  // resolved via MaintenancePlanItem.recurringJobId
```

`Customer` — add back-relation:
```prisma
maintenancePlans MaintenancePlan[]
```

`Equipment` — add back-relation:
```prisma
maintenancePlanItems MaintenancePlanItem[]
```

Migration description: `add_maintenance_plans`

### 2. Maintenance plan routes

**File:** `backend/src/routes/maintenance-plans.ts` (new)

Export: `maintenancePlansRouter`

**`POST /api/maintenance-plans`** — create a plan

- Auth: `requireAuth` + office role only (403 otherwise)
- Body (validated with zod):
  ```typescript
  {
    customerId: string
    name: string
    price: number          // >= 0
    startDate: string      // ISO date
    endDate: string        // ISO date, must be after startDate
    items: Array<{
      equipmentId?: string
      serviceType?: string
      intervalMonths: 6 | 12
    }>
  }
  ```
- Validation: `items` must have at least 1 entry; `endDate > startDate`; customer must belong to org
- Logic (all in a Prisma transaction):
  1. Create `MaintenancePlan`
  2. For each item: create `MaintenancePlanItem` + create `RecurringJob` (intervalDays = intervalMonths × 30, nextDueAt = startDate, linked via `maintenancePlanItemId`)
  3. Create `Invoice` with `jobId: null`, `maintenancePlanId: plan.id`, `amount: price`, `description: name`, `status: "pending"`, `issuedDate: now()`
  4. Update `MaintenancePlan.invoiceId` to the new invoice id
- After transaction: fire `notifyOfficePlanCreated` (new helper — see section 4) as fire-and-forget
- Returns: created plan with items and invoice id (201)

**`GET /api/maintenance-plans`** — list plans for the org

- Auth: office role
- Query params: `status` (`active` | `expired` | `cancelled` | `all`, default `active`), `customerId` (optional)
- Returns plans with `items`, `customer { name }`, `invoice { status, id }`
- Ordered by `startDate desc`

**`GET /api/maintenance-plans/:id`** — plan detail

- Auth: office role; 404 if not in org
- Returns plan with `items { equipment { make, model, equipmentType } }`, `invoice`, and linked jobs (via `items[].recurringJob.jobs` — last 3 jobs per item ordered by `scheduledAt desc`)

**`PATCH /api/maintenance-plans/:id`** — cancel or rename

- Auth: office role; 404 if not in org
- Body: `{ status?: "cancelled", name?: string }`
- If `status: "cancelled"`: also set `isActive: false` on all linked `RecurringJob`s
- Returns updated plan

**Mount in `backend/src/index.ts`:**
```typescript
import { maintenancePlansRouter } from "./routes/maintenance-plans.js"
app.use("/api/maintenance-plans", apiLimiter, requireAuth, requireSubscription, maintenancePlansRouter)
```

### 3. Invoice model update

**File:** `backend/src/routes/invoices.ts`

The existing invoice creation route generates invoices from jobs. Now that `jobId` is nullable, ensure any existing queries that join `job` use `include: { job: true }` (already the pattern) — Prisma handles nullable relations transparently. No logic changes needed to the existing invoice routes.

The existing `GET /api/invoices` customer route filters by `customer.userId` — maintenance plan invoices will appear in the customer's invoice list automatically since they share `customerId` via the plan relation. Verify the customer invoice query joins correctly after the migration.

### 4. Office notification

**File:** `backend/src/services/org-notifications.ts`

Add:
```typescript
export async function notifyOfficePlanCreated(params: {
  planName: string
  customerName: string
  price: number
  itemCount: number
  orgId: string
}): Promise<void>
```

- Fetches org email via `getOrgDispatch(orgId)`
- Sends email: subject `"New maintenance plan: ${planName} — ${customerName}"`, body listing price and number of equipment items covered
- No SMS (plan creation is not time-sensitive)

### 5. Tests

**File:** `backend/src/__tests__/maintenance-plans.test.ts` (new)

7 tests:
1. `POST /` returns 403 for non-office role
2. `POST /` returns 400 when items array is empty
3. `POST /` creates plan, items, RecurringJobs, and Invoice in one transaction
4. `POST /` returns 403 if customerId is not in org
5. `GET /` returns only active plans by default
6. `GET /` filters by customerId
7. `PATCH /:id` cancels plan and deactivates linked RecurringJobs

---

## Frontend

### 1. API types

**File:** `frontend/src/api/types.ts` — append:

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
  status: string          // active | expired | cancelled
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

### 2. Maintenance Plans page

**File:** `frontend/src/pages/office/MaintenancePlans.tsx` (new)

- Fetches `GET /api/maintenance-plans` on mount (default: active)
- Tab strip: Active / Expired / All — each refetches with `?status=`
- "New Plan" button opens `CreatePlanDialog`
- Plan card (per plan):
  - Header: plan name · customer name · price · status badge (green=active, grey=expired/cancelled)
  - Date range: "Jan 1, 2026 – Dec 31, 2026"
  - Equipment chips: one per item showing `equipmentType · every N months`
  - Badges: invoice status (paid/pending), visits-due count (pending jobs from RecurringJob)
  - Cancel button (trash icon) — confirms then calls `PATCH /:id { status: "cancelled" }`, updates list
- Empty state: "No maintenance plans yet. Create your first plan to get started."
- Loading: spinner; Error: "Could not load maintenance plans."

### 3. Create Plan dialog

**File:** `frontend/src/components/maintenance/CreatePlanDialog.tsx` (new)

Fields:
- **Customer** — searchable select (fetches `GET /api/customers`, same pattern as CreateJobDialog)
- **Plan name** — text input (e.g. "Gold Plan", "Annual Tune-Up")
- **Price** — number input (dollars, min 0)
- **Start date / End date** — date inputs
- **Equipment items** — list of items, each with:
  - Equipment picker (fetches `GET /api/equipment?customerId=X` once customer is selected)
  - Service type text input (e.g. "Annual tune-up")
  - Interval select: 6 months / 12 months
  - Remove button
- "+ Add equipment" button to add another item
- **Submit:** "Create plan + generate invoice" — calls `POST /api/maintenance-plans`, on success closes dialog and refreshes list
- Validation: customer required, at least 1 item, end date after start date
- Error state: inline "Failed to create plan. Try again."

### 4. Sidebar nav

**File:** `frontend/src/components/office-layout.tsx` (or wherever the sidebar nav items are defined)

Add nav item between Jobs and Customers:
- Label: "Maintenance"
- Icon: `ClipboardList` from lucide-react
- Path: `/office/maintenance`

### 5. Router

**File:** `frontend/src/App.tsx`

Add inside the office layout route:
```tsx
<Route path="maintenance" element={<MaintenancePlans />} />
```

### 6. Customer portal — Plans section

**File:** `frontend/src/pages/customer/CustomerEquipment.tsx`

Below the equipment list, add a "Service Plans" section:
- Fetches `GET /api/customers/me/plans` (new backend endpoint — see below)
- Shows active plans only: plan name, date range, equipment covered
- Read-only, no actions

**New backend endpoint:** `GET /api/customers/me/plans`

Add to `backend/src/routes/customers.ts` (before `/:id`, following the established pattern):
- Auth: customer guard
- Returns: `prisma.maintenancePlan.findMany({ where: { customerId: user.customerId, organizationId: user.organizationId, status: "active" }, include: { items: { include: { equipment: true } } } })`

---

## Error States

| Condition | Behaviour |
|---|---|
| `POST /api/maintenance-plans` fails mid-transaction | Prisma rolls back entire transaction; return 500 |
| Customer not in org | 403 |
| Items array empty | 400 |
| End date before start date | 400 |
| Plan not found or not in org | 404 |
| `GET /api/maintenance-plans` fails | Page shows "Could not load maintenance plans." |
| Create plan dialog submit fails | Inline error, dialog stays open |
| Customer has no equipment when adding items | Equipment picker shows empty with message |

---

## Out of Scope

- Auto-renewal (creating a new plan when current one expires) — manual for now
- Stripe subscription / auto-charge on renewal
- Customer-initiated plan purchase
- Plan templates (preset Gold/Silver/Bronze)
- Per-technician assignment at the plan level
- Editing items after plan is created (cancel and recreate)
