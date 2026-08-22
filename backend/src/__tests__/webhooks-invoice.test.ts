import { describe, it, expect, vi, beforeEach } from "vitest"
import request from "supertest"
import express from "express"

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    invoice: { update: vi.fn(), findUnique: vi.fn() },
    organization: { findUnique: vi.fn() },
    estimate: { findUnique: vi.fn() },
    job: { update: vi.fn() },
  },
}))

vi.mock("stripe", () => {
  function MockStripe() {
    return { webhooks: { constructEvent: vi.fn() } }
  }
  return { default: MockStripe }
})

vi.mock("../services/email.js", () => ({
  sendEmail: vi.fn(),
  sendDepositReceiptEmail: vi.fn().mockResolvedValue(undefined),
  sendInvoiceReceiptEmail: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("../services/org-notifications.js", () => ({
  notifyOrgNewBooking: vi.fn(),
  notifyOrgStatusChange: vi.fn(),
  notifyOrgJobCompleted: vi.fn(),
  notifyOfficeDepositReceived: vi.fn().mockResolvedValue(undefined),
  notifyOfficePaymentReceived: vi.fn().mockResolvedValue(undefined),
  notifyOfficePlanCreated: vi.fn().mockResolvedValue(undefined),
}))

import { prisma } from "../lib/prisma.js"
import { sendInvoiceReceiptEmail } from "../services/email.js"
import { notifyOfficePaymentReceived } from "../services/org-notifications.js"
import { webhooksRouter } from "../routes/webhooks.js"

const mockPrisma = prisma as unknown as {
  invoice: { update: ReturnType<typeof vi.fn>; findUnique: ReturnType<typeof vi.fn> }
  organization: { findUnique: ReturnType<typeof vi.fn> }
  estimate: { findUnique: ReturnType<typeof vi.fn> }
  job: { update: ReturnType<typeof vi.fn> }
}

function makeApp() {
  const app = express()
  app.use(express.raw({ type: "application/json" }))
  app.use(webhooksRouter)
  return app
}

function makeEvent(type: string, object: object) {
  return { type, data: { object } }
}

describe("Stripe webhook — invoice payment", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.STRIPE_SECRET_KEY = "sk_test_dummy"
    delete process.env.STRIPE_WEBHOOK_SECRET
  })

  it("marks invoice as paid on checkout.session.completed", async () => {
    mockPrisma.invoice.update.mockResolvedValue({ id: "inv1", status: "paid" })
    mockPrisma.invoice.findUnique.mockResolvedValue({
      id: "inv1",
      amount: 350,
      description: "AC repair",
      issuedDate: new Date("2026-08-01"),
      customer: { name: "Alice Johnson", email: "alice@example.com" },
    })
    mockPrisma.organization.findUnique.mockResolvedValue({
      name: "Cool Air HVAC",
      phone: "+15550001234",
      email: "office@coolair.com",
    })

    const event = makeEvent("checkout.session.completed", {
      metadata: { invoiceId: "inv1", organizationId: "org1" },
    })

    const res = await request(makeApp())
      .post("/stripe")
      .set("content-type", "application/json")
      .send(JSON.stringify(event))

    expect(res.status).toBe(200)
    expect(mockPrisma.invoice.update).toHaveBeenCalledWith({
      where: { id: "inv1" },
      data: { status: "paid" },
    })
  })

  it("calls sendInvoiceReceiptEmail after invoice is marked paid", async () => {
    mockPrisma.invoice.update.mockResolvedValue({})
    mockPrisma.invoice.findUnique.mockResolvedValue({
      id: "inv1",
      amount: 350,
      description: "AC repair",
      issuedDate: new Date("2026-08-01"),
      customer: { name: "Alice Johnson", email: "alice@example.com" },
    })
    mockPrisma.organization.findUnique.mockResolvedValue({
      name: "Cool Air HVAC",
      phone: "+15550001234",
      email: "office@coolair.com",
    })

    const event = makeEvent("checkout.session.completed", {
      metadata: { invoiceId: "inv1", organizationId: "org1" },
    })

    await request(makeApp())
      .post("/stripe")
      .set("content-type", "application/json")
      .send(JSON.stringify(event))

    await new Promise((r) => setTimeout(r, 10))
    expect(sendInvoiceReceiptEmail).toHaveBeenCalled()
  })

  it("calls notifyOfficePaymentReceived after invoice is marked paid", async () => {
    mockPrisma.invoice.update.mockResolvedValue({})
    mockPrisma.invoice.findUnique.mockResolvedValue({
      id: "inv1",
      amount: 350,
      description: "AC repair",
      issuedDate: new Date("2026-08-01"),
      customer: { name: "Alice Johnson", email: "alice@example.com" },
    })
    mockPrisma.organization.findUnique.mockResolvedValue({
      name: "Cool Air HVAC",
      phone: "+15550001234",
      email: "office@coolair.com",
    })

    const event = makeEvent("checkout.session.completed", {
      metadata: { invoiceId: "inv1", organizationId: "org1" },
    })

    await request(makeApp())
      .post("/stripe")
      .set("content-type", "application/json")
      .send(JSON.stringify(event))

    await new Promise((r) => setTimeout(r, 10))
    expect(notifyOfficePaymentReceived).toHaveBeenCalled()
  })

  it("still returns 200 if invoice findUnique returns null after update", async () => {
    mockPrisma.invoice.update.mockResolvedValue({})
    mockPrisma.invoice.findUnique.mockResolvedValue(null)
    mockPrisma.organization.findUnique.mockResolvedValue(null)

    const event = makeEvent("checkout.session.completed", {
      metadata: { invoiceId: "inv1", organizationId: "org1" },
    })

    const res = await request(makeApp())
      .post("/stripe")
      .set("content-type", "application/json")
      .send(JSON.stringify(event))

    expect(res.status).toBe(200)
  })

  it("still returns 200 if sendInvoiceReceiptEmail throws", async () => {
    mockPrisma.invoice.update.mockResolvedValue({})
    mockPrisma.invoice.findUnique.mockResolvedValue({
      id: "inv1",
      amount: 350,
      description: "AC repair",
      issuedDate: new Date("2026-08-01"),
      customer: { name: "Alice Johnson", email: "alice@example.com" },
    })
    mockPrisma.organization.findUnique.mockResolvedValue({
      name: "Cool Air HVAC",
      phone: null,
      email: "office@coolair.com",
    })
    vi.mocked(sendInvoiceReceiptEmail).mockRejectedValue(new Error("Email failed"))

    const event = makeEvent("checkout.session.completed", {
      metadata: { invoiceId: "inv1", organizationId: "org1" },
    })

    const res = await request(makeApp())
      .post("/stripe")
      .set("content-type", "application/json")
      .send(JSON.stringify(event))

    expect(res.status).toBe(200)
  })
})
