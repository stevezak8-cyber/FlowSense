# Invoice Payment Notifications — Design Spec

**Date:** 2026-08-13
**Feature:** Invoice payment completion — customer receipt email + office email + office SMS
**Status:** Approved for implementation

---

## Overview

When a customer pays a job invoice via Stripe Checkout, three things should happen automatically: (1) the customer receives a receipt email confirming their payment, (2) the office receives an email notification that payment came in, and (3) if the org has SMS enabled, the office receives a one-line SMS. On the frontend, the customer portal shows a success banner after Stripe redirects them back.

No schema changes are required. The Stripe payment link, Checkout session creation, and invoice-paid webhook handling already exist. This feature extends what happens after the invoice is marked paid.

---

## Backend

### Modified file: `backend/src/routes/webhooks.ts`

In the existing `checkout.session.completed` handler, the `invoiceId` branch currently:
1. Marks the invoice as paid via `prisma.invoice.update`

Extend it to also:
2. Fetch the invoice with customer and organization details (name, email, phone, smsEnabled, amount, description, issuedDate)
3. Call `sendInvoiceReceiptEmail` (fire-and-forget, errors logged not thrown)
4. Call `notifyOfficePaymentReceived` (fire-and-forget, errors logged not thrown)

Failures in steps 3-4 must never cause a non-200 response to Stripe — Stripe retries webhooks on failure, so a notification error would cause duplicate retries and double-marking.

### Modified file: `backend/src/services/email.ts`

Add one new exported function:

**`sendInvoiceReceiptEmail({ invoiceId, amount, description, issuedDate, customerName, customerEmail, orgName, orgPhone, orgEmail })`**

- Silent-skip if `customerEmail` is null/empty
- Subject: `"Payment received — ${orgName}"`
- Body: confirms payment of `$amount` for `description`, thanks the customer, includes org contact info (phone + email) for questions
- Follows the same HTML email pattern as `sendDepositReceiptEmail` in the same file

### Modified file: `backend/src/services/org-notifications.ts`

Add one new exported function:

**`notifyOfficePaymentReceived({ invoiceId, amount, description, customerName, orgId })`**

Internally:
1. Fetches the org's dispatch email, phone, and `smsEnabled` via the existing `getOrgDispatch` helper pattern
2. Sends an email to the org's dispatch email (silent-skip if null):
   - Subject: `"Payment received: $amount from customerName"`
   - Body: customer name, amount, invoice description, timestamp
3. If `org.smsEnabled` is true and org has a `phone`, sends an SMS via `sendSms`:
   - Message: `"[FlowSense] Payment received: $${amount} from ${customerName} (${description})"`

All sends are fire-and-forget — errors logged, never thrown.

---

## Frontend

### Modified file: `frontend/src/pages/customer/CustomerDashboard.tsx`

The Stripe success_url is already `${appUrl}/customer?payment=success&invoice=${invoice.id}`.

On mount, read `?payment=success` from `useSearchParams()`. If present:
- Show a dismissible green success banner at the top of the page: "Payment received — a receipt has been sent to your email."
- Auto-dismiss after 5 seconds
- Replace the URL (remove query params) immediately using `useNavigate` with `replace: true` so a page refresh doesn't re-show it

The banner renders above the existing dashboard content, inside the page's main wrapper.

---

## Error States

| Condition | Behaviour |
|---|---|
| Customer has no email | Receipt email silently skipped |
| Org has no dispatch email | Office email silently skipped |
| `smsEnabled` false or org has no phone | Office SMS silently skipped |
| Email/SMS send throws | Error logged, webhook still returns 200 |
| `?payment=success` param present but invoice already dismissed | Banner shown once then cleared — idempotent |

---

## Out of Scope

- PDF receipt attachment in email (invoice PDF exists separately)
- Push notification to office on payment
- Customer SMS receipt
- Payment history page
- Partial payments or payment plans
