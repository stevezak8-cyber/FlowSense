# PDF Invoice — Design Spec

**Date:** 2026-08-13
**Feature:** Feature 9 of 11 — PDF Invoice
**Status:** Approved for implementation

---

## Overview

Allow office staff to generate a PDF invoice for any invoice record and optionally email it to the customer in one click. The PDF is generated on the backend using pdfkit, streamed to the browser for download, and sent as an email attachment via Resend. No schema changes are required.

---

## Data & API

### No schema changes

Invoice, Customer, Job, and Organization models already contain all fields required for a professional invoice. The invoice PDF is generated on-demand and never persisted.

### New packages

```bash
cd backend && npm install pdfkit && npm install -D @types/pdfkit
```

### New endpoints

#### `GET /api/invoices/:id/pdf`

Returns the PDF as a binary stream.

**Auth:** `requireAuth + requireSubscription` (office and technician roles). Org-scoped: 404 if invoice belongs to another org.

**Response 200:**
```
Content-Type: application/pdf
Content-Disposition: attachment; filename="invoice-<last8>.pdf"
<binary PDF>
```

**Error responses:**
- `404` — invoice not found or belongs to a different org

#### `POST /api/invoices/:id/send`

Generates the PDF and emails it to the customer.

**Auth:** `requireAuth + requireSubscription` (office role only).

**Response 200:**
```json
{ "sent": true }
```

**Error responses:**
- `404` — invoice not found or belongs to a different org
- `400` — `{ "error": "Customer has no email address" }`
- `500` — PDF generation failed or email send failed

---

## Backend

### New file: `backend/src/services/invoice-pdf.ts`

Single exported function:

#### `generateInvoicePdf(invoice: InvoiceWithRelations): Promise<Buffer>`

```typescript
interface InvoiceWithRelations {
  id: string
  description: string
  amount: number
  status: string
  issuedDate: Date
  dueDate: Date
  organization: { name: string }
  customer: { name: string; address: string; city: string; state: string; postalCode: string }
  job: { equipmentType: string | null; symptomSummary: string | null }
}
```

Creates a pdfkit `PDFDocument` with `bufferPages: true`. Collects data chunks via `on("data")` listener, resolves the promise on `end` event with `Buffer.concat(chunks)`.

**PDF layout:**

| Section | Content |
|---|---|
| Header | Organization name (large, bold) + "INVOICE" label (right-aligned) |
| Subheader | Invoice number (last 8 chars of id), status badge, issued date, due date |
| Bill To | Customer name, address (street, city, state, postal) |
| Job Details | Equipment type (formatted), symptom/complaint (if present) |
| Description | Full invoice description text |
| Amount | "Total Due: $X,XXX.XX" (right-aligned, bold, large) |
| Footer | "Thank you for your business. — FlowSense" |

Spacing: 40pt left/right margins, 50pt top margin. Section spacing via `moveDown()`. No external fonts — uses pdfkit's built-in Helvetica.

Errors thrown if pdfkit itself throws; caller handles.

### Modified file: `backend/src/routes/invoices.ts`

Add two new routes **before** the existing `PATCH /:id` and `DELETE /:id` routes to avoid shadowing:

**`GET /:id/pdf`**

```typescript
invoicesRouter.get("/:id/pdf", async (req, res) => {
  const invoice = await prisma.invoice.findFirst({
    where: { id: req.params.id, organizationId: req.user!.organizationId },
    include: {
      organization: { select: { name: true } },
      customer: { select: { name: true, address: true, city: true, state: true, postalCode: true } },
      job: { select: { equipmentType: true, symptomSummary: true } },
    },
  })
  if (!invoice) return res.status(404).json({ error: "Invoice not found" })

  const buffer = await generateInvoicePdf(invoice)
  const filename = `invoice-${invoice.id.slice(-8)}.pdf`
  res.setHeader("Content-Type", "application/pdf")
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`)
  res.send(buffer)
})
```

**`POST /:id/send`**

```typescript
invoicesRouter.post("/:id/send", async (req, res) => {
  // Fetch invoice with same includes as above + customer.email
  // 404 if not found
  // 400 if !invoice.customer.email
  // generateInvoicePdf → sendEmail with attachment
  // 200 { sent: true }
})
```

Resend supports PDF attachments via `attachments: [{ filename, content: buffer.toString("base64") }]` — extend the existing `sendEmail` helper with optional `attachments` parameter.

**`POST /:id/send` role guard:** add an inline role check at the top of the handler:
```typescript
if (req.user!.role !== "office") return res.status(403).json({ error: "Forbidden" })
```
The `requireAuth + requireSubscription` middleware at the mount point does not enforce role; this inline guard is required.

**`GET /:id/pdf` and `POST /:id/send` try/catch:** both route handlers must wrap their body in `try/catch`, returning `res.status(500).json({ error: ... })` on any thrown error — consistent with all other routes in `invoices.ts`.

### Modified file: `backend/src/services/email.ts`

Add optional `attachments` field to `SendEmailOptions`:

```typescript
interface Attachment {
  filename: string
  content: string // base64
}

interface SendEmailOptions {
  to: string
  subject: string
  html: string
  attachments?: Attachment[]
}
```

Pass `attachments` through to `resend.emails.send` when present.

**Error propagation for attachment sends:** The existing `sendEmail` catches all errors internally (fire-and-forget pattern). When `attachments` are provided, errors must propagate so callers can return a 500. Implement as:

```typescript
export async function sendEmail(options: SendEmailOptions): Promise<void> {
  if (!resend) {
    console.log(`[Email] Skipped (no RESEND_API_KEY): ${options.subject} → ${options.to}`)
    return
  }
  await resend.emails.send({ from: FROM_EMAIL, to: options.to, subject: options.subject, html: options.html, attachments: options.attachments })
  console.log(`[Email] Sent: ${options.subject} → ${options.to}`)
}
```

This removes the internal try/catch — callers that need fire-and-forget must `.catch(console.error)` themselves. The `POST /:id/send` route does NOT catch — it lets the error propagate to the try/catch wrapper that returns 500.

### New file: `backend/src/__tests__/invoice-pdf.test.ts`

Tests:
1. `generateInvoicePdf` — returns a Buffer (length > 0)
2. `generateInvoicePdf` — output is a valid PDF (starts with `%PDF`)
3. `generateInvoicePdf` — works when equipmentType and symptomSummary are null
4. `GET /api/invoices/:id/pdf` — returns 404 for unknown invoice id
5. `GET /api/invoices/:id/pdf` — returns 200 with content-type application/pdf
6. `POST /api/invoices/:id/send` — returns 403 for non-office role
7. `POST /api/invoices/:id/send` — returns 404 for unknown invoice id
8. `POST /api/invoices/:id/send` — returns 400 when customer has no email
9. `POST /api/invoices/:id/send` — returns 200 and calls sendEmail on success

---

## Frontend

### Modified file: `frontend/src/pages/office/OfficeRevenue.tsx`

For each invoice row in the table, add two icon buttons after the existing status badge:

| Button | Icon | Action |
|---|---|---|
| Download PDF | `FileDown` (lucide) | `GET /api/invoices/:id/pdf` → blob download |
| Send to Customer | `Send` (lucide) | `POST /api/invoices/:id/send` → toast feedback |

**Download PDF implementation:**

```typescript
async function handleDownloadPdf(invoiceId: string) {
  const res = await fetch(`/api/invoices/${invoiceId}/pdf`, {
    headers: { Authorization: `Bearer ${localStorage.getItem("flowsense_token")}` },
  })
  if (!res.ok) { toast.error("Failed to generate PDF"); return }
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `invoice-${invoiceId.slice(-8)}.pdf`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 100) // revoke after browser has initiated download
}
```

**Send to Customer implementation:**

```typescript
async function handleSendInvoice(invoiceId: string) {
  try {
    await api.post(`/api/invoices/${invoiceId}/send`, {})
    toast.success("Invoice sent to customer")
  } catch (e) {
    const msg = (e as { message?: string }).message ?? ""
    toast.error(msg.includes("no email") ? "Customer has no email address" : "Failed to send invoice")
  }
}
```

Loading state: use per-row `sendingId` and `downloadingId` state strings (null when idle). Disable both buttons while either action is in progress for that row.

---

## Error States

| Condition | Behaviour |
|---|---|
| Invoice not found / wrong org | 404 → toast.error in frontend |
| Customer has no email | 400 → toast.error "Customer has no email address" |
| PDF generation fails | 500 → toast.error "Failed to generate PDF" |
| Email send fails | 500 → toast.error "Failed to send invoice" |
| Download while generating | Button disabled, spinner shown |
| Send while sending | Button disabled, spinner shown |

---

## Out of Scope

- Auto-sending invoice on creation
- Invoice PDF templates (custom branding, logos)
- Customer-facing PDF download from the customer portal
- PDF storage / archiving in S3 or similar
- Stripe invoice PDF integration
- Pagination of attachments for multi-line invoices
