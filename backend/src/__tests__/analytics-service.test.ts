import { describe, it, expect, vi, beforeEach } from "vitest"

describe("analytics-ai service", () => {
  beforeEach(() => {
    vi.resetModules()
    delete process.env.ANTHROPIC_API_KEY
  })

  it("getAtRiskReasons returns empty map when ANTHROPIC_API_KEY not set", async () => {
    vi.doMock("@anthropic-ai/sdk", () => ({ default: vi.fn() }))
    const { getAtRiskReasons } = await import("../services/analytics-ai.js")
    const result = await getAtRiskReasons([
      { customerId: "c1", name: "Alice", flags: ["overdue_service"] },
    ])
    expect(result).toEqual({})
  })

  it("getAtRiskReasons returns empty map when customers array is empty", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key"
    vi.doMock("@anthropic-ai/sdk", () => ({
      default: class MockAnthropic {},
    }))
    const { getAtRiskReasons } = await import("../services/analytics-ai.js")
    const result = await getAtRiskReasons([])
    expect(result).toEqual({})
  })

  it("getAnalyticsNarrative returns null when ANTHROPIC_API_KEY not set", async () => {
    vi.doMock("@anthropic-ai/sdk", () => ({ default: vi.fn() }))
    const { getAnalyticsNarrative } = await import("../services/analytics-ai.js")
    const result = await getAnalyticsNarrative({
      revenueTrend: [],
      jobTrend: [],
      equipmentBreakdown: [],
      atRiskCount: 0,
    })
    expect(result).toBeNull()
  })

  it("getAtRiskReasons returns empty map on API failure", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key"
    const mockCreate = vi.fn().mockRejectedValue(new Error("API error"))
    vi.doMock("@anthropic-ai/sdk", () => ({
      default: class MockAnthropic {
        messages = { create: mockCreate }
      },
    }))
    const { getAtRiskReasons } = await import("../services/analytics-ai.js")
    const result = await getAtRiskReasons([
      { customerId: "c1", name: "Alice", flags: ["overdue_service"] },
    ])
    expect(result).toEqual({})
  })
})
