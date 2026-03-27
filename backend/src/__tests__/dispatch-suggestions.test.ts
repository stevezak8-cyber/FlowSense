import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    technician: { findMany: vi.fn() },
    job: { findMany: vi.fn(), groupBy: vi.fn() },
  },
}));

vi.mock("../services/google-maps.js", () => ({
  geocodeAddress: vi.fn(),
  getDriveTimesMatrix: vi.fn(),
}));

import { prisma } from "../lib/prisma.js";
import { geocodeAddress, getDriveTimesMatrix } from "../services/google-maps.js";

const mockTech1 = {
  id: "tech-1",
  name: "Jordan Smith",
  skills: ["furnace", "ac"],
  vehicle: { id: "v1", name: "Truck 1" },
  organizationId: "org-1",
};
const mockTech2 = {
  id: "tech-2",
  name: "Maria Garcia",
  skills: ["ac", "heat-pump"],
  vehicle: { id: "v2", name: "Van 2" },
  organizationId: "org-1",
};

const baseRequest = {
  equipmentType: "furnace",
  customerAddress: "123 Main St, Denver, CO 80202",
  scheduledAt: "2026-03-15T14:00:00.000Z",
  customerId: "cust-1",
  priority: "normal" as const,
  organizationId: "org-1",
};

describe("rankTechnicians", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns only skill-matched techs", async () => {
    vi.mocked(prisma.technician.findMany).mockResolvedValue([mockTech1, mockTech2] as any);
    vi.mocked(prisma.job.findMany).mockResolvedValue([]);
    vi.mocked(prisma.job.groupBy).mockResolvedValue([]);
    vi.mocked(geocodeAddress).mockResolvedValue(null);
    vi.mocked(getDriveTimesMatrix).mockResolvedValue([null]);

    const { rankTechnicians } = await import("../services/dispatch-suggestions.js");
    const result = await rankTechnicians(baseRequest);

    // Only tech-1 has "furnace" skill
    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0].technician.id).toBe("tech-1");
    expect(result.suggestions[0].skillMatch).toBe(true);
    expect(result.fallbackMode).toBe(false);
  });

  it("falls back to all techs when no skill match", async () => {
    vi.mocked(prisma.technician.findMany).mockResolvedValue([mockTech1, mockTech2] as any);
    vi.mocked(prisma.job.findMany).mockResolvedValue([]);
    vi.mocked(prisma.job.groupBy).mockResolvedValue([]);
    vi.mocked(geocodeAddress).mockResolvedValue(null);
    vi.mocked(getDriveTimesMatrix).mockResolvedValue([null, null]);

    const { rankTechnicians } = await import("../services/dispatch-suggestions.js");
    const result = await rankTechnicians({ ...baseRequest, equipmentType: "boiler" });

    expect(result.suggestions).toHaveLength(2);
    expect(result.fallbackMode).toBe(true);
    result.suggestions.forEach((s) => expect(s.skillMatch).toBe(false));
  });

  it("computes scores with drive times (50/30/20 weights)", async () => {
    vi.mocked(prisma.technician.findMany).mockResolvedValue([
      { ...mockTech1, skills: ["ac"] },
      { ...mockTech2, skills: ["ac"] },
    ] as any);
    // tech-1 has 2 jobs today, tech-2 has 0 jobs
    vi.mocked(prisma.job.findMany).mockResolvedValue([
      { technicianId: "tech-1", customer: { address: "A", city: "Denver", state: "CO", postalCode: "80202" }, scheduledAt: new Date("2026-03-15T08:00:00Z") },
      { technicianId: "tech-1", customer: { address: "B", city: "Denver", state: "CO", postalCode: "80202" }, scheduledAt: new Date("2026-03-15T10:00:00Z") },
    ] as any);
    vi.mocked(prisma.job.groupBy).mockResolvedValue([]);
    // tech-1: 10 min drive, tech-2: 30 min drive
    vi.mocked(geocodeAddress).mockResolvedValue({ lat: 39.7, lng: -104.9 });
    vi.mocked(getDriveTimesMatrix).mockResolvedValue([10, 30]);

    const { rankTechnicians } = await import("../services/dispatch-suggestions.js");
    const result = await rankTechnicians({ ...baseRequest, equipmentType: "ac" });

    expect(result.driveTimesAvailable).toBe(true);
    expect(result.suggestions).toHaveLength(2);
    // tech-1: driveScore=1.0 (best drive), workloadScore=0.0 (worst workload)
    // tech-2: driveScore=0.0 (worst drive), workloadScore=1.0 (best workload)
    // Both get historyBonus=0
    // tech-1: 1.0*0.5 + 0.0*0.3 + 0.0*0.2 = 0.50
    // tech-2: 0.0*0.5 + 1.0*0.3 + 0.0*0.2 = 0.30
    expect(result.suggestions[0].technician.id).toBe("tech-1");
    expect(result.suggestions[0].score).toBeGreaterThan(result.suggestions[1].score);
  });

  it("shifts weights for urgent priority", async () => {
    vi.mocked(prisma.technician.findMany).mockResolvedValue([
      { ...mockTech1, skills: ["ac"] },
      { ...mockTech2, skills: ["ac"] },
    ] as any);
    vi.mocked(prisma.job.findMany).mockResolvedValue([
      { technicianId: "tech-1", customer: { address: "A", city: "Denver", state: "CO", postalCode: "80202" }, scheduledAt: new Date("2026-03-15T08:00:00Z") },
      { technicianId: "tech-1", customer: { address: "B", city: "Denver", state: "CO", postalCode: "80202" }, scheduledAt: new Date("2026-03-15T10:00:00Z") },
    ] as any);
    vi.mocked(prisma.job.groupBy).mockResolvedValue([]);
    vi.mocked(geocodeAddress).mockResolvedValue({ lat: 39.7, lng: -104.9 });
    vi.mocked(getDriveTimesMatrix).mockResolvedValue([10, 30]);

    const { rankTechnicians } = await import("../services/dispatch-suggestions.js");
    const normalResult = await rankTechnicians({ ...baseRequest, equipmentType: "ac" });
    const urgentResult = await rankTechnicians({ ...baseRequest, equipmentType: "ac", priority: "urgent" });

    // Urgent should boost drive weight (0.60 vs 0.50), making tech-1 (closer) win by more
    const normalGap = normalResult.suggestions[0].score - normalResult.suggestions[1].score;
    const urgentGap = urgentResult.suggestions[0].score - urgentResult.suggestions[1].score;
    expect(urgentGap).toBeGreaterThan(normalGap);
  });

  it("degrades gracefully without Google Maps", async () => {
    vi.mocked(prisma.technician.findMany).mockResolvedValue([mockTech1] as any);
    vi.mocked(prisma.job.findMany).mockResolvedValue([]);
    vi.mocked(prisma.job.groupBy).mockResolvedValue([]);
    vi.mocked(geocodeAddress).mockResolvedValue(null);
    vi.mocked(getDriveTimesMatrix).mockResolvedValue([null]);

    const { rankTechnicians } = await import("../services/dispatch-suggestions.js");
    const result = await rankTechnicians(baseRequest);

    expect(result.driveTimesAvailable).toBe(false);
    expect(result.suggestions[0].driveMinutes).toBeNull();
    expect(result.suggestions[0].score).toBeGreaterThanOrEqual(0);
  });

  it("detects customer history", async () => {
    vi.mocked(prisma.technician.findMany).mockResolvedValue([mockTech1, mockTech2] as any);
    vi.mocked(prisma.job.findMany).mockResolvedValue([]);
    vi.mocked(prisma.job.groupBy).mockResolvedValue([
      { technicianId: "tech-1", _count: { _all: 2 } },
    ] as any);
    vi.mocked(geocodeAddress).mockResolvedValue(null);
    vi.mocked(getDriveTimesMatrix).mockResolvedValue([null, null]);

    const { rankTechnicians } = await import("../services/dispatch-suggestions.js");
    const result = await rankTechnicians({ ...baseRequest, equipmentType: "ac" });

    const tech1 = result.suggestions.find((s) => s.technician.id === "tech-1");
    const tech2 = result.suggestions.find((s) => s.technician.id === "tech-2");
    expect(tech1?.servedCustomerBefore).toBe(true);
    expect(tech2?.servedCustomerBefore).toBe(false);
  });

  it("returns empty array for empty org", async () => {
    vi.mocked(prisma.technician.findMany).mockResolvedValue([]);
    vi.mocked(prisma.job.findMany).mockResolvedValue([]);

    const { rankTechnicians } = await import("../services/dispatch-suggestions.js");
    const result = await rankTechnicians(baseRequest);

    expect(result.suggestions).toEqual([]);
    expect(result.fallbackMode).toBe(false);
  });

  it("handles null drive time for one tech", async () => {
    vi.mocked(prisma.technician.findMany).mockResolvedValue([
      { ...mockTech1, skills: ["ac"] },
      { ...mockTech2, skills: ["ac"] },
    ] as any);
    vi.mocked(prisma.job.findMany).mockResolvedValue([
      { technicianId: "tech-1", customer: { address: "A", city: "Denver", state: "CO", postalCode: "80202" }, scheduledAt: new Date("2026-03-15T08:00:00Z") },
    ] as any);
    vi.mocked(prisma.job.groupBy).mockResolvedValue([]);
    vi.mocked(geocodeAddress).mockResolvedValue({ lat: 39.7, lng: -104.9 });
    // tech-1: 15 min, tech-2: null (geocode failed)
    vi.mocked(getDriveTimesMatrix).mockResolvedValue([15, null]);

    const { rankTechnicians } = await import("../services/dispatch-suggestions.js");
    const result = await rankTechnicians({ ...baseRequest, equipmentType: "ac" });

    expect(result.driveTimesAvailable).toBe(true);
    const tech2 = result.suggestions.find((s) => s.technician.id === "tech-2");
    expect(tech2?.driveMinutes).toBeNull();
    // tech-2 gets worst drive score (0), should rank lower on drive component
  });
});
