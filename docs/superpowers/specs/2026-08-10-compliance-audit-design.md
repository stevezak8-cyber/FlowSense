# Compliance Audit — Design Spec

**Date:** 2026-08-10
**Feature:** Feature 6 of 11 — EPA 608 / Compliance Audit
**Status:** Approved for implementation

---

## Overview

Surface the existing `ComplianceLog` model through two UIs: an inline technician checklist that appears on in-progress/completed job cards, and an office-side audit view (per-job timeline + org-wide filterable log page). No schema migration required — the `ComplianceLog` model and basic routes already exist.

---

## Data & API

### Existing model (no changes)

```prisma
model ComplianceLog {
  id        String   @id @default(cuid())
  jobId     String
  job       Job      @relation(fields: [jobId], references: [id], onDelete: Cascade)
  type      String   // epa608_prompt | safety_ack | code_reminder
  payload   Json
  createdAt DateTime @default(now())

  @@index([jobId])
  @@index([type])
}
```

### Log type payloads

| Type | Payload shape |
|---|---|
| `epa608_prompt` | `{ certLevel: "type1" \| "type2" \| "universal", refrigerantType: string, lbsRecovered: number, lbsCharged: number }` |
| `safety_ack` | `{ items: string[] }` — items are the acknowledged safety items |
| `code_reminder` | `{ codes: string[] }` |

### Existing routes (unchanged)

- `GET /api/compliance/job/:jobId` — logs for a specific job
- `POST /api/compliance` — create a log entry

### New route

#### `GET /api/compliance`

Org-scoped list of all compliance logs. Requires `requireAuth + requireSubscription`.

Query params:
- `technicianId` (optional) — filter by the technician assigned to the job
- `type` (optional) — `epa608_prompt | safety_ack | code_reminder`
- `from` (optional) — ISO date, inclusive lower bound on `createdAt`
- `to` (optional) — ISO date, inclusive upper bound on `createdAt`

Default: last 90 days.

Response: `ComplianceLog[]` with joined job fields — `job.id`, `job.scheduledAt`, `job.equipmentType`, `job.customer.name`, `job.technician.user.name`.

Implementation: `prisma.complianceLog.findMany` with a `job: { organizationId }` filter to scope to the org, plus optional `where` clauses for the query params.

---

## Backend

### Modify `backend/src/routes/compliance.ts`

Add the `GET /api/compliance` handler. The existing handlers stay unchanged.

```typescript
complianceRouter.get("/", requireAuth, requireSubscription, async (req, res) => {
  const { organizationId } = req.user!
  const { technicianId, type, from, to } = req.query

  const defaultFrom = new Date()
  defaultFrom.setDate(defaultFrom.getDate() - 90)

  const logs = await prisma.complianceLog.findMany({
    where: {
      job: {
        organizationId,
        ...(technicianId ? { technicianId: technicianId as string } : {}),
      },
      ...(type ? { type: type as string } : {}),
      createdAt: {
        gte: from ? new Date(from as string) : defaultFrom,
        ...(to ? { lte: new Date(to as string) } : {}),
      },
    },
    include: {
      job: {
        select: {
          id: true,
          scheduledAt: true,
          equipmentType: true,
          customer: { select: { name: true } },
          technician: { select: { user: { select: { name: true } } } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  })

  res.json(logs)
})
```

**Note:** The existing `GET /api/compliance/job/:jobId` handler does not use `requireAuth` — leave it as-is to avoid breaking changes, but the new org-wide `GET /api/compliance` must be auth-gated.

---

## Frontend

### New files

| File | Purpose |
|---|---|
| `frontend/src/components/compliance/ComplianceForm.tsx` | Inline technician checklist (EPA 608 + safety ACK) |
| `frontend/src/components/compliance/ComplianceTimeline.tsx` | Per-job compliance log timeline (office) |
| `frontend/src/pages/office/OfficeCompliance.tsx` | Org-wide compliance audit page |

### Modified files

| File | Change |
|---|---|
| `frontend/src/pages/technician/TechnicianJobs.tsx` | Add `<ComplianceForm>` to expanded job card |
| `frontend/src/pages/office/OfficeJobs.tsx` | Add `<ComplianceTimeline>` to expanded job detail |
| `frontend/src/pages/office/OfficeLayout.tsx` | Add Compliance link to sidebar |
| `frontend/src/App.tsx` (or router file) | Add `/office/compliance` route |
| `frontend/src/api/types.ts` | Add `ComplianceLog` interface |

---

## Component Designs

### `ComplianceForm.tsx`

Props:
```typescript
interface Props {
  jobId: string
  equipmentType: string | null
  onLogged: () => void  // called after successful submission
}
```

**Behaviour:**

1. On mount, calls `GET /api/compliance/job/:jobId`. If any logs exist, renders a green "Compliance logged ✓" badge and returns — no form shown.
2. If no logs exist, renders the three-part form:

**Part 1 — EPA 608** (only when `equipmentType` is `ac`, `heat-pump`, `mini-split`, or `boiler`):
- `certLevel` select: Type I / Type II / Universal
- `refrigerantType` select: R-22 / R-410A / R-32 / R-134a / Other
- `lbsRecovered` number input (step 0.1, min 0)
- `lbsCharged` number input (step 0.1, min 0)

**Part 2 — Safety ACK:**
Three checkboxes (all required):
- "PPE worn"
- "Work area secured"
- "Lockout/tagout followed"

**Part 3 — Submit:**
- "Submit compliance log" button — disabled until safety checkboxes are all checked (EPA 608 optional fields are not blocking)
- On submit: POST one `epa608_prompt` log (if applicable) and one `safety_ack` log as sequential `Promise.all` calls
- On success: call `onLogged()`, show green "Compliance logged ✓"
- On error: show `toast.error`

**Placement in `TechnicianJobs.tsx`:** Renders inside the expanded job card, below the equipment context block and above the Ask AI button. Only shown when `job.status === "in_progress" || job.status === "completed"`.

### `ComplianceTimeline.tsx`

Props:
```typescript
interface Props {
  jobId: string
}
```

Fetches `GET /api/compliance/job/:jobId` on mount. If empty, renders nothing (hidden). Otherwise renders a compact vertical timeline:

- Each entry: timestamp (relative), type badge (`EPA 608` / `Safety` / `Code`), payload rendered as readable text:
  - `epa608_prompt`: `{refrigerantType} · {lbsRecovered} lbs recovered · {lbsCharged} lbs charged · {certLevel} cert`
  - `safety_ack`: comma-joined list of `items`
  - `code_reminder`: comma-joined `codes`

**Placement in `OfficeJobs.tsx`:** Rendered inside the expanded job row, below the existing job details.

### `OfficeCompliance.tsx`

Full audit page. On mount fetches `GET /api/compliance` (default last 90 days). Also fetches `/api/technicians` to populate the technician filter dropdown.

**Filters (top bar):**
- Technician dropdown (All / individual technicians)
- Type dropdown (All / EPA 608 / Safety / Code)
- Date range: two date inputs (from / to), defaulting to 90 days ago → today

Filters re-fetch on change.

**Table columns:** Date, Job, Customer, Technician, Type (badge), Summary

**Empty state:** "No compliance logs found for the selected filters."

---

## API Types

```typescript
export interface ComplianceLog {
  id: string
  jobId: string
  type: "epa608_prompt" | "safety_ack" | "code_reminder"
  payload: Record<string, unknown>
  createdAt: string
  job?: {
    id: string
    scheduledAt: string | null
    equipmentType: string | null
    customer: { name: string } | null
    technician: { user: { name: string } | null } | null
  }
}
```

---

## Routing & Navigation

Add to `OfficeLayout.tsx` sidebar (after Revenue):
```tsx
<NavLink to="/office/compliance">Compliance</NavLink>
```

Add route in router config:
```tsx
<Route path="/office/compliance" element={<OfficeCompliance />} />
```

---

## Error States

| Condition | Behaviour |
|---|---|
| Compliance fetch fails on tech side | Form still renders (non-blocking) |
| Submit fails | `toast.error`, form stays open |
| No logs in org-wide view | Empty state message |
| Job has no technician (walk-in) | Technician column shows "—" |

---

## Out of Scope

- Photo audit log type (model supports it but UI deferred)
- AI disclaimer log type
- PDF export of compliance audit
- Customer-facing compliance certificates
- Mandatory gate blocking job completion until compliance is filed
- Code reminder UI (model supports it, deferred to future feature)
