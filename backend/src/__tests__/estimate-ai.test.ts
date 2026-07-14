import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    pricebookItem: {
      count: vi.fn(),
      createMany: vi.fn(),
      findMany: vi.fn(),
    },
    job: {
      findFirst: vi.fn(),
    },
    estimate: {
      create: vi.fn(),
    },
  },
}));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    messages = { create: vi.fn() };
  },
}));

import { prisma } from "../lib/prisma.js";

describe("seedPricebook", () => {
  beforeEach(() => vi.clearAllMocks());

  it("skips when ANTHROPIC_API_KEY is not set", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.resetModules();
    const { seedPricebook } = await import("../services/estimate-ai.js");
    await seedPricebook("org-1");
    expect(prisma.pricebookItem.count).not.toHaveBeenCalled();
  });

  it("skips when org already has pricebook items", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    vi.resetModules();
    const { seedPricebook } = await import("../services/estimate-ai.js");
    (prisma.pricebookItem.count as any).mockResolvedValue(5);
    await seedPricebook("org-1");
    expect(prisma.pricebookItem.createMany).not.toHaveBeenCalled();
  });
});

describe("generateEstimate", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns error when AI not configured", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.resetModules();
    const { generateEstimate } = await import("../services/estimate-ai.js");
    const result = await generateEstimate("job-1", "org-1");
    expect(result).toEqual({ error: "not_configured" });
  });

  it("returns error when job not found", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    vi.resetModules();
    const { generateEstimate } = await import("../services/estimate-ai.js");
    (prisma.job.findFirst as any).mockResolvedValue(null);
    const result = await generateEstimate("job-999", "org-1");
    expect(result).toEqual({ error: "job_not_found" });
  });
});
