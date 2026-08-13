import { describe, it, expect, vi, beforeEach } from "vitest"

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

import request from "supertest"
import express from "express"
import { invoicesRouter } from "../routes/invoices.js"
import { prisma } from "../lib/prisma.js"
import { sendEmail } from "../services/email.js"

function makeApp(role = "office") {
  const app = express()
  app.use(express.json())
  app.use((req: express.Request, _res: express.Response, next: express.NextFunction) => {
    (req as unknown as { user: unknown }).user = { organizationId: "org1", role }
    next()
  })
  app.use("/api/invoices", invoicesRouter)
  return app
}

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
    const res = await request(makeApp()).get("/api/invoices/notexist/pdf")
    expect(res.status).toBe(404)
  })

  it("returns 200 with content-type application/pdf", async () => {
    vi.mocked(prisma.invoice.findFirst).mockResolvedValue(mockInvoice as unknown as never)
    const res = await request(makeApp()).get("/api/invoices/cltest00000000001/pdf")
    expect(res.status).toBe(200)
    expect(res.headers["content-type"]).toMatch(/application\/pdf/)
  })
})

describe("POST /api/invoices/:id/send", () => {
  beforeEach(() => vi.clearAllMocks())

  it("returns 403 for non-office role", async () => {
    const res = await request(makeApp("technician")).post("/api/invoices/cltest00000000001/send")
    expect(res.status).toBe(403)
  })

  it("returns 404 when invoice not found", async () => {
    vi.mocked(prisma.invoice.findFirst).mockResolvedValue(null)
    const res = await request(makeApp()).post("/api/invoices/notexist/send")
    expect(res.status).toBe(404)
  })

  it("returns 400 when customer has no email", async () => {
    const noEmail = { ...mockInvoice, customer: { ...mockInvoice.customer, email: null } }
    vi.mocked(prisma.invoice.findFirst).mockResolvedValue(noEmail as unknown as never)
    const res = await request(makeApp()).post("/api/invoices/cltest00000000001/send")
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/no email/i)
  })

  it("returns 200 and calls sendEmail on success", async () => {
    vi.mocked(prisma.invoice.findFirst).mockResolvedValue(mockInvoice as unknown as never)
    const res = await request(makeApp()).post("/api/invoices/cltest00000000001/send")
    expect(res.status).toBe(200)
    expect(res.body.sent).toBe(true)
    expect(sendEmail).toHaveBeenCalledOnce()
  })
})
