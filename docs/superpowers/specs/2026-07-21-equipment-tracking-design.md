# Equipment Tracking — Design Spec

**Date:** 2026-07-21
**Feature:** Feature 5 of 9 — Equipment Tracking
**Status:** Approved for implementation

---

## Overview

A per-customer equipment registry with service history and maintenance scheduling. Office staff manage equipment units on customer profiles. When a job completes on a linked unit, `lastServicedAt` updates automatically. The office dashboard surfaces units due for maintenance and lets staff create draft jobs with one click.

Three capabilities:
1. **Asset registry** — make, model, serial number, install date, warranty expiry per unit
2. **Service history** — all jobs linked to a unit, ordered by date
3. **Maintenance scheduling** — interval-based due-date tracking; dashboard widget + one-click draft job creation

---

## Data Model

### New model: `Equipment`

```prisma
model Equipment {
  id             String       @id @default(cuid())
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  customerId     String
  customer       Customer     @relation(fields: [customerId], references: [id], onDelete: Cascade)

  equipmentType          String   // furnace | ac | heat-pump | boiler | mini-split | other
  make                   String?
  model                  String?
  serialNumber           String?
  installDate            DateTime?
  warrantyExpiry         DateTime?
  serviceIntervalMonths  Int?     // e.g. 12 for annual tune-up; null = no scheduled maintenance
  lastServicedAt         DateTime?
  notes                  String?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  jobs Job[]

  @@index([organizationId])
  @@index([customerId])
}
```

### Changes to existing models

**`Job`** — add optional equipment link:
```prisma
equipmentId  String?
equipment    Equipment? @relation(fields: [equipmentId], references: [id], onDelete: SetNull)
```
Add `@@index([equipmentId])`.

**`Customer`** — add back-relation:
```prisma
equipment Equipment[]
```

**`Organization`** — add back-relation:
```prisma
equipment Equipment[]
```

---

## Backend

### Routes: `backend/src/routes/equipment.ts`

Mounted at `/api/equipment` under `requireAuth + requireSubscription`.

All routes verify `organizationId` from `req.user!.organizationId`. Equipment belongs to an org — no cross-org access.

#### `GET /api/equipment`

Query params:
- `customerId` (optional) — filter to one customer's units
- `maintenanceDue` (optional, `"true"`) — filter to units where `nextDueAt <= today + 30 days`

`nextDueAt` computed per unit:
```
base = lastServicedAt ?? installDate ?? createdAt
nextDueAt = base + serviceIntervalMonths months
```
Units with no `serviceIntervalMonths` are excluded from maintenance filtering.

Response: `Equipment[]` with a computed `nextDueAt: string | null` field appended to each. Units with no `serviceIntervalMonths` have `nextDueAt: null` in the response and are excluded from `maintenanceDue` filtering.

#### `POST /api/equipment`

Body (Zod):
```typescript
{
  customerId: string,
  equipmentType: string,
  make?: string,
  model?: string,
  serialNumber?: string,
  installDate?: string,     // ISO date
  warrantyExpiry?: string,  // ISO date
  serviceIntervalMonths?: number,
  notes?: string,
}
```

Verifies `customerId` belongs to the org before creating. Returns created `Equipment`.

#### `PATCH /api/equipment/:id`

Same optional fields as POST body (all optional). Verifies equipment belongs to org. Returns updated `Equipment`.

#### `DELETE /api/equipment/:id`

Verifies ownership. Sets `equipmentId = null` on linked jobs (cascade SetNull handles this). Returns 204.

#### `GET /api/equipment/:id/history`

Returns all `Job` records where `equipmentId = id`, ordered by `scheduledAt desc`. Verifies equipment belongs to org.

Response: `Job[]`

#### `POST /api/equipment/check-maintenance`

Scans for maintenance-due units and creates draft jobs.

Steps:
1. Load all `Equipment` for the org where `serviceIntervalMonths` is set
2. Compute `nextDueAt` for each (formula above)
3. Filter to units where `nextDueAt <= today + 30 days`
4. For each due unit, check if a `pending` or `scheduled` job already exists with `equipmentId = unit.id` — skip if so
5. Create a `Job` (at this point `nextDueAt` is guaranteed non-null — only units with `serviceIntervalMonths` set reach this step):
   ```typescript
   {
     organizationId,
     customerId: unit.customerId,
     equipmentId: unit.id,
     status: "pending",
     priority: "normal",
     scheduledAt: nextDueAt,         // due date as the tentative scheduled time (always defined here)
     equipmentType: unit.equipmentType,
     serviceType: "maintenance",
     symptomSummary: `Scheduled maintenance — ${unit.equipmentType} tune-up`,
   }
   ```
6. Returns `{ created: Job[] }` — the list of newly created draft jobs

### Wire into jobs completion: `backend/src/routes/jobs.ts`

When a job transitions to `status: "completed"` and has an `equipmentId`, update `equipment.lastServicedAt`:

```typescript
if (parsed.data.status === "completed" && job.equipmentId) {
  await prisma.equipment.update({
    where: { id: job.equipmentId },
    data: { lastServicedAt: new Date() },
  }).catch(console.error) // fire-and-forget
}
```

### Mount in `backend/src/index.ts`

```typescript
import { equipmentRouter } from "./routes/equipment.js"
// ...
app.use("/api/equipment", apiLimiter, requireAuth, requireSubscription, equipmentRouter);
```

---

## Frontend

### API types: `frontend/src/api/types.ts`

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
  nextDueAt: string | null   // computed by backend
  createdAt: string
  updatedAt: string
}
```

Also add `equipmentId: string | null` to `ApiJob`.

### New pages / components

#### `frontend/src/components/equipment/EquipmentCard.tsx`

Displays a single unit in the customer equipment tab:
- Make + model + equipment type as title
- Serial number, install date, warranty expiry (show "expired" badge if past)
- Maintenance due badge (destructive) when `nextDueAt` is past or within 30 days
- "Last serviced X ago" / "Next due in X days" line
- History button → navigates to equipment history (or inline expand)
- Edit button → opens `EquipmentFormDialog`

#### `frontend/src/components/equipment/EquipmentFormDialog.tsx`

Modal dialog for create/edit. Fields: equipment type (select), make, model, serial number, install date, warranty expiry, service interval (select: None / Every 3 months / Every 6 months / Every 12 months / Every 24 months), notes.

Used from both the customer equipment tab and the + Add Equipment button.

#### `frontend/src/components/equipment/MaintenanceDueWidget.tsx`

Office dashboard widget. On mount:
1. Calls `GET /api/equipment?maintenanceDue=true`
2. If results exist, renders a card listing each unit with customer name, unit name, and how overdue/upcoming
3. "Create draft jobs" button calls `POST /api/equipment/check-maintenance` and shows a toast with count created

Hidden when 0 units are due.

### Customer detail page: equipment tab

The existing customer detail page (office side) gets an **Equipment** tab alongside Overview, Jobs, Invoices. Tab content:
- Lists all `Equipment` for this customer via `GET /api/equipment?customerId=:id`
- Renders `<EquipmentCard>` per unit
- "+ Add Equipment" button opens `EquipmentFormDialog` in create mode

### Job creation / edit: equipment picker

When creating or editing a job for a specific customer, add an optional **Equipment** select field:
- Populated from `GET /api/equipment?customerId=:customerId`
- Options show `{make} {model} — {equipmentType}` or just `{equipmentType}` if no make/model
- Selecting a unit auto-fills `equipmentType` on the job form
- "Add new unit" option opens `EquipmentFormDialog` inline

### Technician job view: equipment context

In `TechnicianJobs.tsx`, when an expanded job has an `equipmentId`, show an equipment context block:
- Unit name (make + model + type)
- Serial number, install date, warranty status
- Last 3 jobs for this unit (fetched from `GET /api/equipment/:id/history`, limited client-side)

### Office dashboard: maintenance widget placement

Add `<MaintenanceDueWidget />` to the office dashboard page, below the stats row and above the recent jobs table.

---

## Error States

| Condition | Behavior |
|---|---|
| `customerId` doesn't belong to org | 403 |
| Equipment not found / wrong org | 404 |
| No units with `serviceIntervalMonths` | `check-maintenance` returns `{ created: [] }` |
| Job already exists for due unit | Skipped silently; not included in `created` |

---

## New Files

| File | Purpose |
|---|---|
| `backend/src/routes/equipment.ts` | CRUD + history + check-maintenance |
| `frontend/src/components/equipment/EquipmentCard.tsx` | Single unit display |
| `frontend/src/components/equipment/EquipmentFormDialog.tsx` | Create/edit modal |
| `frontend/src/components/equipment/MaintenanceDueWidget.tsx` | Dashboard maintenance widget |

## Modified Files

| File | Change |
|---|---|
| `backend/prisma/schema.prisma` | Add `Equipment` model, `equipmentId` on `Job`, back-relations |
| `backend/src/routes/jobs.ts` | Update `lastServicedAt` on job completion |
| `backend/src/index.ts` | Mount `equipmentRouter` |
| `frontend/src/api/types.ts` | Add `Equipment` type, `equipmentId` to `ApiJob` |
| `frontend/src/pages/office/OfficeCustomers.tsx` | Add Equipment tab to customer detail view |
| `frontend/src/pages/office/OfficeDashboard.tsx` | Add `MaintenanceDueWidget` |
| `frontend/src/pages/office/OfficeJobs.tsx` | Add equipment picker to job create/edit |
| `frontend/src/pages/technician/TechnicianJobs.tsx` | Add equipment context block |

---

## Out of Scope

- Multiple maintenance schedules per unit (e.g. filter every 3mo + tune-up every 12mo)
- Equipment photos
- QR code / barcode scanning for serial numbers
- Equipment location beyond customer address
- Parts inventory tied to equipment
- Automated SMS/email reminders to customers about maintenance
- Per-org equipment type customization
