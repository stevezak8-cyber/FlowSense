import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    job: { findFirst: vi.fn(), findMany: vi.fn() },
    technician: { findFirst: vi.fn() },
    aiMessage: { findMany: vi.fn(), create: vi.fn() },
  },
}))

vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class MockAnthropic {
      messages = {
        stream: vi.fn(),
      }
    },
  }
})

describe("streamFieldAiResponse", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
  })

  it("calls onError with not_configured when ANTHROPIC_API_KEY absent", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "")
    vi.resetModules()
    const { streamFieldAiResponse } = await import("../services/field-ai.js")
    const onToken = vi.fn()
    const onDone = vi.fn()
    const onError = vi.fn()
    await streamFieldAiResponse("job-1", "user-1", "org-1", onToken, onDone, onError)
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: "not_configured" }))
    expect(onToken).not.toHaveBeenCalled()
    expect(onDone).not.toHaveBeenCalled()
  })

  it("calls onError with job_not_found when job missing", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key")
    vi.resetModules()
    vi.doMock("../lib/prisma.js", () => ({
      prisma: {
        job: { findFirst: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([]) },
        technician: { findFirst: vi.fn().mockResolvedValue(null) },
        aiMessage: { findMany: vi.fn().mockResolvedValue([]) },
      },
    }))
    const { streamFieldAiResponse } = await import("../services/field-ai.js")
    const onError = vi.fn()
    await streamFieldAiResponse("job-missing", "user-1", "org-1", vi.fn(), vi.fn(), onError)
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: "job_not_found" }))
  })
})
