import { describe, it, expect, vi, beforeEach } from "vitest"

// We test the price ID resolver — the rest is Stripe API calls (not unit-testable)
describe("getPriceId", () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it("returns entry price ID for 'entry' plan", async () => {
    process.env.STRIPE_PRICE_ID_ENTRY = "price_entry_test"
    process.env.STRIPE_PRICE_ID_CORE = "price_core_test"
    process.env.STRIPE_PRICE_ID_PREMIUM = "price_premium_test"
    const { getPriceId } = await import("../services/stripe.js")
    expect(getPriceId("entry")).toBe("price_entry_test")
  })

  it("returns core price ID for 'core' plan", async () => {
    const { getPriceId } = await import("../services/stripe.js")
    expect(getPriceId("core")).toBe("price_core_test")
  })

  it("returns premium price ID for 'premium' plan", async () => {
    const { getPriceId } = await import("../services/stripe.js")
    expect(getPriceId("premium")).toBe("price_premium_test")
  })

  it("throws for unknown plan", async () => {
    const { getPriceId } = await import("../services/stripe.js")
    expect(() => getPriceId("unknown")).toThrow("Unknown plan")
  })
})
