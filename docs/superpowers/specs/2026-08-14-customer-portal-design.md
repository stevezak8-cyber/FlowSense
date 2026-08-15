# Customer Self-Service Portal Enhancements — Design Spec

**Date:** 2026-08-14
**Feature:** Three new customer-facing capabilities: equipment history view, customer notifications (SMS + email, reminders + status updates), and customer profile + notification preference editing
**Status:** Approved for implementation

---

## Overview

Customers accessing the portal at `/customer/*` gain three additions:

1. **Equipment tab** — read-only list of their registered HVAC units (data managed by office staff)
2. **Notification delivery** — SMS and email for job status changes (en_route, in_progress, completed) and appointment reminders (24 h and 2 h before scheduled time)
3. **Account tab** — editable contact info (name, phone, email, address) and per-channel notification opt-out toggles (SMS, email)

---

## Backend

### 1. Schema migration

**File:** `backend/prisma/schema.prisma`

Add one field to `Customer`:

```prisma
emailOptOut  Boolean  @default(false)
```

The existing `smsOptOut Boolean @default(false)` already exists. No other schema changes are needed — all other data (equipment, jobs) is already present.

Run: `npm run db:migrate` with description `add_email_opt_out`.

### 2. Customer profile route

**File:** `backend/src/routes/customers.ts` — add two new endpoints at the bottom (customer-role guard):

**`GET /api/customers/me`** — returns the customer's own profile.

- Auth: `requireAuth`; must have `req.user.role === "customer"` and `req.user.customerId` set; return 403 otherwise.
- Prisma: `prisma.customer.findUnique({ where: { id: req.user.customerId }, select: { id, name, phone, email, address, smsOptOut, emailOptOut } })`
- Note: `address` is the single `address` field (line 1). `city`, `state`, `postalCode` are not exposed — full address editing is out of scope for the portal MVP.
- Returns 404 if not found.

**`PATCH /api/customers/me`** — updates the customer's own profile.

- Auth: same guard as above.
- Body fields (all optional): `name: string`, `phone: string`, `email: string`, `address: string`, `smsOptOut: boolean`, `emailOptOut: boolean`.
- Validates: if `phone` provided, must have `phone.trim().length >= 10`; if `email` provided, must contain `@`.
- Prisma: `prisma.customer.update({ where: { id: req.user.customerId }, data: { ...validatedFields } })`
- Returns the updated customer (same select shape as GET).
- Try/catch: 500 on DB error.

**Tests:** `backend/src/__tests__/customers-me.test.ts`

5 tests:
1. GET returns 403 for non-customer role
2. GET returns customer profile for customer role
3. PATCH updates name and phone
4. PATCH toggles smsOptOut
5. PATCH toggles emailOptOut

### 3. Customer equipment route

**File:** `backend/src/routes/customers.ts` — one more endpoint:

**`GET /api/customers/me/equipment`** — returns the customer's own equipment list.

- Auth: customer-role guard (same as above).
- Prisma: `prisma.equipment.findMany({ where: { customerId: req.user.customerId, organizationId: req.user.organizationId }, select: { id, equipmentType, make, model, serialNumber, installDate, warrantyExpiry, serviceIntervalMonths, lastServicedAt }, orderBy: { createdAt: "asc" } })`
- Returns an array (empty if none).

**Test:** add one test to the above file:
6. GET /api/customers/me/equipment returns array scoped to the customer

### 4. Notification emails for job status changes

**File:** `backend/src/routes/jobs.ts` already calls `sendStatusEmails(job, ...)` on every status change (this is an existing helper that sends booking confirmation emails). Rather than adding parallel email functions that would cause duplicates, extend the existing `sendStatusEmails` call site or the function itself.

Check the existing `sendStatusEmails` implementation and extend it to:
1. Handle `en_route` — email subject: `"Your technician is on the way"`, body: "Your technician is on the way and should arrive within the hour. Thank you for choosing [org name]."
2. Handle `in_progress` — email subject: `"Your service has started"`, body: "Your technician has arrived and your service is now in progress." (No SMS counterpart — the en_route SMS already signals imminent arrival.)
3. Handle `completed` — email subject: `"Your service is complete"`, body: "Your service is complete. Thank you for choosing [org name]!"

All three must guard: skip if `customer.emailOptOut` or no `customer.email`. Fetch `customer: { select: { email, emailOptOut } }` and `organization: { select: { name } }` via Prisma.

**File:** `backend/src/services/email.ts` — add three exported helper functions used by the above:

- `sendEnRouteEmail(jobId: string)`: guards + sends
- `sendJobInProgressEmail(jobId: string)`: guards + sends
- `sendJobCompletedEmail(jobId: string)`: guards + sends

These helpers are individually testable and called from the existing status-change handler. Do NOT also add them as standalone `.catch` calls alongside the SMS calls — the existing `sendStatusEmails` call already handles all status events.

**Tests:** `backend/src/__tests__/email.test.ts` (new file or extend existing):
1. `sendEnRouteEmail` skips customer with `emailOptOut: true`
2. `sendEnRouteEmail` skips customer with no email
3. `sendJobCompletedEmail` sends when email present and not opted out

### 5. Appointment reminder scheduler

**File:** `backend/src/services/reminder-scheduler.ts` (new file)

Exports one function: `runReminderSchedule(): Promise<void>`

Logic:
1. Find jobs where `status IN ['pending', 'scheduled']` and `scheduledAt` falls within the next 24 h–25 h window (for the 24 h reminder) or 2 h–2 h 30 min window (for the 2 h reminder).
2. For each matching job, send SMS (if not `smsOptOut` and org `smsEnabled`) and email (if not `emailOptOut` and customer has email).
3. Use a `NotificationLog` table to track sent reminders and prevent duplicates (see schema below — actually, use a simpler approach: check if we've already sent by storing a flag on the job or querying a log).

**Deduplication:** Rather than a new model, use the job's `scheduledAt` + a simple in-process check against a `Set<string>` is insufficient across restarts. Instead, add two nullable DateTime fields to `Job`:

```prisma
reminder24hSentAt  DateTime?
reminder2hSentAt   DateTime?
```

Schema migration: `add_job_reminder_sent_at`.

Scheduler logic:
```typescript
const now = new Date()
const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000)
const in25h = new Date(now.getTime() + 25 * 60 * 60 * 1000)
const in2h = new Date(now.getTime() + 2 * 60 * 60 * 1000)
const in2h30 = new Date(now.getTime() + (2 * 60 + 30) * 60 * 1000)

// 24h reminder jobs
const jobs24h = await prisma.job.findMany({
  where: {
    status: { in: ["pending", "scheduled"] },
    scheduledAt: { gte: in24h, lte: in25h },  // 1-hour window for 15-min cron robustness
    reminder24hSentAt: null,
  },
  include: {
    customer: { select: { phone, email, smsOptOut, emailOptOut } },
    organization: { select: { name, smsEnabled } },
  },
})

for (const job of jobs24h) {
  await sendReminderSms(job, "24h")
  await sendReminderEmail(job, "24h")
  await prisma.job.update({ where: { id: job.id }, data: { reminder24hSentAt: new Date() } })
}

// 2h reminder — same pattern with reminder2hSentAt, window: in2h–in2h30 (30-min window for cron robustness)
```

**SMS helper:** `sendReminderSms(job, window)` — inline in this file, calls the Twilio `send()` utility. Message: `"Reminder: your service appointment is tomorrow at [time]."` / `"Reminder: your technician will arrive in about 2 hours."`.

**Email helper:** `sendReminderEmail(job, window)` — calls `sendEmail()` from `email.ts`.
- 24h window: subject `"Service appointment reminder"`, body: "This is a reminder that your service appointment is scheduled for [date/time]. We look forward to seeing you!"
- 2h window: subject `"Your technician is arriving soon"`, body: "Your technician will arrive in approximately 2 hours for your service appointment today."

**Mount in `backend/src/index.ts`:**

```typescript
import { runReminderSchedule } from "./services/reminder-scheduler.js"
// Every 15 minutes
cron.schedule("*/15 * * * *", () => {
  runReminderSchedule().catch((err) => console.error("[Reminders] Error:", err))
})
```

**Tests:** `backend/src/__tests__/reminder-scheduler.test.ts`

4 tests:
1. Sends 24h reminder SMS for eligible job, skips job with reminder already sent
2. Sends 2h reminder SMS for eligible job
3. Skips customer with smsOptOut
4. Skips customer with emailOptOut for email reminder

---

## Frontend

### 1. New API types

**File:** `frontend/src/api/types.ts` — append:

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

### 2. Updated CustomerLayout.tsx

**File:** `frontend/src/pages/customer/CustomerLayout.tsx`

Add two nav items to the existing tab list:
- `Equipment` — icon: `Wrench` from lucide-react — path: `/customer/equipment`
- `Account` — icon: `UserCircle` from lucide-react — path: `/customer/account`

No structural changes — follow the existing tab pattern exactly.

### 3. CustomerEquipment.tsx

**File:** `frontend/src/pages/customer/CustomerEquipment.tsx` (new)

**State:** `items: CustomerEquipmentItem[] | null`, `loading: boolean`, `error: boolean`

**On mount:** `GET /api/customers/me/equipment`

**Rendering:**
- Loading: spinner
- Error: "Could not load equipment."
- Empty: "No equipment on file. Contact us to register your units."
- List: one card per item with:
  - Header: `equipmentType` (bold) · `make model` (muted, if present)
  - 2×2 grid: Serial / Install date / Last serviced / Next due
  - Next due = `lastServicedAt` + `serviceIntervalMonths` months. If computed date < today + 60 days, show in amber (`text-amber-600`). If past due, show in red.
  - All fields show "—" if null.
  - No edit controls — read-only.

### 4. CustomerAccount.tsx

**File:** `frontend/src/pages/customer/CustomerAccount.tsx` (new)

**State:**
- `profile: CustomerProfile | null` (loaded from GET /api/customers/me)
- `form: { name, phone, email, address }` (controlled form)
- `saving: boolean`
- `saved: boolean` (brief success flash)

**On mount:** fetch profile, populate form.

**Contact Info section:**
- Four inputs: Name, Phone, Email (optional), Address
- Single "Save changes" button — calls `PATCH /api/customers/me` with form values
- On success: show "Saved!" indicator for 2 s, then clear
- Validation: name and phone required; if email present must contain `@`

**Notifications section:**
- SMS toggle: label "SMS notifications", description "Reminders & status updates to [phone]"
  - Controlled by `profile.smsOptOut` (inverted — toggle ON = optOut false)
  - On change: immediately calls `PATCH /api/customers/me { smsOptOut: !newValue }`
- Email toggle: label "Email notifications", description "Reminders & status updates to [email]" (show "Add an email address to enable" if no email)
  - Disabled if no email
  - Controlled by `profile.emailOptOut` (inverted — toggle ON = optOut false)
  - Toggle value: `!profile.emailOptOut`; on change: `PATCH /api/customers/me { emailOptOut: !newValue }`

### 5. Router wiring

**File:** `frontend/src/App.tsx` (or wherever customer routes are defined)

Add two new `<Route>` entries inside the `/customer` layout route:
```tsx
<Route path="equipment" element={<CustomerEquipment />} />
<Route path="account" element={<CustomerAccount />} />
```

---

## Error States

| Condition | Behaviour |
|---|---|
| `GET /api/customers/me` fails | Account page shows "Could not load profile." |
| `PATCH /api/customers/me` fails | Form shows "Failed to save. Try again." inline |
| `GET /api/customers/me/equipment` fails | Equipment page shows "Could not load equipment." |
| No email on customer profile | Email toggle disabled with explanatory label |
| Reminder already sent (flag set) | Scheduler skips silently |
| Twilio/Resend not configured | Functions log warning and return early (existing pattern) |

---

## Out of Scope

- Customers adding or removing equipment (office-only)
- Job history tab in customer portal
- Push notification channel for reminders
- Reminder for customers with no portal account (SMS/email still fires regardless of portal access)
- Un-cancelling or rescheduling appointments from the portal
- Admin UI for toggling per-customer email opt-out (customer self-manages)
