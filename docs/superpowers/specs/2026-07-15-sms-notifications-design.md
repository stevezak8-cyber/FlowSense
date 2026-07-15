# SMS Notifications — Design Spec

**Date:** 2026-07-15  
**Feature:** Feature 2 of 9 — SMS Notifications  
**Status:** Approved for implementation

---

## Overview

Send automated SMS messages to customers at four key job lifecycle moments using a shared FlowSense Twilio number. Every message is prefixed with the org's business name so customers know who the text is from. Orgs control SMS via a single on/off toggle in office settings.

---

## Architecture

### SMS Service (`backend/src/services/sms.ts`)

A new singleton service following the same silent-skip pattern as `email.ts`:

- If `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, or `TWILIO_FROM_NUMBER` env vars are absent, the module logs a skip message and all send functions become no-ops. No crash, no error.
- Exports four fire-and-forget async functions — each loads the job/customer/org context it needs, applies the send guards, and calls Twilio.
- Uses `twilio` npm package.

### Message format

```
[{org.name}] {message text} Reply STOP to opt out.
```

All messages are plain text (SMS). No HTML.

### Send guards (checked in every send function, in order)

1. `org.smsEnabled === true`
2. Customer has a non-empty `phone` value
3. `customer.smsOptOut === false`
4. Twilio client is initialized (env vars present)

If any guard fails, silently skip. Log the skip reason at debug level.

---

## Data Model

### Organization model — add one field

```prisma
smsEnabled  Boolean  @default(false)
```

### Customer model — add one field

```prisma
smsOptOut   Boolean  @default(false)
```

Both fields require a Prisma migration.

---

## SMS Triggers

### 1. Booking confirmed

**When:** A new job is created (`POST /api/jobs`) and the job has a `scheduledAt` date.  
**Recipient:** The job's customer.  
**Message:**
```
[{org.name}] Your service appointment has been scheduled for {date}. Reply STOP to opt out.
```
**Existing hook:** `sendEmail` call for booking confirmation already exists in `jobs.ts` POST handler — add `sendBookingConfirmedSms(job.id)` alongside it (fire-and-forget).

### 2. Technician en route

**When:** A job status is updated to `en_route` (`PATCH /api/jobs/:id/status`).  
**Recipient:** The job's customer.  
**Message:**
```
[{org.name}] Your technician is on the way and should arrive within the hour. Reply STOP to opt out.
```
**Existing hook:** `notifyOrgStatusChange` is called in the status update handler — add `sendEnRouteSms(job.id)` alongside it, only when `newStatus === "en_route"`.

### 3. Job completed

**When:** A job is marked completed (`PATCH /api/jobs/:id/status` with `status: "completed"`).  
**Recipient:** The job's customer.  
**Message:**
```
[{org.name}] Your service is complete. Thank you for choosing us! Reply STOP to opt out.
```
**Existing hook:** `notifyOrgJobCompleted` is called in the completion handler — add `sendJobCompletedSms(job.id)`.

### 4. Estimate ready

**When:** An estimate is sent to a customer (`POST /api/estimates/:id/send`).  
**Recipient:** The job's customer.  
**Message:**
```
[{org.name}] Your estimate is ready to review: {portalUrl} Reply STOP to opt out.
```
The `portalUrl` is `${FRONTEND_URL}/customer/estimates/${estimate.token}`.  
**Existing hook:** `sendEmail` is called in the send handler in `estimates.ts` — add `sendEstimateReadySms(estimateId)` alongside it.

---

## Opt-Out Handling

### Inbound STOP handling

Twilio automatically intercepts STOP replies and blocks future sends to opted-out numbers at the network level. However, we also maintain our own `smsOptOut` flag so we don't waste API calls attempting to send to opted-out customers and so the opt-out state is visible in the system.

### Twilio status webhook

Add a new endpoint: `POST /api/webhooks/twilio`

- Receives Twilio messaging status callbacks
- Validates the request signature using `twilio.validateRequest` (using `TWILIO_WEBHOOK_SECRET` = Auth Token)
- When the error code is `21610` (message blocked — recipient opted out), sets `customer.smsOptOut = true` for the matching customer (looked up by `To` phone number and `organizationId` from metadata)
- Returns `200` with empty TwiML response (`<Response/>`) regardless of outcome

The webhook URL must be configured in the Twilio console as the status callback URL for the FlowSense number.

**Mount:** Public route (no auth), before `requireAuth` in `index.ts`, using `express.urlencoded({ extended: false })` parser (Twilio sends form-encoded bodies).

---

## Settings UI

### Office Settings — SMS card

Add an SMS Notifications card to `OfficeSettings.tsx` (after the Stripe Connect card):

- Toggle: "Enable SMS notifications" (on/off)
- When enabled: shows a note "Customers will receive texts from our shared FlowSense number. Messages include your business name."
- When disabled: greyed-out description "Enable to send automated texts to customers."
- Calls `PATCH /api/organizations/me` with `{ smsEnabled: true/false }` — this field is already handled by the existing org update route (just needs to be added to the allowed fields and Prisma select).

---

## Onboarding Checklist

Add step: `{ key: "smsEnabled", label: "Enable SMS notifications", href: "/office/settings" }`

The onboarding route (`GET /api/onboarding/status`) must include `smsEnabled` in its select block and expose it as `steps.smsEnabled`.

---

## Environment Variables

| Variable | Description |
|---|---|
| `TWILIO_ACCOUNT_SID` | Twilio account SID (from Twilio console) |
| `TWILIO_AUTH_TOKEN` | Twilio auth token (also used as webhook secret) |
| `TWILIO_FROM_NUMBER` | FlowSense's shared Twilio phone number (E.164 format, e.g. `+15551234567`) |

All three must be present for SMS to send. Any missing = silent skip.

---

## API Changes

### `PATCH /api/organizations/me`
- Add `smsEnabled` to allowed update fields
- Add `smsEnabled` to response select

### `GET /api/organizations/me`
- Add `smsEnabled` to response select

### `GET /api/onboarding/status`
- Add `smsEnabled` to org select
- Add `steps.smsEnabled: org.smsEnabled === true` to response

### `POST /api/webhooks/twilio` (new)
- Public route (no JWT auth)
- Validates Twilio signature
- Handles opt-out events

---

## Frontend Type Changes

### `ApiOrganization`
Add `smsEnabled: boolean`

### `OnboardingStatus.steps`
Add `smsEnabled: boolean`

---

## Out of Scope

- Two-way SMS / customer replies (beyond STOP)
- MMS / image messages
- SMS to technicians
- Per-event toggles (all four triggers are always on when `smsEnabled`)
- Custom message templates per org
- Delivery receipts visible in the UI
- Inbound SMS conversation threading (the existing `Conversation` model with `channel: "sms"` is separate)
