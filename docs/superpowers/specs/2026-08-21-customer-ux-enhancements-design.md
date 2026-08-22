# Customer UX Enhancements — Design Spec

**Date:** 2026-08-21
**Feature:** Three customer-facing improvements: office availability windows, customer job cancellation, and post-job reviews
**Status:** Approved for implementation

---

## Overview

Three independent enhancements to the customer and office experience, all fitting within the existing job/customer lifecycle:

1. **Availability Windows** — office configures working hours and blocked dates; customer booking is constrained to those windows
2. **Customer Cancellation** — customers can cancel their own pending or scheduled appointments from the customer portal
3. **Post-Job Reviews** — customers leave a star rating + comment after job completion; office views reviews privately

---

## Feature 1: Availability Windows

### Schema Changes

**File:** `backend/prisma/schema.prisma`

Add `availabilitySchedule` JSON field to `Organization`:
```prisma
availabilitySchedule Json?  // { mon: { open: "08:00", close: "17:00" } | null, tue: ..., wed: ..., thu: ..., fri: ..., sat: ..., sun: ... }
```
A `null` value for a weekday means the office is closed that day.

New model `BlockedDate`:
```prisma
model BlockedDate {
  id             String   @id @default(cuid())
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  date           DateTime // store as midnight UTC of the blocked day
  reason         String?
  createdAt      DateTime @default(now())

  @@unique([organizationId, date])
  @@index([organizationId])
}
```

The `@@unique([organizationId, date])` constraint prevents duplicate blocked dates. `POST /api/availability/blocked-dates` returns 409 if the date is already blocked.

Add back-relation on `Organization`:
```prisma
blockedDates BlockedDate[]
```

Migration name: `add_availability_and_reviews`

### Backend Routes

**File:** `backend/src/routes/availability.ts` (new)

Export: `availabilityRouter`

**`GET /api/availability`**
- Auth: `requireAuth` (any role)
- Org resolution: use `req.user!.organizationId` — this field is present on all role JWTs (office, technician, customer) in the existing auth middleware
- Returns: `{ schedule: org.availabilitySchedule, blockedDates: BlockedDate[] }` — blocked dates ordered by `date asc`, only future dates (>= today midnight UTC)
- No `requireSubscription` guard — booking must work for customer-role users

**`PUT /api/availability/schedule`**
- Auth: office role only (403 otherwise)
- Body: full `AvailabilitySchedule` object — all 7 keys (`mon`–`sun`) must be present (each is `{ open: string; close: string } | null`); returns 400 if any key is missing
- Validates time strings are HH:MM format and open < close for non-null days
- Replaces `organization.availabilitySchedule` entirely via `prisma.organization.update({ data: { availabilitySchedule: body } })`
- Returns the updated `availabilitySchedule` value

**`POST /api/availability/blocked-dates`**
- Auth: office role only
- Body: `{ date: string; reason?: string }` — ISO date string, normalised to midnight UTC before insert
- Returns 409 if `[organizationId, date]` already exists (unique constraint)
- Creates `BlockedDate` record, returns created record (201)

**`DELETE /api/availability/blocked-dates/:id`**
- Auth: office role only
- Lookup: `prisma.blockedDate.findFirst({ where: { id: req.params.id, organizationId: req.user!.organizationId } })` — returns 404 if not found or not in org
- Deletes record, returns 204

**Mount in `backend/src/index.ts`:**
```typescript
import { availabilityRouter } from "./routes/availability.js"
app.use("/api/availability", apiLimiter, requireAuth, availabilityRouter)
```

Note: `requireSubscription` is intentionally omitted so availability is readable by all authenticated users (including customers on free-trial orgs).

### Availability Enforcement

Availability constraints are enforced **client-side only** in `CustomerBook.tsx`. The `POST /api/jobs` backend route does not validate against `availabilitySchedule` or `BlockedDate`. A determined customer can book outside hours via direct API call. This is intentional — office staff review all incoming jobs and can cancel ones booked at unusual times. Server-side enforcement is out of scope for this iteration.

### Tests

**File:** `backend/src/__tests__/availability.test.ts` (new)

6 tests:
1. `GET /` returns schedule and future blocked dates
2. `PUT /schedule` returns 403 for non-office role
3. `PUT /schedule` replaces org availabilitySchedule
4. `POST /blocked-dates` returns 403 for non-office role
5. `POST /blocked-dates` creates a blocked date and returns 409 on duplicate
6. `DELETE /blocked-dates/:id` removes a blocked date

### Office UI

**File:** `frontend/src/pages/office/OfficeSettings.tsx` (modify)

Add "Availability" section card below existing settings:

- **Weekly schedule:** Seven rows (Mon–Sun), each with a toggle (open/closed) and, when open, two time inputs (`open`, `close` in HH:MM). Default: Mon–Fri 08:00–17:00, Sat/Sun closed.
- **Blocked dates:** List of upcoming blocked dates with date + optional reason + remove button. Date picker + optional reason input + "Add" button to add new entries.
- Save button sends the full 7-day schedule payload to `PUT /api/availability/schedule`. Blocked dates are added/removed immediately via `POST`/`DELETE`.

### Customer Booking UI

**File:** `frontend/src/pages/customer/CustomerBook.tsx` (modify)

On mount, fetch `GET /api/availability`. Use the response to:
- **Date input:** Set `min` to today. For each date the customer selects, check if the day-of-week is closed (`schedule[day] === null`) or matches a date in `blockedDates` — display an inline note "Not available on this date" and disable the submit button.
- **Time input:** When a valid date is selected, clamp the allowed time range to `schedule[day].open`–`schedule[day].close`. Show helper text "Available: 8:00 AM – 5:00 PM".
- **Validation on submit:** Re-check the selected datetime against availability before calling `POST /api/jobs`. Return a user-facing error if out of window (edge case: schedule changed after page load).
- If `GET /api/availability` fails, show no time constraints (fail open — better than blocking booking entirely).

---

## Feature 2: Customer Cancellation

### Backend

**File:** `backend/src/routes/jobs.ts` (modify)

Add new route `POST /api/jobs/:id/cancel` (POST, not DELETE — the job is updated, not destroyed):

```typescript
jobsRouter.post("/:id/cancel", async (req, res) => {
  if (req.user!.role !== "customer") return res.status(403).json({ error: "Forbidden" })

  // customerId is not guaranteed in the JWT for customer-role users;
  // look it up from the DB (same pattern as POST / in this file).
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
  const updated = await prisma.job.update({
    where: { id: job.id },
    data: { status: "cancelled" },
  })
  notifyOfficeCancellation({ jobId: job.id, customerName: job.customer.name, orgId: req.user!.organizationId }).catch(console.error)
  return res.json(updated)
})
```

**File:** `backend/src/services/org-notifications.ts` (modify)

Add `notifyOfficeCancellation`:
```typescript
export async function notifyOfficeCancellation(params: {
  jobId: string
  customerName: string
  orgId: string
}): Promise<void>
```
Uses `getOrgDispatch(orgId)` pattern. Sends email: subject `"Appointment cancelled — ${customerName}"`, body with job id and customer name. No SMS (not time-critical enough to page).

### Tests

**File:** `backend/src/__tests__/jobs-cancel.test.ts` (new)

4 tests:
1. Returns 403 for non-customer role
2. Returns 403 if job belongs to a different customer (DB lookup of customerId used for comparison)
3. Returns 400 if job status is `completed`
4. Sets status to `cancelled` and calls `notifyOfficeCancellation`

### Customer UI

**File:** `frontend/src/pages/customer/CustomerHistory.tsx` (modify)

For each job with status `pending` or `scheduled`, render a "Cancel appointment" button below the job card. On click: confirm dialog ("Cancel this appointment?") → `POST /api/jobs/:id/cancel` → remove job from list on success.

---

## Feature 3: Post-Job Reviews

### Schema Changes

**File:** `backend/prisma/schema.prisma`

New model `JobReview` (add to same migration as `BlockedDate`):
```prisma
model JobReview {
  id             String   @id @default(cuid())
  jobId          String   @unique
  job            Job      @relation(fields: [jobId], references: [id], onDelete: Cascade)
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  customerId     String
  customer       Customer @relation(fields: [customerId], references: [id], onDelete: Cascade)
  rating         Int      // 1–5
  comment        String?
  createdAt      DateTime @default(now())

  @@index([organizationId])
  @@index([customerId])
}
```

Add back-relations:
```prisma
// On Job:
review JobReview?

// On Organization:
reviews JobReview[]

// On Customer:
reviews JobReview[]
```

### Backend Routes

**File:** `backend/src/routes/jobs.ts` (modify)

Add `POST /api/jobs/:id/review`:
- Auth: customer role only (403 otherwise)
- Look up `customerId` from DB (same pattern as cancel route above — `prisma.user.findUnique`)
- 404 if job not found in org
- 403 if `job.customerId !== user.customerId` (wrong customer)
- 400 if `job.status !== "completed"` (job not yet done)
- Body: `{ rating: number (1–5), comment?: string }`
- `jobId` has a unique DB constraint — return 409 with the existing `JobReview` record in the body if a review already exists (allows client to render the existing rating without a refetch)
- Creates `JobReview` record with `organizationId`, `customerId`, `jobId`, `rating`, `comment`
- Returns created record (201)

Also extend `GET /api/jobs` (the existing list route) to include `review` when the requesting user has role `customer`:
```typescript
// In the include block when role === "customer":
review: true
```
This ensures the customer job history page can show existing reviews without a second fetch.

**File:** `backend/src/routes/reviews.ts` (new)

Export: `reviewsRouter`

**`GET /api/reviews`**
- Auth: office role only (403 otherwise)
- Query params: `customerId` (optional filter)
- Returns reviews ordered by `createdAt desc`, including `job { scheduledAt, equipmentType }` and `customer { name }`

**Mount in `backend/src/index.ts`:**
```typescript
import { reviewsRouter } from "./routes/reviews.js"
app.use("/api/reviews", apiLimiter, requireAuth, requireSubscription, reviewsRouter)
```

### Tests

**File:** `backend/src/__tests__/reviews.test.ts` (new)

7 tests:
1. `POST /api/jobs/:id/review` returns 403 for non-customer role
2. `POST /api/jobs/:id/review` returns 400 if job not completed
3. `POST /api/jobs/:id/review` returns 403 if job belongs to different customer
4. `POST /api/jobs/:id/review` creates review (201)
5. `POST /api/jobs/:id/review` returns 409 with existing `JobReview` in body if review already exists
6. `GET /api/reviews` returns 403 for non-office role
7. `GET /api/reviews` returns reviews for org

### Customer UI

**File:** `frontend/src/pages/customer/CustomerHistory.tsx` (modify)

`GET /api/jobs` now includes `review` in the response for customer-role users (see backend change above). No extra fetch needed.

For each `completed` job:
- If `review` is null: show "Rate this visit" — 5 star buttons (☆ → ★ on hover/select) + optional textarea + "Submit" button. On submit: `POST /api/jobs/:id/review` → replace prompt with submitted rating display.
- If `review` exists: show the rating as filled stars + comment (read-only).

### Office UI

**File:** `frontend/src/pages/office/OfficeCustomers.tsx` (modify)

In the customer detail panel/drawer, add a "Reviews" section below job history showing all reviews for that customer: date, star rating (★★★★☆), comment. Show average rating in the customer header (`★ 4.2` next to the name).

Fetch `GET /api/reviews?customerId=X` when the customer detail opens.

---

## API Types

**File:** `frontend/src/api/types.ts` (modify)

```typescript
export interface AvailabilitySchedule {
  mon: { open: string; close: string } | null
  tue: { open: string; close: string } | null
  wed: { open: string; close: string } | null
  thu: { open: string; close: string } | null
  fri: { open: string; close: string } | null
  sat: { open: string; close: string } | null
  sun: { open: string; close: string } | null
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

Also extend `ApiJob` to include `review?: JobReview | null`.

---

## Error States

| Condition | Behaviour |
|---|---|
| Customer picks a closed day | Inline error on booking form, submit disabled |
| Customer picks time outside working hours | Inline error on booking form, submit disabled |
| Customer cancels a job in `en_route`/`in_progress` | 400 — "Job cannot be cancelled at this stage" |
| Customer submits second review | 409 with existing `JobReview` in body — client renders existing rating, hides submit button |
| `GET /api/availability` fails | CustomerBook shows no time constraints (fail open — better than blocking booking entirely) |
| `POST /api/availability/blocked-dates` with duplicate date | 409 — office sees inline error "This date is already blocked" |

---

## Out of Scope

- Per-technician availability (all technicians share org-wide schedule)
- Customer rescheduling (cancel and rebook)
- Public review display (reviews are office-only)
- Review responses from office
- Automatic review request email after job completion
- Half-hour slot blocking (availability is hour-window, not per-slot)
- Server-side availability enforcement on `POST /api/jobs` (client-side only)
