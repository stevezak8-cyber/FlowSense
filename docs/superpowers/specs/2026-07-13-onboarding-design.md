# FlowSense Onboarding Flow — Design Spec

**Date:** 2026-07-13
**Status:** Approved

---

## Overview

New organizations land on an empty dashboard after registration. The onboarding flow guides them from an empty app to their first dispatched job — the activation moment where FlowSense becomes real to them. It uses a persistent sidebar checklist + smart empty states, with no blocking wizards or modals.

---

## Activation Goal

The target moment: **first job created and assigned to a technician.** Everything in the onboarding flow funnels toward this. All 4 steps exist to make that moment possible.

---

## Checklist Steps

| # | Step | Completion condition |
|---|------|---------------------|
| 1 | Set up your company | Org has `phone` AND `address` set |
| 2 | Add your first technician | Org has ≥ 1 technician |
| 3 | Add your first customer | Org has ≥ 1 customer |
| 4 | Create your first job | Org has ≥ 1 job |

Step completion is **derived from real data** — no extra tracking fields for individual steps. The API returns live counts/presence so the checklist is always accurate.

---

## Progress Tracking

Add one field to the `Organization` model:

```prisma
onboardingDismissed Boolean @default(false)
```

- Derived step completion from live data (technician/customer/job counts).
- `onboardingDismissed` is set to `true` when the user explicitly dismisses the checklist OR when all 4 steps complete and the user has seen the completion state.
- Once `onboardingDismissed: true`, the checklist never reappears — even if records are later deleted.

---

## Data Flow

### New API endpoint: `GET /api/onboarding/status`

Authenticated (office role). Returns:

```json
{
  "dismissed": false,
  "steps": {
    "companyProfile": true,
    "technician": false,
    "customer": false,
    "job": false
  }
}
```

Implementation: single DB query selecting `phone`, `address`, `onboardingDismissed`, plus counts of technicians, customers, and jobs for the org.

### New API endpoint: `POST /api/onboarding/dismiss`

Authenticated (office role). Sets `onboardingDismissed: true` on the org. Returns `{ ok: true }`.

---

## UI: Sidebar Checklist

**Location:** Bottom of the office sidebar (`app-sidebar.tsx`), above the Billing/Settings nav items.

**Appearance:**

```
Getting Started  2/4
━━━━░░░░░░░░  (progress bar)

✅ Set up your company
✅ Add your first technician
○  Add your first customer        →
○  Create your first job          →

                           [Dismiss]
```

- Collapsible (chevron toggle) — collapsed state persists in `localStorage`.
- Each incomplete step row is clickable:
  - "Set up your company" → navigate to `/office/settings`
  - "Add your first technician" → navigate to `/office/technicians` and open the Add Technician dialog
  - "Add your first customer" → navigate to `/office/customers` and open the Add Customer dialog
  - "Create your first job" → navigate to `/office/jobs` and open the Create Job dialog
- Completed steps show a green checkmark and are not clickable.
- **Completion state:** when all 4 steps are checked, show "You're all set! FlowSense is ready." for 2 seconds, then call `POST /api/onboarding/dismiss` and hide the card.
- **Dismiss button:** visible at all times. Calls `POST /api/onboarding/dismiss` immediately.

The checklist is hidden entirely when `dismissed: true`.

---

## UI: Empty States

Replace blank tables with contextual empty states on first load.

### Technicians page (`OfficeTechnicians.tsx`)

When technician list is empty:
```
[wrench icon]
No technicians yet
Add your first technician to start dispatching jobs.
[Add Technician button]
```

### Customers page (`OfficeCustomers.tsx`)

When customer list is empty:
```
[users icon]
No customers yet
Add your first customer to create jobs.
[Add Customer button]
```

### Jobs page (`OfficeJobs.tsx`)

When job list is empty:
```
[clipboard icon]
No jobs yet
Create your first job to see it here.
[Create Job button]
```

Each empty state button triggers the same Add/Create dialog already used in that page — no new dialogs needed.

---

## UI: Welcome Toast

When the user lands on `/office?checkout=success` (redirect from Stripe Checkout), show a single `sonner` toast:

> "Welcome to FlowSense. Let's get your team set up."

No modal, no redirect interruption. Implemented in `OfficeLayout.tsx` by reading the `checkout` query param on mount.

---

## Frontend Component Structure

```
frontend/src/
  components/
    office/
      onboarding-checklist.tsx   ← new: the sidebar checklist card
  pages/
    office/
      OfficeTechnicians.tsx      ← modify: add empty state
      OfficeCustomers.tsx        ← modify: add empty state
      OfficeJobs.tsx             ← modify: add empty state
      OfficeLayout.tsx           ← modify: welcome toast on ?checkout=success
  api/
    types.ts                     ← modify: add OnboardingStatus type
```

`app-sidebar.tsx` — modify: render `<OnboardingChecklist />` when `dismissed: false`.

The checklist fetches from `GET /api/onboarding/status` on mount and re-fetches whenever the user completes an action (technician added, customer added, job created) — achieved by accepting a `refreshKey` prop that increments on relevant mutations, similar to the pattern used in `ScheduleCalendar`.

---

## Backend Structure

```
backend/src/
  routes/
    onboarding.ts               ← new: GET /status, POST /dismiss
  prisma/
    schema.prisma               ← modify: add onboardingDismissed to Organization
    migrations/                 ← new migration
```

Route mounted in `index.ts` at `/api/onboarding` with `authenticate` middleware.

---

## Environment Variables

None required — no new external services.

---

## Out of Scope

- Email drip sequences triggered by onboarding progress
- In-app product tours / tooltips (Shepherd.js / Intro.js style)
- Video walkthroughs
- Role-specific onboarding for technicians or customers
- Onboarding analytics / funnel tracking
