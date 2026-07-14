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
  },
}))

// Mock Stripe — we skip signature verification in tests by not setting STRIPE_WEBHOOK_SECRET
vi.mock("stripe", () => {
  function MockStripe() {
    return { webhooks: { constructEvent: vi.fn() } }
  }
  return { default: MockStripe }
})

import { prisma } from "../lib/prisma.js"
import { webhooksRouter } from "../routes/webhooks.js"

function makeApp() {
  const app = express()
  app.use(express.raw({ type: "application/json" }))
  app.use("/webhooks", webhooksRouter)
  return app
}

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
