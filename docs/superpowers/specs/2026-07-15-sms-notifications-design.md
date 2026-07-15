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
- Each message send call includes `statusCallback: process.env.API_URL + "/api/webhooks/twilio"` so Twilio posts delivery events back to us.

### Message format

```
[{org.name}] {message text} Reply STOP to opt out.
```

All messages are plain text (SMS). No HTML. `org.name` is used as-is (no escaping needed for plain SMS). Note: a very long org name (>30 chars) combined with a URL in the estimate-ready message may exceed 160 characters and produce a two-segment SMS — this is acceptable and standard practice; Twilio handles concatenation transparently.

### Send guards (checked in every send function, in order)

1. Twilio client is initialized (all three env vars present)
2. Job exists and has a customer (`job.customerId` is not null)
3. `org.smsEnabled === true`
4. Customer `phone` is present and matches E.164 format (`/^\+[1-9]\d{7,14}$/`) — if phone is present but malformed, log a warning and skip (do not throw)
5. `customer.smsOptOut === false`

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
**Date format:** Use `toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" })` — no timezone conversion (displayed as stored, same as the existing booking confirmation email).  
**Existing hook:** `sendEmail` call for booking confirmation already exists in `jobs.ts` POST handler — add `sendBookingConfirmedSms(job.id)` alongside it (fire-and-forget via `.catch(console.error)`).

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
The `portalUrl` is `${FRONTEND_URL}/customer/estimates/${estimate.token}`. This message may exceed 160 characters if org name + URL are long; it will be delivered as a two-segment SMS which is acceptable.  
**Existing hook:** `sendEmail` is called in the send handler in `estimates.ts` — add `sendEstimateReadySms(estimateId)` alongside it.

---

## Opt-Out Handling

### Inbound STOP handling

Twilio automatically intercepts STOP replies and blocks future sends to opted-out numbers at the network level. We also maintain our own `smsOptOut` flag so the send guards skip opted-out customers without making an API call.

### Inbound UNSTOP handling

When a customer texts UNSTOP, Twilio re-enables delivery at the network level and fires a status callback with `SmsStatus: "received"` and body `UNSTOP`. The webhook handler detects this and clears `customer.smsOptOut = false` so future sends resume through our guards.

### Twilio status webhook

**Endpoint:** `POST /api/webhooks/twilio`

**Validation:** Use `twilio.validateRequest(TWILIO_AUTH_TOKEN, webhookUrl, params, signature)` where:
- `TWILIO_AUTH_TOKEN` is read from `process.env.TWILIO_AUTH_TOKEN`
- `webhookUrl` is derived as `req.protocol + "://" + req.get("host") + req.originalUrl` (or `process.env.API_URL + "/api/webhooks/twilio"` if `API_URL` is set, as a more reliable alternative behind a proxy)
- `params` is `req.body` (the parsed form-encoded body)
- `signature` is `req.headers["x-twilio-signature"]`

If validation fails, return `403`. Do not process the payload.

**Opt-out event:** When `req.body.SmsStatus === "failed"` and `req.body.ErrorCode === "21610"`:
- Look up the customer by `req.body.To` (the recipient's number — customer's number on outbound delivery events)
- Set `customer.smsOptOut = true`

**UNSTOP event:** When `req.body.SmsStatus === "received"` and `req.body.Body?.trim().toUpperCase() === "UNSTOP"`:
- Look up the customer by `req.body.From` (the sender's number — customer's number on inbound messages)
- Set `customer.smsOptOut = false`

**Customer lookup for both events:** `prisma.customer.findFirst({ where: { phone: <number> } })`. If multiple customers share the same phone (edge case), update the first match. If no match, log and skip.

**Response:** Always return `200` with `<Response/>` (empty TwiML) so Twilio does not retry.

**Mount:** Public route (no auth), before `requireAuth` in `index.ts`. Uses `express.urlencoded({ extended: false })` parser (Twilio sends form-encoded bodies, not JSON).

The webhook URL (`{API_URL}/api/webhooks/twilio`) must be configured in the Twilio console under the FlowSense phone number's messaging settings as the Status Callback URL.

---

## Settings UI

### Office Settings — SMS card

Add an SMS Notifications card to `OfficeSettings.tsx` (after the Stripe Connect card):

- Toggle: "Enable SMS notifications" (on/off)
- When enabled: shows a note "Customers will receive texts from our shared FlowSense number. Messages include your business name."
- When disabled: greyed-out description "Enable to send automated texts to customers."
- Calls `PATCH /api/organizations/me` with `{ smsEnabled: true/false }` — this field needs to be added to the allowed update fields and Prisma select in the org route.

---

## Onboarding Checklist

Add step: `{ key: "smsEnabled", label: "Enable SMS notifications", href: "/office/settings" }`

The onboarding route (`GET /api/onboarding/status`) must include `smsEnabled` in its select block and expose it as `steps.smsEnabled`.

---

## Environment Variables

| Variable | Description |
|---|---|
| `TWILIO_ACCOUNT_SID` | Twilio account SID (from Twilio console) |
| `TWILIO_AUTH_TOKEN` | Twilio auth token — also used directly as the webhook signature secret |
| `TWILIO_FROM_NUMBER` | FlowSense's shared Twilio phone number (E.164 format, e.g. `+15551234567`) |
| `API_URL` | Base URL of the backend API (e.g. `https://api.flowsense.app`) — used for webhook URL derivation |

All three Twilio vars must be present for SMS to send. Any missing = silent skip. `API_URL` is already used by the Stripe Connect callback — no new var needed.

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
- Validates Twilio signature with `TWILIO_AUTH_TOKEN`
- Handles opt-out (error `21610`) and UNSTOP events

---

## Frontend Type Changes

### `ApiOrganization`
Add `smsEnabled: boolean`

### `OnboardingStatus.steps`
Add `smsEnabled: boolean`

---

## Out of Scope

- Two-way SMS / customer replies (beyond STOP/UNSTOP)
- MMS / image messages
- SMS to technicians
- Per-event toggles (all four triggers are always on when `smsEnabled`)
- Custom message templates per org
- Delivery receipts visible in the UI
- Inbound SMS conversation threading (the existing `Conversation` model with `channel: "sms"` is separate)
- URL shortening for the estimate-ready message
