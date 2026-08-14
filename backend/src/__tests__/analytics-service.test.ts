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

  it("getAtRiskReasons returns parsed map on success", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key"
    vi.doMock("@anthropic-ai/sdk", () => ({
      default: class MockAnthropic {
        messages = {
          create: vi.fn().mockResolvedValue({
            content: [{ type: "text", text: '{"c1": "Equipment overdue for annual service inspection."}' }],
          }),
        }
      },
    }))
    const { getAtRiskReasons } = await import("../services/analytics-ai.js")
    const result = await getAtRiskReasons([
      { customerId: "c1", name: "Alice", flags: ["overdue_service"] },
    ])
    expect(result["c1"]).toBe("Equipment overdue for annual service inspection.")
  })

  it("getAnalyticsNarrative returns string on success", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key"
    vi.doMock("@anthropic-ai/sdk", () => ({
      default: class MockAnthropic {
        messages = {
          create: vi.fn().mockResolvedValue({
            content: [{ type: "text", text: "Revenue has grown steadily over the past six months." }],
          }),
        }
      },
    }))
    const { getAnalyticsNarrative } = await import("../services/analytics-ai.js")
    const result = await getAnalyticsNarrative({
      revenueTrend: [{ month: "2026-02", revenue: 5000 }],
      jobTrend: [{ month: "2026-02", jobs: 10 }],
      equipmentBreakdown: [],
      atRiskCount: 2,
    })
    expect(result).toBe("Revenue has grown steadily over the past six months.")
  })

  it("getAnalyticsNarrative returns null on API failure", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key"
    vi.doMock("@anthropic-ai/sdk", () => ({
      default: class MockAnthropic {
        messages = {
          create: vi.fn().mockRejectedValue(new Error("API error")),
        }
      },
    }))
    const { getAnalyticsNarrative } = await import("../services/analytics-ai.js")
    const result = await getAnalyticsNarrative({
      revenueTrend: [],
      jobTrend: [],
      equipmentBreakdown: [],
      atRiskCount: 0,
    })
    expect(result).toBeNull()
  })

  it("getAnalyticsNarrative returns null for empty response text", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key"
    vi.doMock("@anthropic-ai/sdk", () => ({
      default: class MockAnthropic {
        messages = {
          create: vi.fn().mockResolvedValue({
            content: [{ type: "text", text: "   " }],
          }),
        }
      },
    }))
    const { getAnalyticsNarrative } = await import("../services/analytics-ai.js")
    const result = await getAnalyticsNarrative({
      revenueTrend: [],
      jobTrend: [],
      equipmentBreakdown: [],
      atRiskCount: 0,
    })
    expect(result).toBeNull()
  })
})
