import { describe, it, expect, vi, beforeEach } from "vitest"

// We test the price ID resolver — the rest is Stripe API calls (not unit-testable)
describe("getPriceId", () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it("returns shop price ID for 'shop' plan", async () => {
    process.env.STRIPE_PRICE_ID_SHOP = "price_shop_test"
    process.env.STRIPE_PRICE_ID_FLEET = "price_fleet_test"
    process.env.STRIPE_PRICE_ID_ENTERPRISE = "price_enterprise_test"
    const { getPriceId } = await import("../services/stripe.js")
    expect(getPriceId("shop")).toBe("price_shop_test")
  })

  it("returns fleet price ID for 'fleet' plan", async () => {
    const { getPriceId } = await import("../services/stripe.js")
    expect(getPriceId("fleet")).toBe("price_fleet_test")
  })

  it("returns enterprise price ID for 'enterprise' plan", async () => {
    const { getPriceId } = await import("../services/stripe.js")
    expect(getPriceId("enterprise")).toBe("price_enterprise_test")
  })

  it("throws for unknown plan", async () => {
    const { getPriceId } = await import("../services/stripe.js")
    expect(() => getPriceId("unknown")).toThrow("Unknown plan")
  })
})
