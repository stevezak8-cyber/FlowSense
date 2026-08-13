import { describe, it, expect, vi, beforeEach } from "vitest"

describe("getConciergeReply — service unit tests", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllEnvs()
  })

  it("returns not_configured when ANTHROPIC_API_KEY is not set", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "")
    const { getConciergeReply } = await import("../services/concierge-ai.js")
    const result = await getConciergeReply("cust1", "org1", [{ role: "user", content: "hello" }])
    expect(result).toEqual({ error: "not_configured" })
  })

  it("returns plain reply when Claude response has no action block", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key")
    vi.doMock("@anthropic-ai/sdk", () => ({
      default: class {
        messages = {
          create: vi.fn().mockResolvedValue({
            content: [{ type: "text", text: "Your next appointment is scheduled for Monday." }],
          }),
        }
      },
    }))
    vi.doMock("../lib/prisma.js", () => ({
      prisma: {
        customer: { findUnique: vi.fn().mockResolvedValue({ name: "Jane", address: "1 Main", city: "Austin", state: "TX", postalCode: "78701", phone: null, email: null, jobs: [], equipment: [] }) },
        invoice: { findMany: vi.fn().mockResolvedValue([]) },
        organization: { findUnique: vi.fn().mockResolvedValue({ name: "Cool Air HVAC", phone: null, email: null, address: null }) },
      },
    }))
    const { getConciergeReply } = await import("../services/concierge-ai.js")
    const result = await getConciergeReply("cust1", "org1", [{ role: "user", content: "when is my appointment?" }])
    expect(result).toMatchObject({ reply: expect.any(String) })
    expect("jobAction" in result).toBe(false)
  })

  it("parses create_job action block and returns jobAction", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key")
    const actionLine = '{"action":"create_job","equipmentType":"central-ac","symptomSummary":"Not cooling","scheduledAt":"2026-08-20T09:00:00.000Z"}'
    vi.doMock("@anthropic-ai/sdk", () => ({
      default: class {
        messages = {
          create: vi.fn().mockResolvedValue({
            content: [{ type: "text", text: `Great, I've booked your service call.\n${actionLine}` }],
          }),
        }
      },
    }))
    vi.doMock("../lib/prisma.js", () => ({
      prisma: {
        customer: { findUnique: vi.fn().mockResolvedValue({ name: "Jane", address: "1 Main", city: "Austin", state: "TX", postalCode: "78701", phone: null, email: null, jobs: [], equipment: [] }) },
        invoice: { findMany: vi.fn().mockResolvedValue([]) },
        organization: { findUnique: vi.fn().mockResolvedValue({ name: "Cool Air HVAC", phone: null, email: null, address: null }) },
      },
    }))
    const { getConciergeReply } = await import("../services/concierge-ai.js")
    const result = await getConciergeReply("cust1", "org1", [{ role: "user", content: "book a service" }])
    expect(result).toMatchObject({
      reply: expect.any(String),
      jobAction: {
        equipmentType: "central-ac",
        symptomSummary: "Not cooling",
        scheduledAt: expect.any(Date),
      },
    })
    if ("reply" in result) expect(result.reply).not.toContain('"action"')
  })

  it("returns failed on Anthropic API error", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key")
    vi.doMock("@anthropic-ai/sdk", () => ({
      default: class {
        messages = {
          create: vi.fn().mockRejectedValue(new Error("rate limit")),
        }
      },
    }))
    vi.doMock("../lib/prisma.js", () => ({
      prisma: {
        customer: { findUnique: vi.fn().mockResolvedValue({ name: "Jane", address: "1 Main", city: "Austin", state: "TX", postalCode: "78701", phone: null, email: null, jobs: [], equipment: [] }) },
        invoice: { findMany: vi.fn().mockResolvedValue([]) },
        organization: { findUnique: vi.fn().mockResolvedValue({ name: "Cool Air HVAC", phone: null, email: null, address: null }) },
      },
    }))
    const { getConciergeReply } = await import("../services/concierge-ai.js")
    const result = await getConciergeReply("cust1", "org1", [{ role: "user", content: "hello" }])
    expect(result).toEqual({ error: "failed" })
  })
})
