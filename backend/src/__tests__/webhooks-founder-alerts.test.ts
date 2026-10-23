import { describe, it, expect, vi, beforeEach } from "vitest"
import request from "supertest"
import express from "express"

vi.mock("../lib/prisma.js", () => ({
  prisma: { organization: { findFirst: vi.fn(), update: vi.fn() } },
}))
vi.mock("stripe", () => ({ default: function MockStripe() { return { webhooks: { constructEvent: vi.fn() } } } }))
vi.mock("../services/email.js", () => ({ sendEmail: vi.fn(), sendDepositReceiptEmail: vi.fn(), sendInvoiceReceiptEmail: vi.fn() }))
vi.mock("../services/org-notifications.js", () => ({ notifyOfficeDepositReceived: vi.fn(), notifyOfficePaymentReceived: vi.fn() }))
vi.mock("../services/create-notification.js", () => ({ createNotification: vi.fn().mockResolvedValue(undefined) }))
vi.mock("../services/founder-alerts.js", () => ({ notifyFounder: vi.fn() }))

import { prisma } from "../lib/prisma.js"
import { notifyFounder } from "../services/founder-alerts.js"
import { webhooksRouter } from "../routes/webhooks.js"

const app = (() => {
  const a = express()
  a.use(express.raw({ type: "application/json" }))
  a.use(webhooksRouter)
  return a
})()

const post = (type: string, object: object) => request(app).post("/stripe").send({ type, data: { object } })
const findFirst = vi.mocked(prisma.organization.findFirst)

beforeEach(() => {
  vi.clearAllMocks()
  process.env.STRIPE_SECRET_KEY = "sk_test_dummy"
  delete process.env.STRIPE_WEBHOOK_SECRET
  process.env.STRIPE_PRICE_ID_SHOP = "price_shop"
  process.env.STRIPE_PRICE_ID_FLEET = "price_fleet"
  process.env.STRIPE_PRICE_ID_STARTER = "price_starter"
  vi.mocked(prisma.organization.update).mockResolvedValue({} as never)
})

const sub = (over: object = {}) => ({
  id: "sub_1", customer: "cus_1", status: "trialing", trial_end: 1_800_000_000,
  items: { data: [{ price: { id: "price_shop" } }] }, ...over,
})

describe("founder alerts from subscription events", () => {
  it("announces a new trial the first time a subscription is seen", async () => {
    findFirst.mockResolvedValue({ id: "o1", name: "Cool Air", plan: "shop", stripeSubscriptionId: null } as never)
    expect((await post("customer.subscription.created", sub())).status).toBe(200)
    expect(notifyFounder).toHaveBeenCalledTimes(1)
    expect(notifyFounder).toHaveBeenCalledWith(expect.objectContaining({ type: "trial_started", company: "Cool Air", plan: "shop" }))
  })

  it("announces a paid start (no trial) differently", async () => {
    findFirst.mockResolvedValue({ id: "o1", name: "Cool Air", plan: "shop", stripeSubscriptionId: null } as never)
    await post("customer.subscription.created", sub({ status: "active", trial_end: null }))
    expect(notifyFounder).toHaveBeenCalledWith({ type: "subscribed", company: "Cool Air", plan: "shop" })
  })

  it("stays quiet when the subscription is already recorded and nothing changed (Stripe retries and follow-up updates)", async () => {
    findFirst.mockResolvedValue({ id: "o1", name: "Cool Air", plan: "shop", stripeSubscriptionId: "sub_1" } as never)
    await post("customer.subscription.created", sub())
    await post("customer.subscription.updated", sub())
    expect(notifyFounder).not.toHaveBeenCalled()
  })

  it("announces a move between paid tiers on an existing subscription", async () => {
    findFirst.mockResolvedValue({ id: "o1", name: "Cool Air", plan: "shop", stripeSubscriptionId: "sub_1" } as never)
    await post("customer.subscription.updated", sub({ status: "active", items: { data: [{ price: { id: "price_fleet" } }] } }))
    expect(notifyFounder).toHaveBeenCalledWith({ type: "plan_changed", company: "Cool Air", from: "shop", to: "fleet" })
  })

  it("doesn't call recovery from payment_failed or cancelled an upgrade", async () => {
    for (const plan of ["payment_failed", "cancelled", "trial"]) {
      findFirst.mockResolvedValue({ id: "o1", name: "Cool Air", plan, stripeSubscriptionId: "sub_1" } as never)
      await post("customer.subscription.updated", sub({ status: "active" }))
    }
    expect(notifyFounder).not.toHaveBeenCalled()
  })

  it("announces a cancellation once, with the plan they were on", async () => {
    findFirst.mockResolvedValue({ id: "o1", name: "Cool Air", plan: "fleet" } as never)
    await post("customer.subscription.deleted", { id: "sub_1", customer: "cus_1" })
    expect(notifyFounder).toHaveBeenCalledWith({ type: "cancelled", company: "Cool Air", plan: "fleet" })

    vi.mocked(notifyFounder).mockClear()
    findFirst.mockResolvedValue({ id: "o1", name: "Cool Air", plan: "cancelled" } as never)
    await post("customer.subscription.deleted", { id: "sub_1", customer: "cus_1" })
    expect(notifyFounder).not.toHaveBeenCalled()
  })

  const failedInvoice = { customer: "cus_1", parent: { subscription_details: { subscription: "sub_1" } } }

  it("announces the first failed payment, not Stripe's retries of it", async () => {
    findFirst.mockResolvedValue({ id: "o1", name: "Cool Air", plan: "shop" } as never)
    await post("invoice.payment_failed", failedInvoice)
    expect(notifyFounder).toHaveBeenCalledWith({ type: "payment_failed", company: "Cool Air", plan: "shop" })

    vi.mocked(notifyFounder).mockClear()
    findFirst.mockResolvedValue({ id: "o1", name: "Cool Air", plan: "payment_failed" } as never)
    await post("invoice.payment_failed", failedInvoice)
    expect(notifyFounder).not.toHaveBeenCalled()
  })
})
