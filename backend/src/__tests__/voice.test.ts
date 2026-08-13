import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("openai", () => ({
  default: class MockOpenAI {
    audio = { transcriptions: { create: vi.fn() } }
  },
  toFile: vi.fn(),
}))

vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    messages = { create: vi.fn() }
  },
}))

vi.mock("../lib/prisma.js", () => ({ prisma: {} }))

describe("transcribeAudio", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it("returns not_configured when OPENAI_API_KEY not set", async () => {
    vi.stubEnv("OPENAI_API_KEY", "")
    const { transcribeAudio } = await import("../services/voice-transcribe.js")
    const result = await transcribeAudio(Buffer.from("audio"), "audio/webm")
    expect(result).toEqual({ error: "not_configured" })
  })

  it("returns transcript on success", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key")
    vi.doMock("openai", () => ({
      default: class MockOpenAI {
        audio = {
          transcriptions: {
            create: vi.fn().mockResolvedValue({ text: "Replaced capacitor" }),
          },
        }
      },
      toFile: vi.fn().mockResolvedValue(new Blob()),
    }))
    vi.resetModules()
    const { transcribeAudio: fn } = await import("../services/voice-transcribe.js")
    const result = await fn(Buffer.from("audio"), "audio/webm")
    expect(result).toMatchObject({ transcript: expect.any(String) })
  })
})

describe("extractJobFields", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it("returns not_configured when ANTHROPIC_API_KEY not set", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "")
    vi.stubEnv("OPENAI_API_KEY", "test-key")
    const { extractJobFields } = await import("../services/voice-transcribe.js")
    const result = await extractJobFields("Replaced capacitor", {
      equipmentType: "ac",
      serviceType: "repair",
      symptomSummary: "No cooling",
    })
    expect(result).toEqual({ error: "not_configured" })
  })

  it("returns extracted fields on success", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key")
    vi.stubEnv("OPENAI_API_KEY", "test-key")
    const mockFields = {
      actionsTaken: "Replaced capacitor",
      partsUsed: ["Capacitor"],
      notes: "Unit running well",
      laborHours: 1.5,
      summary: "Capacitor replaced.",
    }
    vi.doMock("@anthropic-ai/sdk", () => ({
      default: class MockAnthropic {
        messages = {
          create: vi.fn().mockResolvedValue({
            content: [{ type: "text", text: JSON.stringify(mockFields) }],
          }),
        }
      },
    }))
    vi.doMock("openai", () => ({
      default: class MockOpenAI {
        audio = { transcriptions: { create: vi.fn() } }
      },
      toFile: vi.fn(),
    }))
    vi.resetModules()
    const { extractJobFields: fn } = await import("../services/voice-transcribe.js")
    const result = await fn("Replaced capacitor", {
      equipmentType: "ac",
      serviceType: "repair",
      symptomSummary: null,
    })
    expect(result).toHaveProperty("fields")
    if ("fields" in result) {
      expect(result.fields.partsUsed).toBeInstanceOf(Array)
      expect(result.fields.laborHours).toBeGreaterThanOrEqual(0.5)
      expect(result.fields.laborHours).toBeLessThanOrEqual(24)
    }
  })

  it("falls back to safe defaults when Claude returns malformed JSON", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key")
    vi.stubEnv("OPENAI_API_KEY", "test-key")
    vi.doMock("@anthropic-ai/sdk", () => ({
      default: class MockAnthropic {
        messages = {
          create: vi.fn().mockResolvedValue({
            content: [{ type: "text", text: "not json at all" }],
          }),
        }
      },
    }))
    vi.doMock("openai", () => ({
      default: class MockOpenAI {
        audio = { transcriptions: { create: vi.fn() } }
      },
      toFile: vi.fn(),
    }))
    vi.resetModules()
    const { extractJobFields: fn } = await import("../services/voice-transcribe.js")
    const result = await fn("Replaced capacitor", {
      equipmentType: "ac",
      serviceType: "repair",
      symptomSummary: null,
    })
    expect(result).toHaveProperty("fields")
    if ("fields" in result) {
      expect(result.fields.actionsTaken).toBe("")
      expect(result.fields.partsUsed).toEqual([])
      expect(result.fields.laborHours).toBe(1)
    }
  })
})
