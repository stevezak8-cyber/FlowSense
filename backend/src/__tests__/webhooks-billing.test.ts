import { describe, it, expect, vi, beforeEach } from "vitest"
import request from "supertest"
import express from "express"

// Mock prisma
vi.mock("../lib/prisma.js", () => ({
  prisma: {
    organization: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    invoice: {
      update: vi.fn(),
    },
    estimate: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    job: {
      update: vi.fn(),
    },
  },
}))

// Mock Stripe — we skip signature verification in tests by not setting STRIPE_WEBHOOK_SECRET
vi.mock("stripe", () => {
  function MockStripe() {
    return { webhooks: { constructEvent: vi.fn() } }
  }
  return { default: MockStripe }
})

vi.mock("../services/email.js", () => ({
  sendEmail: vi.fn(),
  sendDepositReceiptEmail: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("../services/org-notifications.js", () => ({
  notifyOrgNewBooking: vi.fn(),
  notifyOrgStatusChange: vi.fn(),
  notifyOrgJobCompleted: vi.fn(),
  notifyOfficeDepositReceived: vi.fn().mockResolvedValue(undefined),
}))

import { prisma } from "../lib/prisma.js"
import * as stripeModule from "stripe"
import { webhooksRouter } from "../routes/webhooks.js"

function makeApp() {
  const app = express()
  app.use(express.raw({ type: "application/json" }))
  app.use("/webhooks", webhooksRouter)
  return app
}

// Top-level app for deposit tests (mounts router at /, so POST /stripe works)
const app = (() => {
  const a = express()
  a.use(express.raw({ type: "application/json" }))
  a.use(webhooksRouter)
  return a
})()

function makeEvent(type: string, object: object) {
  return { type, data: { object } }
}

describe("Stripe webhook — subscription events", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.STRIPE_SECRET_KEY = "sk_test_dummy"
    delete process.env.STRIPE_WEBHOOK_SECRET
  })

  it("sets plan=trial and trialEndsAt on customer.subscription.created", async () => {
    vi.mocked(prisma.organization.findFirst).mockResolvedValue({ id: "org-1", plan: "trial" } as never)
    vi.mocked(prisma.organization.update).mockResolvedValue({} as never)

    const trialEnd = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60
    const event = makeEvent("customer.subscription.created", {
      id: "sub_123",
      customer: "cus_abc",
      trial_end: trialEnd,
      items: { data: [{ price: { id: "price_entry_test" } }] },
      status: "trialing",
    })

    const app = makeApp()
    const res = await request(app).post("/webhooks/stripe").send(event)
    expect(res.status).toBe(200)
    expect(prisma.organization.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          plan: "trial",
          stripeSubscriptionId: "sub_123",
        }),
      })
    )
  })

  it("sets plan=cancelled on customer.subscription.deleted", async () => {
    vi.mocked(prisma.organization.findFirst).mockResolvedValue({ id: "org-1", plan: "entry" } as never)
    vi.mocked(prisma.organization.update).mockResolvedValue({} as never)

    const event = makeEvent("customer.subscription.deleted", {
      id: "sub_123",
      customer: "cus_abc",
    })

    const app = makeApp()
    const res = await request(app).post("/webhooks/stripe").send(event)
    expect(res.status).toBe(200)
    expect(prisma.organization.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { plan: "cancelled" } })
    )
  })

  it("updates plan on invoice.payment_succeeded for subscription invoice", async () => {
    vi.mocked(prisma.organization.findFirst).mockResolvedValue({ id: "org-1", plan: "trial" } as never)
    vi.mocked(prisma.organization.update).mockResolvedValue({} as never)

    process.env.STRIPE_PRICE_ID_ENTRY = "price_entry_test"
    const event = makeEvent("invoice.payment_succeeded", {
      customer: "cus_abc",
      subscription: "sub_123",
      billing_reason: "subscription_cycle",
      lines: { data: [{ price: { id: "price_entry_test" } }] },
    })

    const app = makeApp()
    const res = await request(app).post("/webhooks/stripe").send(event)
    expect(res.status).toBe(200)
    expect(prisma.organization.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ plan: "entry" }) })
    )
  })
})

describe("checkout.session.completed — estimate deposit", () => {
  function buildDepositEvent(metadata: Record<string, string>) {
    return {
      type: "checkout.session.completed",
      data: {
        object: {
          metadata,
          payment_status: "paid",
        },
      },
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.STRIPE_SECRET_KEY = "sk_test_dummy"
    delete process.env.STRIPE_WEBHOOK_SECRET
  })

  it("skips estimate path when estimateId is absent from metadata", async () => {
    const event = {
      type: "checkout.session.completed",
      data: { object: { metadata: {}, payment_status: "paid" } },
    }
    ;(stripeModule as any).stripe = { webhooks: { constructEvent: vi.fn().mockReturnValue(event) } }
    ;(prisma.estimate.findUnique as any).mockResolvedValue(null)
    const res = await request(app)
      .post("/stripe")
      .set("stripe-signature", "sig")
      .set("content-type", "application/json")
      .send(JSON.stringify(event))
    expect(res.status).toBe(200)
    expect(prisma.estimate.findUnique).not.toHaveBeenCalled()
  })

  it("skips when estimate not found", async () => {
    const event = buildDepositEvent({ estimateId: "est-1", jobId: "job-1", organizationId: "org-1" })
    ;(stripeModule as any).stripe = { webhooks: { constructEvent: vi.fn().mockReturnValue(event) } }
    ;(prisma.estimate.findUnique as any).mockResolvedValue(null)
    const res = await request(app)
      .post("/stripe")
      .set("stripe-signature", "sig")
      .set("content-type", "application/json")
      .send(JSON.stringify(event))
    expect(res.status).toBe(200)
    expect(prisma.estimate.update).not.toHaveBeenCalled()
  })

  it("skips when deposit already paid (idempotent)", async () => {
    const event = buildDepositEvent({ estimateId: "est-1", jobId: "job-1", organizationId: "org-1" })
    ;(stripeModule as any).stripe = { webhooks: { constructEvent: vi.fn().mockReturnValue(event) } }
    ;(prisma.estimate.findUnique as any).mockResolvedValue({
      id: "est-1", depositPaidAt: new Date(), organizationId: "org-1",
    })
    const res = await request(app)
      .post("/stripe")
      .set("stripe-signature", "sig")
      .set("content-type", "application/json")
      .send(JSON.stringify(event))
    expect(res.status).toBe(200)
    expect(prisma.estimate.update).not.toHaveBeenCalled()
  })

  it("marks deposit paid and updates job to confirmed", async () => {
    const event = buildDepositEvent({ estimateId: "est-1", jobId: "job-1", organizationId: "org-1" })
    ;(stripeModule as any).stripe = { webhooks: { constructEvent: vi.fn().mockReturnValue(event) } }
    ;(prisma.estimate.findUnique as any).mockResolvedValue({
      id: "est-1", depositPaidAt: null, organizationId: "org-1",
    })
    ;(prisma.estimate.update as any).mockResolvedValue({})
    ;(prisma.job.update as any).mockResolvedValue({})
    const res = await request(app)
      .post("/stripe")
      .set("stripe-signature", "sig")
      .set("content-type", "application/json")
      .send(JSON.stringify(event))
    expect(res.status).toBe(200)
    expect(prisma.estimate.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "est-1" },
        data: expect.objectContaining({ depositPaidAt: expect.any(Date) }),
      })
    )
    expect(prisma.job.update).toHaveBeenCalledWith({
      where: { id: "job-1" },
      data: { status: "confirmed" },
    })
  })

  it("skips and logs when org ID mismatches (cross-tenant)", async () => {
    const event = buildDepositEvent({ estimateId: "est-1", jobId: "job-1", organizationId: "org-ATTACKER" })
    ;(stripeModule as any).stripe = { webhooks: { constructEvent: vi.fn().mockReturnValue(event) } }
    ;(prisma.estimate.findUnique as any).mockResolvedValue({
      id: "est-1", depositPaidAt: null, organizationId: "org-VICTIM",
    })
    const res = await request(app)
      .post("/stripe")
      .set("stripe-signature", "sig")
      .set("content-type", "application/json")
      .send(JSON.stringify(event))
    expect(res.status).toBe(200)
    expect(prisma.estimate.update).not.toHaveBeenCalled()
  })
})
