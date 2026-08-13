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
