import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Prisma
vi.mock("../lib/prisma.js", () => ({
  prisma: {
    job: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

// Mock the Anthropic SDK
vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      messages: {
        create: vi.fn(),
      },
    })),
  };
});

import { prisma } from "../lib/prisma.js";
import { generatePreArrival } from "../services/pre-arrival.js";

describe("generatePreArrival", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset env for each test
    vi.unstubAllEnvs();
  });

  it("skips when ANTHROPIC_API_KEY is not set", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");

    // Re-import to pick up env change — use dynamic import
    vi.resetModules();
    const { generatePreArrival: fn } = await import("../services/pre-arrival.js");

    await fn("job-1");

    // Should not call Prisma at all
    expect(prisma.job.findFirst).not.toHaveBeenCalled();
  });

  it("builds correct prompt with job details and customer history", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    vi.resetModules();

    // Re-mock after reset
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
            equipmentNotes: "Unit is 12 years old",
            customer: { name: "Jane Doe", address: "123 Main St", notes: null },
            technician: { name: "Jordan Smith" },
          }),
          findMany: vi.fn().mockResolvedValue([
            {
              symptomSummary: "Weak airflow",
              summary: "Replaced filter",
              actionsTaken: "Changed air filter",
              partsUsed: ["Air filter 20x25"],
              equipmentType: "central-ac",
              completedAt: new Date("2025-09-01"),
            },
          ]),
          update: vi.fn(),
        },
      },
    }));

    const mockCreate = vi.fn().mockResolvedValue({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            preArrivalNotes: "Test briefing",
            suggestedParts: ["Capacitor"],
            suggestedTools: ["Multimeter"],
            riskFlags: ["Repeat issue"],
          }),
        },
      ],
    });

    vi.doMock("@anthropic-ai/sdk", () => ({
      default: vi.fn().mockImplementation(() => ({
        messages: { create: mockCreate },
      })),
    }));

    const { generatePreArrival: fn } = await import("../services/pre-arrival.js");
    await fn("job-1");

    // Verify the Anthropic SDK was called
    expect(mockCreate).toHaveBeenCalledTimes(1);

    // Verify the call includes the model and system/user messages
    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.model).toBe("claude-haiku-4-20250514");
    expect(callArgs.max_tokens).toBe(800);
    expect(callArgs.system).toContain("HVAC");

    // Verify user message includes job context
    const userMsg = callArgs.messages[0].content;
    expect(userMsg).toContain("No cooling");
    expect(userMsg).toContain("central-ac");
    expect(userMsg).toContain("Jane Doe");
    // Verify it includes history
    expect(userMsg).toContain("Weak airflow");
  });

  it("parses valid JSON response and updates the job record", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    vi.resetModules();

    const mockUpdate = vi.fn();

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
            equipmentNotes: null,
            customer: { name: "Acme", address: "123 St", notes: null },
            technician: null,
          }),
          findMany: vi.fn().mockResolvedValue([]),
          update: mockUpdate,
        },
      },
    }));

    vi.doMock("@anthropic-ai/sdk", () => ({
      default: vi.fn().mockImplementation(() => ({
        messages: {
          create: vi.fn().mockResolvedValue({
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  preArrivalNotes: "Furnace not igniting. Check igniter and flame sensor.",
                  suggestedParts: ["Hot surface igniter", "Flame sensor"],
                  suggestedTools: ["Multimeter", "Combustion analyzer"],
                  riskFlags: ["Gas appliance — verify gas shutoff location"],
                }),
              },
            ],
          }),
        },
      })),
    }));

    const { generatePreArrival: fn } = await import("../services/pre-arrival.js");
    await fn("job-1");

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "job-1" },
      data: {
        preArrivalNotes: "Furnace not igniting. Check igniter and flame sensor.",
        suggestedParts: ["Hot surface igniter", "Flame sensor"],
        suggestedTools: ["Multimeter", "Combustion analyzer"],
        riskFlags: ["Gas appliance — verify gas shutoff location"],
      },
    });
  });

  it("handles malformed JSON response without throwing", async () => {
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
            equipmentNotes: null,
            customer: { name: "Test", address: "Test", notes: null },
            technician: null,
          }),
          findMany: vi.fn().mockResolvedValue([]),
          update: vi.fn(),
        },
      },
    }));

    vi.doMock("@anthropic-ai/sdk", () => ({
      default: vi.fn().mockImplementation(() => ({
        messages: {
          create: vi.fn().mockResolvedValue({
            content: [{ type: "text", text: "This is not valid JSON at all" }],
          }),
        },
      })),
    }));

    const mod = await import("../lib/prisma.js");
    const { generatePreArrival: fn } = await import("../services/pre-arrival.js");

    // Should NOT throw
    await expect(fn("job-1")).resolves.toBeUndefined();

    // Should NOT update the job with garbage
    expect(mod.prisma.job.update).not.toHaveBeenCalled();
  });

  it("handles API errors without throwing", async () => {
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
            equipmentNotes: null,
            customer: { name: "Test", address: "Test", notes: null },
            technician: null,
          }),
          findMany: vi.fn().mockResolvedValue([]),
          update: vi.fn(),
        },
      },
    }));

    vi.doMock("@anthropic-ai/sdk", () => ({
      default: vi.fn().mockImplementation(() => ({
        messages: {
          create: vi.fn().mockRejectedValue(new Error("Network error")),
        },
      })),
    }));

    const { generatePreArrival: fn } = await import("../services/pre-arrival.js");

    // Should NOT throw
    await expect(fn("job-1")).resolves.toBeUndefined();
  });
});
