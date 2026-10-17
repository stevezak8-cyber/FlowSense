import { describe, it, expect, vi, beforeEach } from "vitest"
import request from "supertest"
import express from "express"

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    customer: { findMany: vi.fn() },
    equipment: { findMany: vi.fn() },
    job: { findMany: vi.fn() },
    invoice: { findMany: vi.fn() },
  },
}))

import { prisma } from "../lib/prisma.js"
import { exportsRouter } from "../routes/exports.js"

const mp = prisma as unknown as Record<"customer" | "equipment" | "job" | "invoice", { findMany: ReturnType<typeof vi.fn> }>

function makeApp(role = "office") {
  const app = express()
  app.use((req, _res, next) => {
    ;(req as express.Request & { user: unknown }).user = { userId: "u1", organizationId: "org-1", role }
    next()
  })
  app.use("/", exportsRouter)
  return app
}

const D = new Date("2026-05-01T12:00:00Z")
beforeEach(() => {
  vi.clearAllMocks()
  mp.customer.findMany.mockResolvedValue([{ name: "=EVIL()", phone: "(512) 555-0100", email: null, address: "1 Main St", addressLine2: null, city: "Austin", state: "TX", postalCode: "78704", notes: null, smsOptOut: false, emailOptOut: false, createdAt: D }])
  mp.equipment.findMany.mockResolvedValue([])
  mp.job.findMany.mockResolvedValue([])
  mp.invoice.findMany.mockResolvedValue([{ id: "cmabcdef12345678", customer: { name: "Ann" }, issuedDate: D, dueDate: D, description: "AC repair", amount: 250, status: "paid", job: null }])
})

describe("exports", () => {
  it.each(["technician", "customer"])("is office-only: %s gets 403 and nothing is queried", async (role) => {
    for (const path of ["/customers.csv", "/equipment.csv", "/jobs.csv", "/invoices.csv"]) {
      expect((await request(makeApp(role)).get(path)).status).toBe(403)
    }
    expect(mp.customer.findMany).not.toHaveBeenCalled()
    expect(mp.invoice.findMany).not.toHaveBeenCalled()
  })

  it("sends a CSV download with a dated filename", async () => {
    const res = await request(makeApp()).get("/customers.csv")
    expect(res.status).toBe(200)
    expect(res.headers["content-type"]).toContain("text/csv")
    expect(res.headers["content-disposition"]).toMatch(/^attachment; filename="pneuros-customers-\d{4}-\d{2}-\d{2}\.csv"$/)
    expect(res.headers["cache-control"]).toBe("no-store")
    expect(res.text).toContain("Name,Phone,Email")
  })

  it("never lets a customer name run as a spreadsheet formula", async () => {
    const res = await request(makeApp()).get("/customers.csv")
    expect(res.text).toContain("'=EVIL()")
    expect(res.text).not.toMatch(/\r\n=EVIL/)
  })

  it("only reads this organization's real records, never sandbox samples", async () => {
    await request(makeApp()).get("/customers.csv")
    expect(mp.customer.findMany.mock.calls[0][0].where).toEqual({ organizationId: "org-1", isSample: false })
    await request(makeApp()).get("/equipment.csv")
    expect(mp.equipment.findMany.mock.calls[0][0].where).toEqual({ organizationId: "org-1", customer: { isSample: false } })
    await request(makeApp()).get("/jobs.csv")
    expect(mp.job.findMany.mock.calls[0][0].where).toMatchObject({ organizationId: "org-1", customer: { isSample: false } })
  })

  it("caps the number of rows it will build", async () => {
    await request(makeApp()).get("/customers.csv")
    expect(mp.customer.findMany.mock.calls[0][0].take).toBe(50_000)
  })

  it("filters invoices by an inclusive UTC date range", async () => {
    await request(makeApp()).get("/invoices.csv?from=2026-01-01&to=2026-01-31")
    const where = mp.invoice.findMany.mock.calls[0][0].where
    expect(where.issuedDate.gte).toEqual(new Date("2026-01-01T00:00:00Z"))
    expect(where.issuedDate.lt).toEqual(new Date("2026-02-01T00:00:00Z"))
  })

  it("applies no date filter when none is given", async () => {
    await request(makeApp()).get("/jobs.csv")
    expect(mp.job.findMany.mock.calls[0][0].where.scheduledAt).toBeUndefined()
  })

  it("rejects a malformed date with 400 before touching the database", async () => {
    for (const q of ["from=yesterday", "to=2026-13-45x", "from=2026-1-1"]) {
      expect((await request(makeApp()).get(`/invoices.csv?${q}`)).status).toBe(400)
    }
    expect(mp.invoice.findMany).not.toHaveBeenCalled()
  })

  it("exports invoices with the PDF's invoice number", async () => {
    const res = await request(makeApp()).get("/invoices.csv")
    expect(res.text).toContain("12345678")
    expect(res.text).toContain("AC repair")
  })

  it("returns a generic error if the database fails", async () => {
    mp.customer.findMany.mockRejectedValue(new Error("connection string leaked"))
    const res = await request(makeApp()).get("/customers.csv")
    expect(res.status).toBe(500)
    expect(JSON.stringify(res.body)).not.toContain("leaked")
  })
})
