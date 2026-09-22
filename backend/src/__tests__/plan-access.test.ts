import { describe, it, expect } from "vitest"
import {
  planHasAdvancedFeatures,
  planHasConcierge,
  planHasCsvImport,
  planHasShopFeatures,
  technicianCapFor,
  officeSeatCapFor,
} from "../lib/plan-access.js"

describe("plan-access", () => {
  it("only Fleet, Enterprise and the unconfigured-billing trial fallback get advanced features", () => {
    expect(planHasAdvancedFeatures("fleet")).toBe(true)
    expect(planHasAdvancedFeatures("enterprise")).toBe(true)
    expect(planHasAdvancedFeatures("trial")).toBe(true)
    expect(planHasAdvancedFeatures("starter")).toBe(false)
    expect(planHasAdvancedFeatures("shop")).toBe(false)
    expect(planHasAdvancedFeatures("cancelled")).toBe(false)
    expect(planHasAdvancedFeatures("payment_failed")).toBe(false)
  })

  it("only Enterprise (and the dev fallback) get the concierge chat", () => {
    expect(planHasConcierge("enterprise")).toBe(true)
    expect(planHasConcierge("trial")).toBe(true)
    expect(planHasConcierge("fleet")).toBe(false)
    expect(planHasConcierge("shop")).toBe(false)
    expect(planHasConcierge("starter")).toBe(false)
  })

  it("CSV import is everything above Starter", () => {
    expect(planHasCsvImport("shop")).toBe(true)
    expect(planHasCsvImport("fleet")).toBe(true)
    expect(planHasCsvImport("enterprise")).toBe(true)
    expect(planHasCsvImport("trial")).toBe(true)
    expect(planHasCsvImport("starter")).toBe(false)
  })

  it("the pricebook, maintenance plans and recurring jobs are the same Shop-and-up line as CSV import", () => {
    expect(planHasShopFeatures("shop")).toBe(true)
    expect(planHasShopFeatures("fleet")).toBe(true)
    expect(planHasShopFeatures("enterprise")).toBe(true)
    expect(planHasShopFeatures("trial")).toBe(true)
    expect(planHasShopFeatures("starter")).toBe(false)
    // planHasCsvImport is the same rule under a name specific to that feature
    expect(planHasCsvImport).toBe(planHasShopFeatures)
  })

  it("only Starter has a technician and office-seat cap", () => {
    expect(technicianCapFor("starter")).toBe(2)
    expect(technicianCapFor("shop")).toBeNull()
    expect(technicianCapFor("fleet")).toBeNull()

    expect(officeSeatCapFor("starter")).toBe(1)
    expect(officeSeatCapFor("shop")).toBeNull()
  })
})
