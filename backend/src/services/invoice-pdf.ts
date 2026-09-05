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
  job: { equipmentType: string | null; symptomSummary: string | null } | null
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
    if (invoice.job?.equipmentType || invoice.job?.symptomSummary) {
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
    doc.fontSize(10).font("Helvetica").fillColor("#888888").text("Thank you for your business. — Pneuros", { align: "center" })

    doc.end()
  })
}
