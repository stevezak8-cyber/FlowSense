# FlowSense Stripe Billing — Design Spec

**Date:** 2026-07-13
**Status:** Approved

---

## Overview

Add Stripe-powered subscription billing to FlowSense. The Entry plan ($297/mo) is self-serve with a 30-day free trial. Core ($497/mo) and Premium ($697/mo) are sales-led and upgraded manually by the admin. All subscribers can manage their billing via the Stripe Customer Portal.

---

## Pricing

| Plan | Price | Acquisition |
|------|-------|-------------|
| Entry | $297/mo | Public signup + Stripe Checkout |
| Core | $497/mo | Sales-led — admin upgrades after call |
| Premium | $697/mo | Sales-led — admin upgrades after call |

Trial: 30 days free, card required upfront. Billing starts on day 31.

Feature gates are **not implemented in this spec** — all plans get full access today. The `plan` field is the foundation for gates when tiers are ready.

---

## Data Model

Add four fields to the `Organization` model in `prisma/schema.prisma`:

```prisma
stripeCustomerId      String?
stripeSubscriptionId  String?
plan                  String    @default("trial")
trialEndsAt           DateTime?
```

### Plan values

| Value | Meaning |
|-------|---------|
| `trial` | Active trial, card on file, not yet charged |
| `entry` | Paying Entry subscriber |
| `core` | Paying Core subscriber (admin-upgraded) |
| `premium` | Paying Premium subscriber (admin-upgraded) |
| `cancelled` | Subscription cancelled or payment failed permanently |

---

## Signup & Checkout Flow

1. User submits registration form (company name, email, password)
2. Backend creates `Organization` + `User` (role: `office`) atomically
3. Backend creates a Stripe Customer object and stores `stripeCustomerId` on the org
4. Backend creates a Stripe Checkout Session:
   - `mode: "subscription"`
   - price ID: Entry plan (`STRIPE_PRICE_ID_ENTRY` env var)
   - `trial_period_days: 30`
   - `payment_method_collection: "always"`
   - `success_url`: `/office?checkout=success`
   - `cancel_url`: `/register`
   - `metadata.organizationId`: org ID (used by webhook)
5. Frontend redirects to Stripe-hosted checkout
6. On success, Stripe fires `customer.subscription.created` → webhook sets `plan: "trial"`, `trialEndsAt: now + 30 days`
7. On day 30, Stripe charges card automatically and fires `invoice.payment_succeeded` → webhook sets `plan: "entry"`

### Failed payment handling

Stripe retries failed charges automatically (smart retry logic, ~4 attempts over 1 week). On final failure, `customer.subscription.deleted` fires → webhook sets `plan: "cancelled"`, account is locked.

---

## Webhook Events

Extend the existing `POST /webhooks/stripe` handler to process:

| Event | Action |
|-------|--------|
| `customer.subscription.created` | Set `plan: "trial"`, `trialEndsAt`, `stripeSubscriptionId` |
| `customer.subscription.updated` | Compare `subscription.items.data[0].price.id` against `STRIPE_PRICE_ID_ENTRY/CORE/PREMIUM` env vars; update `plan` to matching tier |
| `invoice.payment_succeeded` | If subscription invoice, set `plan` to active tier |
| `invoice.payment_failed` | Log warning (Stripe handles retries) |
| `customer.subscription.deleted` | Set `plan: "cancelled"` |

The existing `checkout.session.completed` handler (for customer job invoices) is unchanged.

**Webhook security:** signature verification via `STRIPE_WEBHOOK_SECRET` already implemented. No changes needed.

---

## New API Routes

### `POST /api/auth/register`
Public. Creates org + user + Stripe customer, returns Stripe Checkout Session URL.

**Request:**
```json
{ "companyName": "string", "email": "string", "password": "string", "name": "string" }
```

**Response:**
```json
{ "checkoutUrl": "https://checkout.stripe.com/..." }
```

### `POST /api/billing/portal`
Authenticated (office role). Generates a Stripe Customer Portal session for the current org.

**Response:**
```json
{ "url": "https://billing.stripe.com/..." }
```

Return URL: `/office/settings`

### `POST /api/admin/billing/upgrade`
Authenticated, `requireAdmin` middleware. Updates a subscription to a new plan.

**Request:**
```json
{ "organizationId": "string", "plan": "entry" | "core" | "premium" }
```

Maps `plan` → Stripe price ID via env vars, calls `stripe.subscriptions.update`.

---

## Middleware

### `requireSubscription`

Applied to all `/api/*` routes except `/api/auth/*`, `/webhooks/*`, `/api/billing/portal`, and `/api/admin/billing/upgrade` (admin must be able to reactivate a cancelled org).

Checks `organization.plan !== "cancelled"`. If cancelled, returns:
```json
{ "error": "subscription_cancelled", "message": "Your subscription has ended." }
```
HTTP 402.

### `requireAdmin`

Applied to `/api/admin/*`. Checks `user.role === "admin"`. Returns 403 if not.

---

## Frontend Changes

### Org/plan data for the frontend

Extend the existing `GET /api/auth/me` response to include `organization: { plan, trialEndsAt }`. The frontend reads this on login and stores it in auth context — used by the trial banner and cancelled-account screen.

### Registration page (`/register`)

New public page with a form: company name, your name, email, password. On submit, calls `POST /api/auth/register` and redirects to the Stripe Checkout URL returned.

### Billing link in office sidebar

A "Billing" nav item in the office sidebar. Clicking it calls `POST /api/billing/portal` and redirects to the returned Stripe Portal URL in the same tab.

### Subscription cancelled screen

When any API call returns `402` with `error: "subscription_cancelled"`, the frontend shows a full-screen message: "Your subscription has ended. Reactivate via the billing portal." with a button that opens the portal.

### Trial banner

When `organization.plan === "trial"`, show a dismissible banner in the office header: "Your 30-day free trial ends on [date]. You won't be charged until then."

---

## Environment Variables

```env
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID_ENTRY=price_...
STRIPE_PRICE_ID_CORE=price_...
STRIPE_PRICE_ID_PREMIUM=price_...
```

---

## Error Handling

- Stripe API errors during checkout session creation → rollback in reverse order: delete Stripe Customer if created, rollback DB transaction, return 503. Sequence is: (1) create Stripe Customer, (2) create DB org+user in transaction, (3) create Checkout Session — if step 3 fails, delete Stripe Customer and rollback DB.
- Webhook handler always returns 200 to Stripe to prevent retries, except on DB write failures (return 500 so Stripe retries)
- Portal session errors → return 503 with message "Billing portal temporarily unavailable"
- Webhook idempotency: before writing plan updates, check current org plan — skip the write if already in the target state to handle Stripe's at-least-once delivery

---

## Out of Scope

- Feature gating by plan (fields are in place, enforcement comes later)
- Annual billing / discounts
- Promo codes
- Invoice PDF generation for FlowSense subscriptions
- Multi-seat add-ons
