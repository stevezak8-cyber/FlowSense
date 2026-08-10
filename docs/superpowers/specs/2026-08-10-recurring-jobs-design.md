# Recurring Jobs — Design Spec

**Date:** 2026-08-10
**Feature:** Feature 7 of 11 — Recurring Jobs
**Status:** Approved for implementation

---

## Overview

Allow office staff to define recurring job schedules per customer. A daily cron creates draft jobs 14 days before each schedule's due date. Office reviews drafts on the dashboard and confirms them (adding a date and technician) via the existing job list. No separate "recurring jobs" page — schedules live on the customer panel and drafts surface on the dashboard.

---

## Data & API

### Prerequisites

Install `node-cron` in the backend before running migrations:
```bash
cd backend && npm install node-cron && npm install -D @types/node-cron
```

### Schema changes

#### New model: `RecurringJob`

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

  equipmentType  String?      // used when no equipment linked
  serviceType    String?      // repair | maintenance | inspection | installation
  intervalDays   Int          // 7 | 14 | 30 | 90 | 180 | 365
  nextDueAt      DateTime     // when the next job is due; advances on job completion
  lastJobAt      DateTime?    // set when a linked job is completed
  notes          String?      // standing instructions passed to each spawned job

  isActive       Boolean      @default(true)
  jobs           Job[]

  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt

  @@index([organizationId])
  @@index([customerId])
  @@index([nextDueAt])
}
```

#### Back-relations on existing models

Add to each existing model (Prisma requires both sides of every relation):

- `Organization` → `recurringJobs RecurringJob[]`
- `Customer` → `recurringJobs RecurringJob[]`
- `Technician` → `recurringJobs RecurringJob[]`
- `Equipment` → `recurringJobs RecurringJob[]`

#### Modified model: `Job`

Add one field:

```prisma
recurringJobId String?
recurringJob   RecurringJob? @relation(fields: [recurringJobId], references: [id], onDelete: SetNull)
```

Add index:
```prisma
@@index([recurringJobId])
```

A `Job` with `recurringJobId != null` and `status = "pending"` is a **recurring draft** — awaiting confirmation by the office.

### Interval mapping

| `intervalDays` | Label |
|---|---|
| 7 | Weekly |
| 14 | Every 2 weeks |
| 30 | Monthly |
| 90 | Every 3 months |
| 180 | Every 6 months |
| 365 | Annually |

### Routes

All routes mounted at `/api/recurring-jobs` with `requireAuth + requireSubscription` at the mount point in `index.ts`.

#### `GET /api/recurring-jobs`
Org-scoped list. Query params:
- `customerId` (optional) — filter to one customer
- `isActive` (optional, default `"true"`) — `"true"` | `"false"` | `"all"`

Response: `RecurringJob[]` with `customer.name`, `equipment.make + model`, `technician.user.name`.

#### `POST /api/recurring-jobs`
Create a schedule. Body:
```typescript
{
  customerId: string
  technicianId?: string
  equipmentId?: string
  equipmentType?: string
  serviceType?: string
  intervalDays: number  // must be one of: 7 | 14 | 30 | 90 | 180 | 365
  nextDueAt: string     // ISO date — when the first draft should be created
  notes?: string
}
```

Validate `intervalDays` against the allowed set. Validate `customerId` belongs to the org (403 if not). Returns 201 with the created record.

#### `PATCH /api/recurring-jobs/:id`
Partial update — any subset of: `technicianId`, `equipmentId`, `equipmentType`, `serviceType`, `intervalDays`, `nextDueAt`, `notes`, `isActive`. Org-scope check: 404 if not found or not in org.

#### `DELETE /api/recurring-jobs/:id`
Hard delete. Org-scope check. Returns 204.

#### `GET /api/recurring-jobs/pending-drafts`

**IMPORTANT: Register this route BEFORE `GET /:id`** to prevent Express shadowing.

Returns pending draft jobs for the org: jobs where `recurringJobId IS NOT NULL` and `status = "pending"`. Includes `customer.name`, `equipment.make + model` (via `recurringJob.equipment`), `recurringJob.serviceType`, `recurringJob.nextDueAt`.

Response shape:
```typescript
{
  id: string               // job id
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
}[]
```

---

## Backend

### New file: `backend/src/services/recurring-jobs.ts`

Single exported function: `spawnDueJobs(organizationId?: string): Promise<number>`

- If `organizationId` provided: scoped to one org (for testing). Otherwise processes all orgs.
- Finds active `RecurringJob` where `nextDueAt <= now + 14 days` AND no existing `Job` with `recurringJobId = this.id` and `status = "pending"`.
- For each: creates a `Job` with `status: "pending"`, `recurringJobId`, `customerId`, `organizationId`, `technicianId` (from template), `equipmentId`, `equipmentType`, `serviceType`, `symptomSummary: notes ?? null`, `scheduledAt: recurringJob.nextDueAt` (used as a placeholder — office updates this at confirmation).
- Returns count of jobs created.

### Modified file: `backend/src/routes/jobs.ts`

When a job is marked `completed`, if `job.recurringJobId` is set, fire-and-forget. The completion transaction's `include` must add `recurringJob: { select: { intervalDays: true } }` so `intervalDays` is available. Guard with a null check:

```typescript
if (result.recurringJobId && result.recurringJob) {
  prisma.recurringJob.update({
    where: { id: result.recurringJobId },
    data: {
      lastJobAt: new Date(),
      nextDueAt: new Date(Date.now() + result.recurringJob.intervalDays * 86400000),
    },
  }).catch(console.error)
}
```

### New file: `backend/src/routes/recurring-jobs.ts`

Exports `recurringJobsRouter`. Implements the 5 routes above.

### Modified file: `backend/src/index.ts`

- Import and mount: `app.use("/api/recurring-jobs", apiLimiter, requireAuth, requireSubscription, recurringJobsRouter)`
- Start cron: daily at midnight using `node-cron`:
```typescript
cron.schedule("0 0 * * *", () => {
  spawnDueJobs().catch(console.error)
})
```

---

## Frontend

### New files

| File | Purpose |
|---|---|
| `frontend/src/components/recurring-jobs/RecurringJobFormDialog.tsx` | Create/edit schedule modal |
| `frontend/src/components/recurring-jobs/RecurringJobCard.tsx` | Single schedule display card |
| `frontend/src/components/recurring-jobs/RecurringDraftsWidget.tsx` | Dashboard widget showing pending drafts |

### Modified files

| File | Change |
|---|---|
| `frontend/src/api/types.ts` | Add `RecurringJob`, `RecurringDraft` interfaces |
| `frontend/src/components/customers/customer-table.tsx` | Add Recurring Jobs section to expanded customer panel |
| `frontend/src/components/jobs/jobs-table.tsx` | Add `Recurring` badge + confirm panel for draft jobs |
| `frontend/src/pages/office/OfficeDashboard.tsx` | Add `<RecurringDraftsWidget />` after `<MaintenanceDueWidget />` |

---

## Component Designs

### `RecurringJobCard.tsx`

Props: `RecurringJob` (with nested customer/equipment), `onEdit`, `onDeactivate`/`onDelete`

Displays: interval label, service type, equipment name or type, next due date (formatted as "Aug 10, 2026"), notes (truncated). Edit button opens `RecurringJobFormDialog` in edit mode. Deactivate sets `isActive: false`; active schedules show a green dot. Inactive show greyed-out with a "Reactivate" button.

### `RecurringJobFormDialog.tsx`

Props: `customerId`, `customerEquipment: Equipment[]`, `existing?: RecurringJob`, `onSaved`, `onClose`

Fields:
- Service type select (repair / maintenance / inspection / installation)
- Equipment picker (optional — select from customer's equipment; "None" option)
- Equipment type select (shown when no equipment selected)
- Interval select (Weekly / Every 2 weeks / Monthly / Every 3 months / Every 6 months / Annually)
- Next due date input (`type="date"`)
- Notes textarea

On save: `POST /api/recurring-jobs` (create) or `PATCH /api/recurring-jobs/:id` (edit). On success: call `onSaved`.

### Customer panel — Recurring Jobs section

Added below the Equipment section in `customer-table.tsx` expanded panel. Follows the same pattern as equipment: `useEffect` on `expandedCustomer` fetches `GET /api/recurring-jobs?customerId=...`. Renders `<RecurringJobCard>` per schedule. "+ Add Recurring Job" button opens `RecurringJobFormDialog`.

### Jobs table — draft job changes

In `jobs-table.tsx`:
- A job with `recurringJobId` and `status === "pending"` gets a `<Badge variant="outline">Recurring</Badge>` next to its status badge.
- In the expanded row, if `job.recurringJobId && job.status === "pending"`, show a confirm panel below normal job details:
  - `scheduledAt` date/time input
  - Technician assign select (fetches `/api/technicians`)
  - "Confirm & Schedule" button → `PATCH /api/jobs/:id` with `{ scheduledAt, technicianId, status: "scheduled" }`
  - On success: refresh job list, show `toast.success`

### `RecurringDraftsWidget.tsx`

Fetches `GET /api/recurring-jobs/pending-drafts` on mount. Returns null if empty. Shows card titled "Recurring Jobs to Confirm" with up to 5 draft rows. Each row: customer name · service type · equipment name · days until due (or "overdue" in red if `nextDueAt < now`). "Review jobs →" link to `/office/jobs`.

### Dashboard placement

`OfficeDashboard.tsx`: `<RecurringDraftsWidget />` after `<MaintenanceDueWidget />`.

---

## API Types

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

Also add to `ApiJob`:
```typescript
recurringJobId: string | null
```

---

## Error States

| Condition | Behaviour |
|---|---|
| Draft confirm fails | `toast.error`, panel stays open |
| `spawnDueJobs` throws | Logged to console, cron continues next day |
| Customer equipment fetch fails | Equipment picker shows empty, form still usable |
| Pending drafts fetch fails | Widget returns null (silent) |

---

## Out of Scope

- Customer-facing recurring schedule view
- SMS/email notification when a draft is created
- Skip/pause individual occurrences
- Custom cron expressions (day-of-week control)
- Configurable lookahead window (fixed at 14 days)
- Auto-assign technician based on availability
