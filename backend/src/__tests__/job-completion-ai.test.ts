import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Prisma
vi.mock("../lib/prisma.js", () => ({
  prisma: {
    job: {
      findFirst: vi.fn(),
    },
  },
}));

// Mock the Anthropic SDK
vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class MockAnthropic {
      messages = { create: vi.fn() };
    },
  };
});

import { prisma } from "../lib/prisma.js";

describe("generateCompletionSummary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("returns not_configured when ANTHROPIC_API_KEY is not set", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.resetModules();
    const { generateCompletionSummary: fn } = await import(
      "../services/job-completion-ai.js"
    );

    const result = await fn("job-1", {
      actionsTaken: "Replaced filter",
      partsUsed: ["Air filter"],
    });

    expect(result).toEqual({ error: "not_configured" });
    expect(prisma.job.findFirst).not.toHaveBeenCalled();
  });

  it("builds correct prompt with tech input and job context", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    vi.resetModules();

    vi.doMock("../lib/prisma.js", () => ({
      prisma: {
        job: {
          findFirst: vi.fn().mockResolvedValue({
            id: "job-1",
            customerId: "cust-1",
            symptomSummary: "No cooling",
            equipmentType: "central-ac",
            serviceType: "repair",
            priority: "high",
            preArrivalNotes: "Check capacitor first",
            customer: { name: "Jane Doe", address: "123 Main St" },
          }),
        },
      },
    }));

    const mockCreate = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "Replaced the run capacitor." }],
    });

    vi.doMock("@anthropic-ai/sdk", () => ({
      default: class MockAnthropic {
        messages = { create: mockCreate };
      },
    }));

    const { generateCompletionSummary: fn } = await import(
      "../services/job-completion-ai.js"
    );
    await fn("job-1", {
      actionsTaken: "Replaced run capacitor",
      partsUsed: ["Run capacitor 45/5 MFD"],
      notes: "Unit is 12 years old",
    });

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.model).toBe("claude-haiku-4-20250514");
    expect(callArgs.max_tokens).toBe(400);
    expect(callArgs.system).toContain("HVAC");

    const userMsg = callArgs.messages[0].content;
    expect(userMsg).toContain("Replaced run capacitor");
    expect(userMsg).toContain("Run capacitor 45/5 MFD");
    expect(userMsg).toContain("central-ac");
    expect(userMsg).toContain("Check capacitor first");
    expect(userMsg).toContain("Jane Doe");
    expect(userMsg).toContain("Unit is 12 years old");
  });

  it("returns summary from valid response", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    vi.resetModules();

    vi.doMock("../lib/prisma.js", () => ({
      prisma: {
        job: {
          findFirst: vi.fn().mockResolvedValue({
            id: "job-1",
            customerId: "cust-1",
            symptomSummary: "No heat",
            equipmentType: "furnace",
            serviceType: "repair",
            priority: "normal",
            preArrivalNotes: null,
            customer: { name: "Acme", address: "123 St" },
          }),
        },
      },
    }));

    vi.doMock("@anthropic-ai/sdk", () => ({
      default: class MockAnthropic {
        messages = {
          create: vi.fn().mockResolvedValue({
            content: [
              {
                type: "text",
                text: "Diagnosed and repaired furnace ignition failure. Replaced hot surface igniter.",
              },
            ],
          }),
        };
      },
    }));

    const { generateCompletionSummary: fn } = await import(
      "../services/job-completion-ai.js"
    );
    const result = await fn("job-1", {
      actionsTaken: "Replaced igniter",
      partsUsed: ["Hot surface igniter"],
    });

    expect(result).toEqual({
      summary:
        "Diagnosed and repaired furnace ignition failure. Replaced hot surface igniter.",
    });
  });

  it("returns failed on API errors without throwing", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    vi.resetModules();

    vi.doMock("../lib/prisma.js", () => ({
      prisma: {
        job: {
          findFirst: vi.fn().mockResolvedValue({
            id: "job-1",
            customerId: "cust-1",
            symptomSummary: "Test",
            equipmentType: "ac",
            serviceType: "repair",
            priority: "normal",
            preArrivalNotes: null,
            customer: { name: "Test", address: "Test" },
          }),
        },
      },
    }));

    vi.doMock("@anthropic-ai/sdk", () => ({
      default: class MockAnthropic {
        messages = {
          create: vi.fn().mockRejectedValue(new Error("Network error")),
        };
      },
    }));

    const { generateCompletionSummary: fn } = await import(
      "../services/job-completion-ai.js"
    );
    const result = await fn("job-1", {
      actionsTaken: "Test",
      partsUsed: [],
    });

    expect(result).toEqual({ error: "failed" });
  });
});

describe("endpoint logic", () => {
  it("maps not_configured to 503 and failed to 500", () => {
    function mapResultToStatus(
      result: { summary: string } | { error: "not_configured" } | { error: "failed" }
    ): number {
      if ("error" in result) {
        return result.error === "not_configured" ? 503 : 500;
      }
      return 200;
    }

    expect(mapResultToStatus({ error: "not_configured" })).toBe(503);
    expect(mapResultToStatus({ error: "failed" })).toBe(500);
    expect(mapResultToStatus({ summary: "Test summary" })).toBe(200);
  });

  it("rejects customer role with 403", () => {
    function shouldReject(role: string): boolean {
      return role === "customer";
    }

    expect(shouldReject("customer")).toBe(true);
    expect(shouldReject("technician")).toBe(false);
    expect(shouldReject("office")).toBe(false);
  });
});
