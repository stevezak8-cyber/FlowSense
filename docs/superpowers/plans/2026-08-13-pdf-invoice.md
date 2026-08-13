# PDF Invoice Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `GET /api/invoices/:id/pdf` (download) and `POST /api/invoices/:id/send` (email to customer) endpoints plus frontend Download/Send buttons in OfficeRevenue.

**Architecture:** pdfkit generates a Buffer in a service function; two new route handlers stream or attach it. The existing `sendEmail` helper is extended with optional `attachments` and re-thrown errors. No schema changes.

**Tech Stack:** pdfkit, @types/pdfkit, Resend (existing), Express, React, lucide-react

---

## Chunk 1: Backend — PDF service + email extension + routes + tests

### Task 1: Install pdfkit

**Files:**
- Modify: `backend/package.json` (via npm install)

- [ ] **Step 1: Install packages**

```bash
cd /Users/stevenzakaria/flowsense/backend && npm install pdfkit && npm install -D @types/pdfkit
```

Expected: `added N packages` with no errors

- [ ] **Step 2: Verify TypeScript sees the types**

```bash
cd /Users/stevenzakaria/flowsense/backend && npx tsc --noEmit 2>&1 | grep pdfkit || echo "OK — no pdfkit errors"
```

Expected: `OK — no pdfkit errors`

- [ ] **Step 3: Commit**

```bash
cd /Users/stevenzakaria/flowsense/backend && git add package.json package-lock.json && git commit -m "chore: install pdfkit for PDF invoice generation"
```

---

### Task 2: PDF service + email extension

**Files:**
- Create: `backend/src/services/invoice-pdf.ts`
- Modify: `backend/src/services/email.ts`

- [ ] **Step 1: Write failing test for generateInvoicePdf**

Create `backend/src/__tests__/invoice-pdf.test.ts`:

```typescript
import { describe, it, expect } from "vitest"
import { generateInvoicePdf } from "../services/invoice-pdf.js"

const mockInvoice = {
  id: "cltest00000000001",
  description: "AC repair — replaced compressor",
  amount: 850.00,
  status: "paid",
  issuedDate: new Date("2026-08-01"),
  dueDate: new Date("2026-08-15"),
  organization: { name: "Cool Air HVAC" },
  customer: { name: "John Smith", address: "123 Main St", city: "Austin", state: "TX", postalCode: "78701" },
  job: { equipmentType: "central-ac", symptomSummary: "Unit not cooling" },
}

describe("generateInvoicePdf", () => {
  it("returns a non-empty Buffer", async () => {
    const buf = await generateInvoicePdf(mockInvoice)
    expect(buf).toBeInstanceOf(Buffer)
    expect(buf.length).toBeGreaterThan(0)
  })

  it("output starts with %PDF magic bytes", async () => {
    const buf = await generateInvoicePdf(mockInvoice)
    expect(buf.slice(0, 4).toString()).toBe("%PDF")
  })

  it("handles null equipmentType and symptomSummary", async () => {
    const inv = { ...mockInvoice, job: { equipmentType: null, symptomSummary: null } }
    const buf = await generateInvoicePdf(inv)
    expect(buf).toBeInstanceOf(Buffer)
    expect(buf.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/stevenzakaria/flowsense/backend && npx vitest run src/__tests__/invoice-pdf.test.ts 2>&1 | tail -10
```

Expected: FAIL — `Cannot find module '../services/invoice-pdf.js'`

- [ ] **Step 3: Create invoice-pdf.ts service**

Create `backend/src/services/invoice-pdf.ts`:

```typescript
import PDFDocument from "pdfkit"

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

export async function generateInvoicePdf(invoice: InvoiceWithRelations): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ bufferPages: true, margin: 40 })
    const chunks: Buffer[] = []

    doc.on("data", (chunk: Buffer) => chunks.push(chunk))
    doc.on("end", () => resolve(Buffer.concat(chunks)))
    doc.on("error", reject)

    const invoiceNumber = invoice.id.slice(-8).toUpperCase()
    const fmt = (d: Date) => new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
    const fmtAmount = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n)

    // Header
    doc.fontSize(22).font("Helvetica-Bold").text(invoice.organization.name, { continued: false })
    doc.moveDown(0.3)
    doc.fontSize(28).font("Helvetica-Bold").fillColor("#1a1a1a").text("INVOICE", { align: "right" })
    doc.moveDown(0.5)

    // Invoice meta
    doc.fontSize(11).font("Helvetica").fillColor("#333333")
    doc.text(`Invoice #: ${invoiceNumber}`)
    doc.text(`Status: ${invoice.status.toUpperCase()}`)
    doc.text(`Issued: ${fmt(invoice.issuedDate)}`)
    doc.text(`Due: ${fmt(invoice.dueDate)}`)
    doc.moveDown(1)

    // Bill To
    doc.fontSize(11).font("Helvetica-Bold").text("BILL TO")
    doc.font("Helvetica")
    doc.text(invoice.customer.name)
    doc.text(invoice.customer.address)
    doc.text(`${invoice.customer.city}, ${invoice.customer.state} ${invoice.customer.postalCode}`)
    doc.moveDown(1)

    // Job details
    if (invoice.job.equipmentType || invoice.job.symptomSummary) {
      doc.font("Helvetica-Bold").text("JOB DETAILS")
      doc.font("Helvetica")
      if (invoice.job.equipmentType) {
        const formatted = invoice.job.equipmentType.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())
        doc.text(`Equipment: ${formatted}`)
      }
      if (invoice.job.symptomSummary) {
        doc.text(`Complaint: ${invoice.job.symptomSummary}`)
      }
      doc.moveDown(1)
    }

    // Description
    doc.font("Helvetica-Bold").text("DESCRIPTION")
    doc.font("Helvetica").text(invoice.description)
    doc.moveDown(1.5)

    // Amount
    doc.fontSize(14).font("Helvetica-Bold").text(`Total Due: ${fmtAmount(invoice.amount)}`, { align: "right" })
    doc.moveDown(2)

    // Footer
    doc.fontSize(10).font("Helvetica").fillColor("#888888").text("Thank you for your business. — FlowSense", { align: "center" })

    doc.end()
  })
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/stevenzakaria/flowsense/backend && npx vitest run src/__tests__/invoice-pdf.test.ts 2>&1 | tail -10
```

Expected: 3 passed

- [ ] **Step 5: Extend sendEmail to support attachments and propagate errors**

Modify `backend/src/services/email.ts`:

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

export async function sendEmail(options: SendEmailOptions): Promise<void> {
  if (!resend) {
    console.log(`[Email] Skipped (no RESEND_API_KEY): ${options.subject} → ${options.to}`)
    return
  }
  await resend.emails.send({
    from: FROM_EMAIL,
    to: options.to,
    subject: options.subject,
    html: options.html,
    ...(options.attachments ? { attachments: options.attachments } : {}),
  })
  console.log(`[Email] Sent: ${options.subject} → ${options.to}`)
}
```

**IMPORTANT:** Remove the internal try/catch from `sendEmail`. All existing callers that relied on fire-and-forget behavior must add `.catch(console.error)` at their call site. Check for all callers first:

```bash
grep -rn "sendEmail(" /Users/stevenzakaria/flowsense/backend/src --include="*.ts" | grep -v "test\|email.ts"
```

For each caller that doesn't already handle errors, add `.catch(console.error)` if it's a fire-and-forget call, or leave the await as-is if errors should propagate.

- [ ] **Step 6: TypeScript check**

```bash
cd /Users/stevenzakaria/flowsense/backend && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors

- [ ] **Step 7: Commit**

```bash
cd /Users/stevenzakaria/flowsense/backend && git add src/services/invoice-pdf.ts src/services/email.ts src/__tests__/invoice-pdf.test.ts && git commit -m "feat: add generateInvoicePdf service and extend sendEmail with attachments"
```

---

### Task 3: Invoice routes — GET /:id/pdf and POST /:id/send

**Files:**
- Modify: `backend/src/routes/invoices.ts`
- Modify: `backend/src/__tests__/invoice-pdf.test.ts` (add route tests)

- [ ] **Step 1: Write failing route tests**

Add to `backend/src/__tests__/invoice-pdf.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest"

// Route tests — must be in the same file (no vi.mock hoisting conflict since this is a new file)
vi.mock("../lib/prisma.js", () => ({
  prisma: {
    invoice: {
      findFirst: vi.fn(),
    },
  },
}))

vi.mock("../services/invoice-pdf.js", () => ({
  generateInvoicePdf: vi.fn().mockResolvedValue(Buffer.from("%PDF-1.4 fake content")),
}))

vi.mock("../services/email.js", () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("../middleware/auth.js", () => ({
  requireAuth: (_req: unknown, _res: unknown, next: () => void) => { 
    (_req as { user: unknown }).user = { organizationId: "org1", role: "office" }
    next()
  },
}))

vi.mock("../middleware/require-subscription.js", () => ({
  requireSubscription: (_req: unknown, _res: unknown, next: () => void) => next(),
}))

import request from "supertest"
import express from "express"
import { invoicesRouter } from "../routes/invoices.js"
import { prisma } from "../lib/prisma.js"
import { sendEmail } from "../services/email.js"

const app = express()
app.use(express.json())
// Inject user for all requests
app.use((req, _res, next) => {
  (req as { user: unknown }).user = { organizationId: "org1", role: "office" }
  next()
})
app.use("/api/invoices", invoicesRouter)

const mockInvoice = {
  id: "cltest00000000001",
  description: "AC repair",
  amount: 850,
  status: "paid",
  issuedDate: new Date("2026-08-01"),
  dueDate: new Date("2026-08-15"),
  organization: { name: "Cool Air HVAC" },
  customer: { name: "John Smith", address: "123 Main St", city: "Austin", state: "TX", postalCode: "78701", email: "john@example.com" },
  job: { equipmentType: "central-ac", symptomSummary: "Unit not cooling" },
}

describe("GET /api/invoices/:id/pdf", () => {
  beforeEach(() => vi.clearAllMocks())

  it("returns 404 when invoice not found", async () => {
    vi.mocked(prisma.invoice.findFirst).mockResolvedValue(null)
    const res = await request(app).get("/api/invoices/notexist/pdf")
    expect(res.status).toBe(404)
  })

  it("returns 200 with content-type application/pdf", async () => {
    vi.mocked(prisma.invoice.findFirst).mockResolvedValue(mockInvoice as unknown as never)
    const res = await request(app).get("/api/invoices/cltest00000000001/pdf")
    expect(res.status).toBe(200)
    expect(res.headers["content-type"]).toMatch(/application\/pdf/)
  })
})

describe("POST /api/invoices/:id/send", () => {
  beforeEach(() => vi.clearAllMocks())

  it("returns 403 for non-office role", async () => {
    const techApp = express()
    techApp.use(express.json())
    techApp.use((req, _res, next) => {
      (req as { user: unknown }).user = { organizationId: "org1", role: "technician" }
      next()
    })
    techApp.use("/api/invoices", invoicesRouter)
    const res = await request(techApp).post("/api/invoices/cltest00000000001/send")
    expect(res.status).toBe(403)
  })

  it("returns 404 when invoice not found", async () => {
    vi.mocked(prisma.invoice.findFirst).mockResolvedValue(null)
    const res = await request(app).post("/api/invoices/notexist/send")
    expect(res.status).toBe(404)
  })

  it("returns 400 when customer has no email", async () => {
    const noEmail = { ...mockInvoice, customer: { ...mockInvoice.customer, email: null } }
    vi.mocked(prisma.invoice.findFirst).mockResolvedValue(noEmail as unknown as never)
    const res = await request(app).post("/api/invoices/cltest00000000001/send")
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/no email/i)
  })

  it("returns 200 and calls sendEmail on success", async () => {
    vi.mocked(prisma.invoice.findFirst).mockResolvedValue(mockInvoice as unknown as never)
    const res = await request(app).post("/api/invoices/cltest00000000001/send")
    expect(res.status).toBe(200)
    expect(res.body.sent).toBe(true)
    expect(sendEmail).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/stevenzakaria/flowsense/backend && npx vitest run src/__tests__/invoice-pdf.test.ts 2>&1 | tail -15
```

Expected: route tests fail (routes not yet added)

- [ ] **Step 3: Add routes to invoices.ts**

In `backend/src/routes/invoices.ts`, add these two imports at the top:

```typescript
import { generateInvoicePdf } from "../services/invoice-pdf.js"
import { sendEmail } from "../services/email.js"
```

Then add the two new routes **before** the existing `PATCH /:id` route. Check where PATCH is and insert before it:

```typescript
// GET /:id/pdf — download PDF
invoicesRouter.get("/:id/pdf", async (req, res) => {
  try {
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
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Failed to generate PDF" })
  }
})

// POST /:id/send — email PDF to customer
invoicesRouter.post("/:id/send", async (req, res) => {
  if (req.user!.role !== "office") return res.status(403).json({ error: "Forbidden" })
  try {
    const invoice = await prisma.invoice.findFirst({
      where: { id: req.params.id, organizationId: req.user!.organizationId },
      include: {
        organization: { select: { name: true } },
        customer: { select: { name: true, address: true, city: true, state: true, postalCode: true, email: true } },
        job: { select: { equipmentType: true, symptomSummary: true } },
      },
    })
    if (!invoice) return res.status(404).json({ error: "Invoice not found" })
    if (!invoice.customer.email) return res.status(400).json({ error: "Customer has no email address" })

    const buffer = await generateInvoicePdf(invoice)
    const filename = `invoice-${invoice.id.slice(-8)}.pdf`

    await sendEmail({
      to: invoice.customer.email,
      subject: `Invoice from ${invoice.organization.name}`,
      html: `<p>Hi ${invoice.customer.name},</p><p>Please find your invoice attached. Thank you for your business.</p><p>— ${invoice.organization.name}</p>`,
      attachments: [{ filename, content: buffer.toString("base64") }],
    })

    res.json({ sent: true })
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Failed to send invoice" })
  }
})
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/stevenzakaria/flowsense/backend && npx vitest run src/__tests__/invoice-pdf.test.ts 2>&1 | tail -15
```

Expected: 9 passed (3 service + 6 route tests)

- [ ] **Step 5: Run full test suite**

```bash
cd /Users/stevenzakaria/flowsense/backend && npx vitest run 2>&1 | tail -15
```

Expected: all tests pass

- [ ] **Step 6: TypeScript check**

```bash
cd /Users/stevenzakaria/flowsense/backend && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors

- [ ] **Step 7: Commit**

```bash
cd /Users/stevenzakaria/flowsense/backend && git add src/routes/invoices.ts src/__tests__/invoice-pdf.test.ts && git commit -m "feat: add GET /:id/pdf and POST /:id/send invoice routes"
```

---

## Chunk 2: Frontend — Download + Send buttons in OfficeRevenue

### Task 4: Add Download PDF and Send buttons to invoice table

**Files:**
- Modify: `frontend/src/pages/office/OfficeRevenue.tsx`

- [ ] **Step 1: Locate the invoice table rows in OfficeRevenue.tsx**

Read the file to find where invoice rows are rendered:

```bash
grep -n "invoice\|\.map\|<tr\|<td\|className.*row" /Users/stevenzakaria/flowsense/frontend/src/pages/office/OfficeRevenue.tsx | head -30
```

- [ ] **Step 2: Add state and handlers**

At the top of the `RevenuePage` component, add:

```typescript
const [downloadingId, setDownloadingId] = useState<string | null>(null)
const [sendingId, setSendingId] = useState<string | null>(null)

async function handleDownloadPdf(invoiceId: string) {
  setDownloadingId(invoiceId)
  try {
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
    setTimeout(() => URL.revokeObjectURL(url), 100)
  } catch {
    toast.error("Failed to download PDF")
  } finally {
    setDownloadingId(null)
  }
}

async function handleSendInvoice(invoiceId: string) {
  setSendingId(invoiceId)
  try {
    await api.post(`/api/invoices/${invoiceId}/send`, {})
    toast.success("Invoice sent to customer")
  } catch (e) {
    const msg = (e as { message?: string }).message ?? ""
    toast.error(msg.includes("no email") ? "Customer has no email address" : "Failed to send invoice")
  } finally {
    setSendingId(null)
  }
}
```

Add `toast` import from `"sonner"` if not already present. Add `FileDown` and `Send` to the lucide-react import.

- [ ] **Step 3: Add buttons to each invoice row**

Find the invoice table row render (where `invoice.id`, `invoice.customer.name`, `invoice.amount`, `invoice.status` are displayed). Add two icon buttons at the end of each row:

```tsx
<button
  type="button"
  onClick={() => handleDownloadPdf(invoice.id)}
  disabled={downloadingId === invoice.id || sendingId === invoice.id}
  className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-50"
  title="Download PDF"
>
  {downloadingId === invoice.id
    ? <Loader2 className="h-4 w-4 animate-spin" />
    : <FileDown className="h-4 w-4" />}
</button>
<button
  type="button"
  onClick={() => handleSendInvoice(invoice.id)}
  disabled={sendingId === invoice.id || downloadingId === invoice.id}
  className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-50"
  title="Send to customer"
>
  {sendingId === invoice.id
    ? <Loader2 className="h-4 w-4 animate-spin" />
    : <Send className="h-4 w-4" />}
</button>
```

`Loader2` is already imported. `FileDown` and `Send` must be added to the lucide import.

- [ ] **Step 4: TypeScript check**

```bash
cd /Users/stevenzakaria/flowsense/frontend && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors

- [ ] **Step 5: Commit**

```bash
cd /Users/stevenzakaria/flowsense && git add frontend/src/pages/office/OfficeRevenue.tsx && git commit -m "feat: add Download PDF and Send to customer buttons to invoice table"
```

---

## Final verification

- [ ] **Start dev servers and visually verify**

```bash
cd /Users/stevenzakaria/flowsense && npm run dev
```

Navigate to `/office/revenue`. Confirm:
1. Two icon buttons appear on each invoice row (download + send icons)
2. Clicking Download triggers a file download with name `invoice-XXXXXXXX.pdf`
3. Opening the downloaded PDF shows org name, invoice number, customer info, amount
4. Clicking Send (with a customer who has an email) shows a success toast
5. Clicking Send (no email) shows error toast "Customer has no email address"
6. Buttons disable while action is in progress

- [ ] **Run full backend test suite one final time**

```bash
cd /Users/stevenzakaria/flowsense/backend && npx vitest run 2>&1 | tail -5
```

Expected: all tests pass
