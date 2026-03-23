# Smart Dispatch Suggestions Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the manual technician dropdown in the Create Job dialog with a ranked suggestion panel that scores technicians by skill match, Google Maps drive time, workload, and customer history.

**Architecture:** Backend scoring service with Google Maps integration returns ranked technician suggestions via a new `POST /api/dispatch/suggest` endpoint. Frontend renders an inline suggestion panel inside the existing Create Job dialog, with graceful fallback to the manual dropdown on error or skip.

**Tech Stack:** Express 4, Prisma 5, Zod, Google Maps REST API (Geocoding + Distance Matrix), React 18, TypeScript, Vitest, Testing Library, shadcn/ui

**Spec:** `docs/superpowers/specs/2026-03-15-smart-dispatch-design.md`

---

## Chunk 1: Backend — Google Maps Module, Dispatch Service, Endpoint, and Tests

### Task 1: Google Maps Module Tests + Implementation

**Files:**
- Create: `backend/src/services/google-maps.ts`
- Create: `backend/src/__tests__/google-maps.test.ts`

- [ ] **Step 1: Write failing tests for google-maps module**

Create `backend/src/__tests__/google-maps.test.ts` with 7 tests:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// We'll dynamically import the module after mocking env vars
describe("google-maps", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.resetModules();
    // Clear the geocode cache between tests by re-importing
    global.fetch = vi.fn();
  });

  describe("geocodeAddress", () => {
    it("returns lat/lng on success", async () => {
      vi.stubEnv("GOOGLE_MAPS_API_KEY", "test-key");
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: "OK",
          results: [{ geometry: { location: { lat: 39.7392, lng: -104.9903 } } }],
        }),
      });

      const { geocodeAddress } = await import("../services/google-maps.js");
      const result = await geocodeAddress("123 Main St, Denver, CO 80202");

      expect(result).toEqual({ lat: 39.7392, lng: -104.9903 });
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]).toContain(
        "maps.googleapis.com/maps/api/geocode"
      );
    });

    it("returns null on bad address (zero results)", async () => {
      vi.stubEnv("GOOGLE_MAPS_API_KEY", "test-key");
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: "ZERO_RESULTS", results: [] }),
      });

      const { geocodeAddress } = await import("../services/google-maps.js");
      const result = await geocodeAddress("not a real address");

      expect(result).toBeNull();
    });

    it("returns null when API key is missing", async () => {
      vi.stubEnv("GOOGLE_MAPS_API_KEY", "");

      const { geocodeAddress } = await import("../services/google-maps.js");
      const result = await geocodeAddress("123 Main St");

      expect(result).toBeNull();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("caches geocode results", async () => {
      vi.stubEnv("GOOGLE_MAPS_API_KEY", "test-key");
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () => ({
          status: "OK",
          results: [{ geometry: { location: { lat: 39.7392, lng: -104.9903 } } }],
        }),
      });

      const { geocodeAddress } = await import("../services/google-maps.js");
      await geocodeAddress("123 Main St, Denver, CO");
      await geocodeAddress("123 Main St, Denver, CO");

      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe("getDriveTimesMatrix", () => {
    it("returns minutes array for multiple origins", async () => {
      vi.stubEnv("GOOGLE_MAPS_API_KEY", "test-key");
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: "OK",
          rows: [
            { elements: [{ status: "OK", duration: { value: 720 } }] },
            { elements: [{ status: "OK", duration: { value: 1500 } }] },
          ],
        }),
      });

      const { getDriveTimesMatrix } = await import("../services/google-maps.js");
      const result = await getDriveTimesMatrix(
        [{ lat: 39.7, lng: -104.9 }, { lat: 40.0, lng: -105.2 }],
        { lat: 39.8, lng: -105.0 }
      );

      expect(result).toEqual([12, 25]); // 720s=12min, 1500s=25min
    });

    it("returns null for failed pairs", async () => {
      vi.stubEnv("GOOGLE_MAPS_API_KEY", "test-key");
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: "OK",
          rows: [
            { elements: [{ status: "OK", duration: { value: 720 } }] },
            { elements: [{ status: "ZERO_RESULTS" }] },
          ],
        }),
      });

      const { getDriveTimesMatrix } = await import("../services/google-maps.js");
      const result = await getDriveTimesMatrix(
        [{ lat: 39.7, lng: -104.9 }, { lat: 0, lng: 0 }],
        { lat: 39.8, lng: -105.0 }
      );

      expect(result).toEqual([12, null]);
    });

    it("returns nulls when API key is missing", async () => {
      vi.stubEnv("GOOGLE_MAPS_API_KEY", "");

      const { getDriveTimesMatrix } = await import("../services/google-maps.js");
      const result = await getDriveTimesMatrix(
        [{ lat: 39.7, lng: -104.9 }, { lat: 40.0, lng: -105.2 }],
        { lat: 39.8, lng: -105.0 }
      );

      expect(result).toEqual([null, null]);
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

Run: `cd backend && npx vitest run src/__tests__/google-maps.test.ts`
Expected: FAIL — cannot find module `../services/google-maps.js`

- [ ] **Step 3: Implement google-maps module**

Create `backend/src/services/google-maps.ts`:

```ts
const apiKey = process.env.GOOGLE_MAPS_API_KEY;

if (!apiKey) {
  console.log("[GoogleMaps] Skipped — no GOOGLE_MAPS_API_KEY set");
}

const geocodeCache = new Map<string, { lat: number; lng: number }>();

export async function geocodeAddress(
  address: string
): Promise<{ lat: number; lng: number } | null> {
  if (!apiKey) return null;

  const cached = geocodeCache.get(address);
  if (cached) return cached;

  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    const data = await res.json();

    if (data.status !== "OK" || !data.results?.length) {
      return null;
    }

    const { lat, lng } = data.results[0].geometry.location;
    const coords = { lat, lng };
    geocodeCache.set(address, coords);
    return coords;
  } catch (error) {
    console.error("[GoogleMaps] Geocode error:", error);
    return null;
  }
}

export async function getDriveTimesMatrix(
  origins: { lat: number; lng: number }[],
  destination: { lat: number; lng: number }
): Promise<(number | null)[]> {
  if (!apiKey || origins.length === 0) {
    return origins.map(() => null);
  }

  try {
    const originsParam = origins.map((o) => `${o.lat},${o.lng}`).join("|");
    const destParam = `${destination.lat},${destination.lng}`;
    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${originsParam}&destinations=${destParam}&mode=driving&departure_time=now&key=${apiKey}`;

    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    const data = await res.json();

    if (data.status !== "OK") {
      console.error("[GoogleMaps] Distance Matrix error:", data.status);
      return origins.map(() => null);
    }

    return data.rows.map(
      (row: { elements: Array<{ status: string; duration?: { value: number } }> }) => {
        const el = row.elements[0];
        if (el.status !== "OK" || !el.duration) return null;
        return Math.round(el.duration.value / 60);
      }
    );
  } catch (error) {
    console.error("[GoogleMaps] Distance Matrix error:", error);
    return origins.map(() => null);
  }
}
```

- [ ] **Step 4: Run tests — verify they pass**

Run: `cd backend && npx vitest run src/__tests__/google-maps.test.ts`
Expected: 7/7 PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/google-maps.ts backend/src/__tests__/google-maps.test.ts
git commit -m "feat: add Google Maps geocoding and distance matrix module"
```

---

### Task 2: Dispatch Suggestion Service Tests + Implementation

**Files:**
- Create: `backend/src/services/dispatch-suggestions.ts`
- Create: `backend/src/__tests__/dispatch-suggestions.test.ts`

- [ ] **Step 1: Write failing tests for dispatch-suggestions service**

Create `backend/src/__tests__/dispatch-suggestions.test.ts` with 8 tests. Each test uses `vi.resetModules()` and `vi.doMock()` to control mocked dependencies:

```ts
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
```

- [ ] **Step 2: Run tests — verify they fail**

Run: `cd backend && npx vitest run src/__tests__/dispatch-suggestions.test.ts`
Expected: FAIL — cannot find module `../services/dispatch-suggestions.js`

- [ ] **Step 3: Implement dispatch-suggestions service**

Create `backend/src/services/dispatch-suggestions.ts`:

```ts
import { prisma } from "../lib/prisma.js";
import { geocodeAddress, getDriveTimesMatrix } from "./google-maps.js";

export interface DispatchRequest {
  equipmentType: string;
  customerAddress: string;
  scheduledAt: string;
  customerId: string;
  priority: string;
  organizationId: string;
}

export interface DispatchSuggestion {
  technician: {
    id: string;
    name: string;
    skills: string[];
    vehicle: { id: string; name: string } | null;
  };
  score: number;
  driveMinutes: number | null;
  todayJobCount: number;
  servedCustomerBefore: boolean;
  skillMatch: boolean;
}

export interface DispatchResult {
  suggestions: DispatchSuggestion[];
  fallbackMode: boolean;
  driveTimesAvailable: boolean;
}

export async function rankTechnicians(
  request: DispatchRequest
): Promise<DispatchResult> {
  try {
    const { equipmentType, customerAddress, scheduledAt, customerId, priority, organizationId } = request;

    // 1. Fetch all org technicians with vehicles
    const technicians = await prisma.technician.findMany({
      where: { organizationId },
      include: { vehicle: true },
    });

    if (technicians.length === 0) {
      return { suggestions: [], fallbackMode: false, driveTimesAvailable: false };
    }

    // 2. Fetch today's active jobs for workload + location resolution
    const scheduledDate = new Date(scheduledAt);
    const dayStart = new Date(scheduledDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(scheduledDate);
    dayEnd.setHours(23, 59, 59, 999);

    const todayJobs = await prisma.job.findMany({
      where: {
        organizationId,
        scheduledAt: { gte: dayStart, lte: dayEnd },
        status: { notIn: ["cancelled", "completed"] },
      },
      include: { customer: true },
    });

    // 3. Skill filter
    let filteredTechs = technicians.filter((t) =>
      t.skills.includes(equipmentType)
    );
    let fallbackMode = false;
    if (filteredTechs.length === 0) {
      filteredTechs = technicians;
      fallbackMode = true;
    }

    const techIds = filteredTechs.map((t) => t.id);

    // 4. Resolve tech locations (last job before scheduledAt)
    const techLocations: Map<string, string> = new Map();
    for (const tech of filteredTechs) {
      const techJobs = todayJobs
        .filter((j) => j.technicianId === tech.id && new Date(j.scheduledAt) < scheduledDate)
        .sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime());

      if (techJobs.length > 0 && techJobs[0].customer) {
        const c = techJobs[0].customer;
        techLocations.set(tech.id, `${c.address}, ${c.city}, ${c.state} ${c.postalCode}`);
      }
    }

    // 5. Geocode + Distance Matrix
    let driveTimesAvailable = false;
    const driveTimesMap: Map<string, number | null> = new Map();

    const destCoords = await geocodeAddress(customerAddress);
    if (destCoords) {
      const originsWithTechId: Array<{ techId: string; address: string }> = [];
      for (const tech of filteredTechs) {
        const addr = techLocations.get(tech.id);
        if (addr) {
          originsWithTechId.push({ techId: tech.id, address: addr });
        }
      }

      if (originsWithTechId.length > 0) {
        const originCoords = await Promise.all(
          originsWithTechId.map((o) => geocodeAddress(o.address))
        );

        const validOrigins: Array<{ techId: string; coords: { lat: number; lng: number } }> = [];
        for (let i = 0; i < originsWithTechId.length; i++) {
          if (originCoords[i]) {
            validOrigins.push({ techId: originsWithTechId[i].techId, coords: originCoords[i]! });
          }
        }

        if (validOrigins.length > 0) {
          const driveTimes = await getDriveTimesMatrix(
            validOrigins.map((o) => o.coords),
            destCoords
          );

          for (let i = 0; i < validOrigins.length; i++) {
            driveTimesMap.set(validOrigins[i].techId, driveTimes[i]);
          }
          driveTimesAvailable = driveTimes.some((t) => t !== null);
        }
      }
    }

    // 6. Customer history (batch query)
    const historyGroups = await prisma.job.groupBy({
      by: ["technicianId"],
      where: {
        customerId,
        status: "completed",
        technicianId: { in: techIds },
      },
      _count: { _all: true },
    });
    const historySet = new Set(historyGroups.map((g) => g.technicianId));

    // 7. Compute workload
    const workloadMap: Map<string, number> = new Map();
    for (const tech of filteredTechs) {
      workloadMap.set(tech.id, todayJobs.filter((j) => j.technicianId === tech.id).length);
    }

    // 8. Score computation
    const isUrgent = priority === "urgent";

    // Collect raw values for normalization
    const allDriveTimes = filteredTechs.map((t) => driveTimesMap.get(t.id) ?? null);
    const allWorkloads = filteredTechs.map((t) => workloadMap.get(t.id) ?? 0);

    const maxDrive = Math.max(...allDriveTimes.filter((t): t is number => t !== null), 1);
    const maxWorkload = Math.max(...allWorkloads, 1);

    const suggestions: DispatchSuggestion[] = filteredTechs.map((tech) => {
      const driveMinutes = driveTimesMap.get(tech.id) ?? null;
      const todayJobCount = workloadMap.get(tech.id) ?? 0;
      const servedCustomerBefore = historySet.has(tech.id);

      let driveScore = 0;
      if (driveTimesAvailable && driveMinutes !== null) {
        driveScore = 1 - driveMinutes / maxDrive;
      }

      const workloadScore = 1 - todayJobCount / maxWorkload;
      const historyBonus = servedCustomerBefore ? 1.0 : 0.0;

      let score: number;
      if (driveTimesAvailable) {
        const dw = isUrgent ? 0.6 : 0.5;
        const ww = isUrgent ? 0.2 : 0.3;
        const hw = 0.2;
        score = driveScore * dw + workloadScore * ww + historyBonus * hw;
      } else {
        score = workloadScore * 0.6 + historyBonus * 0.4;
      }

      return {
        technician: {
          id: tech.id,
          name: tech.name,
          skills: tech.skills,
          vehicle: tech.vehicle ? { id: tech.vehicle.id, name: tech.vehicle.name } : null,
        },
        score: Math.round(score * 100) / 100,
        driveMinutes,
        todayJobCount,
        servedCustomerBefore,
        skillMatch: !fallbackMode,
      };
    });

    suggestions.sort((a, b) => b.score - a.score);

    return { suggestions, fallbackMode, driveTimesAvailable };
  } catch (error) {
    console.error("[Dispatch] Error ranking technicians:", error);
    return { suggestions: [], fallbackMode: false, driveTimesAvailable: false };
  }
}
```

- [ ] **Step 4: Run tests — verify they pass**

Run: `cd backend && npx vitest run src/__tests__/dispatch-suggestions.test.ts`
Expected: 8/8 PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/dispatch-suggestions.ts backend/src/__tests__/dispatch-suggestions.test.ts
git commit -m "feat: add dispatch suggestion ranking service"
```

---

### Task 3: API Endpoint Tests + Implementation + Route Mounting

**Files:**
- Create: `backend/src/routes/dispatch.ts`
- Create: `backend/src/__tests__/dispatch-endpoint.test.ts`
- Modify: `backend/src/index.ts` (add route mount)

- [ ] **Step 1: Write failing endpoint tests**

Create `backend/src/__tests__/dispatch-endpoint.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

vi.mock("../services/dispatch-suggestions.js", () => ({
  rankTechnicians: vi.fn(),
}));

import { rankTechnicians } from "../services/dispatch-suggestions.js";

// Build a mini Express app with auth middleware for testing
function buildApp() {
  const app = express();
  app.use(express.json());
  return app;
}

describe("POST /api/dispatch/suggest", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    vi.doMock("../services/dispatch-suggestions.js", () => ({
      rankTechnicians: vi.fn().mockResolvedValue({
        suggestions: [
          {
            technician: { id: "t1", name: "Jordan", skills: ["furnace"], vehicle: null },
            score: 0.92,
            driveMinutes: 12,
            todayJobCount: 2,
            servedCustomerBefore: false,
            skillMatch: true,
          },
        ],
        fallbackMode: false,
        driveTimesAvailable: true,
      }),
    }));

    const { dispatchRouter } = await import("../routes/dispatch.js");

    app = buildApp();
    // Simulate requireAuth middleware
    app.use((req, _res, next) => {
      (req as any).user = { userId: "u1", organizationId: "org-1", role: "office" };
      next();
    });
    app.use("/api/dispatch", dispatchRouter);
  });

  it("returns 200 with ranked suggestions", async () => {
    const res = await request(app)
      .post("/api/dispatch/suggest")
      .send({
        equipmentType: "furnace",
        customerAddress: "123 Main St, Denver, CO 80202",
        scheduledAt: "2026-03-15T14:00:00.000Z",
        customerId: "cust-1",
        priority: "normal",
      });

    expect(res.status).toBe(200);
    expect(res.body.suggestions).toHaveLength(1);
    expect(res.body.suggestions[0].technician.name).toBe("Jordan");
    expect(res.body.fallbackMode).toBe(false);
    expect(res.body.driveTimesAvailable).toBe(true);
  });

  it("returns 403 for customer role", async () => {
    // Rebuild app with customer role
    const { dispatchRouter } = await import("../routes/dispatch.js");
    const customerApp = buildApp();
    customerApp.use((req, _res, next) => {
      (req as any).user = { userId: "u2", organizationId: "org-1", role: "customer" };
      next();
    });
    customerApp.use("/api/dispatch", dispatchRouter);

    const res = await request(customerApp)
      .post("/api/dispatch/suggest")
      .send({
        equipmentType: "furnace",
        customerAddress: "123 Main St, Denver, CO 80202",
        scheduledAt: "2026-03-15T14:00:00.000Z",
        customerId: "cust-1",
        priority: "normal",
      });

    expect(res.status).toBe(403);
  });

  it("returns 400 for missing required fields", async () => {
    const res = await request(app)
      .post("/api/dispatch/suggest")
      .send({ priority: "normal" });

    expect(res.status).toBe(400);
  });

  it("passes organizationId from auth context", async () => {
    const { rankTechnicians: mockRank } = await import(
      "../services/dispatch-suggestions.js"
    );

    await request(app)
      .post("/api/dispatch/suggest")
      .send({
        equipmentType: "furnace",
        customerAddress: "123 Main St, Denver, CO 80202",
        scheduledAt: "2026-03-15T14:00:00.000Z",
        customerId: "cust-1",
        priority: "normal",
      });

    expect(vi.mocked(mockRank)).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org-1" })
    );
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

Run: `cd backend && npx vitest run src/__tests__/dispatch-endpoint.test.ts`
Expected: FAIL — cannot find module `../routes/dispatch.js`

- [ ] **Step 3: Implement dispatch route**

Create `backend/src/routes/dispatch.ts`:

```ts
import { Router } from "express";
import { z } from "zod";
import { rankTechnicians } from "../services/dispatch-suggestions.js";

export const dispatchRouter = Router();

const dispatchSuggestSchema = z.object({
  equipmentType: z.string().min(1),
  customerAddress: z.string().min(1),
  scheduledAt: z.string().datetime(),
  customerId: z.string().min(1),
  priority: z.enum(["low", "normal", "high", "urgent"]),
});

dispatchRouter.post("/suggest", async (req, res) => {
  try {
    if (req.user!.role === "customer") {
      return res.status(403).json({ error: "Customers cannot access dispatch suggestions" });
    }

    const parsed = dispatchSuggestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const result = await rankTechnicians({
      ...parsed.data,
      organizationId: req.user!.organizationId,
    });

    return res.json(result);
  } catch (error) {
    console.error("[Dispatch] Endpoint error:", error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to get dispatch suggestions",
    });
  }
});
```

- [ ] **Step 4: Mount route in index.ts**

Add to `backend/src/index.ts` after the existing route mounts:

```ts
import { dispatchRouter } from "./routes/dispatch.js";
// Add with other app.use() calls:
app.use("/api/dispatch", requireAuth, dispatchRouter);
```

- [ ] **Step 5: Run endpoint tests — verify they pass**

Run: `cd backend && npx vitest run src/__tests__/dispatch-endpoint.test.ts`
Expected: 4/4 PASS

- [ ] **Step 6: Run full backend test suite**

Run: `cd backend && npx vitest run`
Expected: All tests pass (existing + new google-maps + dispatch-suggestions + dispatch-endpoint)

- [ ] **Step 7: Run type check**

Run: `cd backend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 8: Commit**

```bash
git add backend/src/routes/dispatch.ts backend/src/__tests__/dispatch-endpoint.test.ts backend/src/index.ts
git commit -m "feat: add POST /api/dispatch/suggest endpoint"
```

---

## Chunk 2: Frontend — Suggestion Panel, Dialog Integration, Seed Data, and Tests

### Task 4: Seed Data Updates

**Files:**
- Modify: `backend/prisma/seed.ts`

- [ ] **Step 1: Add vehicles for seed-tech-2 and seed-tech-3, plus dispatch demo job**

In `backend/prisma/seed.ts`, add after the existing `seed-vehicle-1` upsert block:

```ts
await prisma.vehicle.upsert({
  where: { id: "seed-vehicle-2" },
  create: {
    id: "seed-vehicle-2",
    organizationId: org.id,
    technicianId: "seed-tech-2",
    name: "Van 2",
  },
  update: {},
});

await prisma.vehicle.upsert({
  where: { id: "seed-vehicle-3" },
  create: {
    id: "seed-vehicle-3",
    organizationId: org.id,
    technicianId: "seed-tech-3",
    name: "Van 3",
  },
  update: {},
});
```

Also add a dispatch demo job (after the existing job upserts):

```ts
await prisma.job.upsert({
  where: { id: "seed-job-dispatch-demo" },
  create: {
    id: "seed-job-dispatch-demo",
    organizationId: org.id,
    customerId: "seed-customer-2",
    technicianId: "seed-tech-2",
    status: "scheduled",
    scheduledAt: new Date(new Date().setHours(8, 0, 0, 0)),
    symptomSummary: "AC unit making noise during operation",
    equipmentType: "ac",
    priority: "normal",
  },
  update: {},
});
```

- [ ] **Step 2: Run seed**

Run: `cd backend && npx prisma db seed`
Expected: "Seed complete!"

- [ ] **Step 3: Commit**

```bash
git add backend/prisma/seed.ts
git commit -m "feat: add vehicles and dispatch demo job to seed data"
```

---

### Task 5: Frontend Types + Dispatch Suggestion Panel Component

**Files:**
- Modify: `frontend/src/api/types.ts`
- Create: `frontend/src/components/jobs/dispatch-suggestions.tsx`

- [ ] **Step 1: Add dispatch types to types.ts**

Add at the end of `frontend/src/api/types.ts`:

```ts
export interface DispatchSuggestion {
  technician: {
    id: string
    name: string
    skills: string[]
    vehicle: { id: string; name: string } | null
  }
  score: number
  driveMinutes: number | null
  todayJobCount: number
  servedCustomerBefore: boolean
  skillMatch: boolean
}

export interface DispatchResult {
  suggestions: DispatchSuggestion[]
  fallbackMode: boolean
  driveTimesAvailable: boolean
}
```

- [ ] **Step 2: Create dispatch-suggestions.tsx component**

Create `frontend/src/components/jobs/dispatch-suggestions.tsx`:

```tsx
import { useEffect, useState, useRef } from "react"
import { api } from "@/api/client"
import type { DispatchResult, DispatchSuggestion } from "@/api/types"
import { toast } from "sonner"

interface DispatchSuggestionsProps {
  equipmentType: string | null
  customerAddress: string | null
  scheduledAt: string | null
  customerId: string | null
  priority: string
  selectedTechId: string | null
  onSelect: (technicianId: string | null) => void
  onSkip: () => void
  onError: () => void
}

export function DispatchSuggestions({
  equipmentType,
  customerAddress,
  scheduledAt,
  customerId,
  priority,
  selectedTechId,
  onSelect,
  onSkip,
  onError,
}: DispatchSuggestionsProps) {
  const [result, setResult] = useState<DispatchResult | null>(null)
  const [loading, setLoading] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!equipmentType || !customerId || !customerAddress || !scheduledAt) {
      setResult(null)
      return
    }

    // Debounce API calls
    if (debounceRef.current) clearTimeout(debounceRef.current)

    debounceRef.current = setTimeout(async () => {
      // Abort previous request
      if (abortRef.current) abortRef.current.abort()
      abortRef.current = new AbortController()

      setLoading(true)
      try {
        const data = await api.post<DispatchResult>("/api/dispatch/suggest", {
          equipmentType,
          customerAddress,
          scheduledAt,
          customerId,
          priority,
        })
        setResult(data)
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") return
        toast.error("Failed to load dispatch suggestions")
        onError()
      } finally {
        setLoading(false)
      }
    }, 300)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      if (abortRef.current) abortRef.current.abort()
    }
  }, [equipmentType, customerId, customerAddress, scheduledAt, priority])

  // Idle state
  if (!equipmentType || !customerId) {
    return (
      <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
        Select equipment type and customer to see technician suggestions
      </div>
    )
  }

  // Loading state
  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-16 animate-pulse rounded-lg bg-muted"
          />
        ))}
      </div>
    )
  }

  // Error already handled via onError callback

  // Empty state
  if (result && result.suggestions.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
        No technicians available
      </div>
    )
  }

  if (!result) return null

  return (
    <div className="space-y-2">
      {/* Fallback warning */}
      {result.fallbackMode && (
        <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-sm">
          <span>⚠️</span>
          <div>
            <span className="font-medium text-amber-600">
              No techs with {equipmentType} skills
            </span>
            <span className="text-muted-foreground">
              {" "}— showing all available
            </span>
          </div>
        </div>
      )}

      {/* Degraded mode note */}
      {!result.driveTimesAvailable && !result.fallbackMode && (
        <p className="text-xs text-muted-foreground">
          Drive times unavailable — ranked by workload and history
        </p>
      )}

      {/* Suggestion header */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>ASSIGN TECHNICIAN</span>
        <span>Ranked by skill match, drive time & workload</span>
      </div>

      {/* Suggestion rows */}
      {result.suggestions.map((suggestion, index) => (
        <SuggestionRow
          key={suggestion.technician.id}
          suggestion={suggestion}
          index={index}
          isSelected={selectedTechId === suggestion.technician.id}
          showDriveTime={result.driveTimesAvailable}
          onClick={() => {
            if (selectedTechId === suggestion.technician.id) {
              onSelect(null)
            } else {
              onSelect(suggestion.technician.id)
            }
          }}
        />
      ))}

      {/* Skip link */}
      <div className="text-center">
        <button
          type="button"
          onClick={onSkip}
          className="text-xs text-muted-foreground underline hover:text-foreground"
        >
          Skip suggestions
        </button>
      </div>
    </div>
  )
}

function SuggestionRow({
  suggestion,
  index,
  isSelected,
  showDriveTime,
  onClick,
}: {
  suggestion: DispatchSuggestion
  index: number
  isSelected: boolean
  showDriveTime: boolean
  onClick: () => void
}) {
  const { technician, score, driveMinutes, todayJobCount, servedCustomerBefore, skillMatch } =
    suggestion

  const initials = technician.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()

  const colors = ["bg-indigo-600", "bg-violet-600", "bg-purple-600", "bg-blue-600"]
  const bgColor = colors[index % colors.length]

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center justify-between rounded-lg border p-3 text-left transition-colors hover:bg-accent/50 ${
        isSelected ? "border-primary bg-primary/5" : "border-border"
      }`}
    >
      <div className="flex items-center gap-3">
        <div
          className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white ${bgColor}`}
        >
          {initials}
        </div>
        <div>
          <div className="text-sm font-semibold">{technician.name}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs">
            {skillMatch ? (
              <span className="text-green-600">
                ✓ {suggestion.technician.skills.join(", ")}
              </span>
            ) : (
              <span className="text-red-500">⚠ No skill match</span>
            )}
            {showDriveTime && driveMinutes !== null && (
              <span className="text-muted-foreground">🚗 {driveMinutes} min</span>
            )}
            <span className="text-muted-foreground">
              📋 {todayJobCount} job{todayJobCount !== 1 ? "s" : ""} today
            </span>
            {servedCustomerBefore && (
              <span className="text-amber-500">⟲ Returning</span>
            )}
          </div>
        </div>
      </div>
      <div className="flex flex-col items-end gap-1">
        {index === 0 && (
          <span className="rounded-full bg-green-500 px-2 py-0.5 text-[10px] font-bold text-black">
            BEST MATCH
          </span>
        )}
        <span className="text-xs text-muted-foreground">
          Score: {Math.round(score * 100)}
        </span>
      </div>
    </button>
  )
}
```

- [ ] **Step 3: Run type check**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/api/types.ts frontend/src/components/jobs/dispatch-suggestions.tsx
git commit -m "feat: add dispatch suggestions panel component"
```

---

### Task 6: Integrate Suggestions into Create Job Dialog

**Files:**
- Modify: `frontend/src/components/jobs/create-job-dialog.tsx`

- [ ] **Step 1: Add import and state for dispatch suggestions**

At the top of `create-job-dialog.tsx`, add the import:

```ts
import { DispatchSuggestions } from "./dispatch-suggestions"
```

In the component body, add state variables (after existing state declarations):

```ts
const [showSuggestions, setShowSuggestions] = useState(true)
```

- [ ] **Step 2: Derive customerAddress from selected customer**

Add a derived value after the state declarations:

```ts
const selectedCustomer = customers.find((c) => c.id === customerId)
const customerAddress = selectedCustomer
  ? `${selectedCustomer.address}, ${selectedCustomer.city}, ${selectedCustomer.state} ${selectedCustomer.postalCode}`
  : null
```

- [ ] **Step 3: Reset showSuggestions when inputs change**

Add a useEffect to re-show suggestions when key inputs change:

```ts
useEffect(() => {
  setShowSuggestions(true)
}, [equipmentType, customerId])
```

- [ ] **Step 4: Replace technician Select with conditional render**

Replace the existing technician `<Select>` block (lines 145-162 of `create-job-dialog.tsx`) with this conditional render. The existing `<Select>` markup is preserved in the fallback branch:

```tsx
{showSuggestions ? (
  <DispatchSuggestions
    equipmentType={equipmentType || null}
    customerAddress={customerAddress}
    scheduledAt={scheduledAt ? new Date(`${scheduledAt}T${scheduledTime || "09:00"}`).toISOString() : null}
    customerId={customerId || null}
    priority={priority}
    selectedTechId={technicianId || null}
    onSelect={(id) => setTechnicianId(id ?? "")}
    onSkip={() => setShowSuggestions(false)}
    onError={() => setShowSuggestions(false)}
  />
) : (
  <div className="space-y-1.5">
    <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
      Assign Technician
    </label>
    <Select value={technicianId} onValueChange={setTechnicianId}>
      <SelectTrigger className="h-10 bg-secondary border-border text-foreground text-xs">
        <SelectValue placeholder="Unassigned (optional)" />
      </SelectTrigger>
      <SelectContent className="bg-card border-border">
        {technicians.map((t) => (
          <SelectItem key={t.id} value={t.id} className="text-xs text-foreground">
            {t.name}{t.skills.length > 0 ? ` (${t.skills.join(", ")})` : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>
)}
```

The existing `<Select>` for technician stays in the code — it's now the fallback path shown when suggestions are skipped or errored.

- [ ] **Step 5: Run type check**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/jobs/create-job-dialog.tsx
git commit -m "feat: integrate dispatch suggestions into create job dialog"
```

---

### Task 7: Frontend Tests

**Files:**
- Create: `frontend/src/components/jobs/__tests__/dispatch-suggestions.test.tsx`

- [ ] **Step 1: Write frontend component tests**

Create `frontend/src/components/jobs/__tests__/dispatch-suggestions.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { DispatchSuggestions } from "../dispatch-suggestions"

// Mock the API client
vi.mock("@/api/client", () => ({
  api: {
    post: vi.fn(),
  },
}))

// Mock sonner toast
vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}))

import { api } from "@/api/client"

const mockResult = {
  suggestions: [
    {
      technician: { id: "t1", name: "Jordan Smith", skills: ["furnace", "ac"], vehicle: { id: "v1", name: "Truck 1" } },
      score: 0.92,
      driveMinutes: 12,
      todayJobCount: 2,
      servedCustomerBefore: false,
      skillMatch: true,
    },
    {
      technician: { id: "t2", name: "Maria Garcia", skills: ["ac", "heat-pump"], vehicle: { id: "v2", name: "Van 2" } },
      score: 0.78,
      driveMinutes: 25,
      todayJobCount: 1,
      servedCustomerBefore: true,
      skillMatch: true,
    },
  ],
  fallbackMode: false,
  driveTimesAvailable: true,
}

const defaultProps = {
  equipmentType: "furnace",
  customerAddress: "123 Main St, Denver, CO 80202",
  scheduledAt: "2026-03-15T14:00:00.000Z",
  customerId: "cust-1",
  priority: "normal",
  selectedTechId: null,
  onSelect: vi.fn(),
  onSkip: vi.fn(),
  onError: vi.fn(),
}

describe("DispatchSuggestions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("shows placeholder when equipmentType is null", () => {
    render(<DispatchSuggestions {...defaultProps} equipmentType={null} />)
    expect(screen.getByText(/select equipment type/i)).toBeInTheDocument()
  })

  it("shows placeholder when customerId is null", () => {
    render(<DispatchSuggestions {...defaultProps} customerId={null} />)
    expect(screen.getByText(/select equipment type/i)).toBeInTheDocument()
  })

  it("shows loading skeleton during fetch", async () => {
    vi.mocked(api.post).mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(mockResult), 1000))
    )

    render(<DispatchSuggestions {...defaultProps} />)

    // Advance past debounce
    await vi.advanceTimersByTimeAsync(350)

    // Should show loading skeletons
    const skeletons = document.querySelectorAll(".animate-pulse")
    expect(skeletons.length).toBe(3)
  })

  it("renders ranked suggestions with scores and badges", async () => {
    vi.mocked(api.post).mockResolvedValue(mockResult)

    render(<DispatchSuggestions {...defaultProps} />)

    await vi.advanceTimersByTimeAsync(350)

    await waitFor(() => {
      expect(screen.getByText("Jordan Smith")).toBeInTheDocument()
      expect(screen.getByText("Maria Garcia")).toBeInTheDocument()
    })

    expect(screen.getByText("BEST MATCH")).toBeInTheDocument()
    expect(screen.getByText("Score: 92")).toBeInTheDocument()
    expect(screen.getByText("🚗 12 min")).toBeInTheDocument()
    expect(screen.getByText("⟲ Returning")).toBeInTheDocument()
  })

  it("calls onSelect when clicking a suggestion row", async () => {
    vi.mocked(api.post).mockResolvedValue(mockResult)
    const onSelect = vi.fn()

    render(<DispatchSuggestions {...defaultProps} onSelect={onSelect} />)

    await vi.advanceTimersByTimeAsync(350)

    await waitFor(() => {
      expect(screen.getByText("Jordan Smith")).toBeInTheDocument()
    })

    await userEvent.click(screen.getByText("Jordan Smith"))
    expect(onSelect).toHaveBeenCalledWith("t1")
  })

  it("shows fallback warning banner when fallbackMode is true", async () => {
    vi.mocked(api.post).mockResolvedValue({
      ...mockResult,
      fallbackMode: true,
      suggestions: mockResult.suggestions.map((s) => ({ ...s, skillMatch: false })),
    })

    render(<DispatchSuggestions {...defaultProps} />)

    await vi.advanceTimersByTimeAsync(350)

    await waitFor(() => {
      expect(screen.getByText(/no techs with furnace skills/i)).toBeInTheDocument()
    })
  })

  it("calls onSkip when clicking Skip suggestions", async () => {
    vi.mocked(api.post).mockResolvedValue(mockResult)
    const onSkip = vi.fn()

    render(<DispatchSuggestions {...defaultProps} onSkip={onSkip} />)

    await vi.advanceTimersByTimeAsync(350)

    await waitFor(() => {
      expect(screen.getByText("Skip suggestions")).toBeInTheDocument()
    })

    await userEvent.click(screen.getByText("Skip suggestions"))
    expect(onSkip).toHaveBeenCalledTimes(1)
  })

  it("calls onError on API failure", async () => {
    vi.mocked(api.post).mockRejectedValue(new Error("Network error"))
    const onError = vi.fn()

    render(<DispatchSuggestions {...defaultProps} onError={onError} />)

    await vi.advanceTimersByTimeAsync(350)

    await waitFor(() => {
      expect(onError).toHaveBeenCalledTimes(1)
    })
  })
})
```

- [ ] **Step 2: Run frontend tests**

Run: `cd frontend && npx vitest run`
Expected: All tests pass (existing + new dispatch-suggestions tests)

- [ ] **Step 3: Run frontend type check**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/jobs/__tests__/dispatch-suggestions.test.tsx
git commit -m "test: add dispatch suggestions frontend tests"
```

---

### Task 8: Full Verification

**Files:** None (verification only)

- [ ] **Step 1: Re-seed database**

Run: `cd backend && npx prisma db seed`
Expected: "Seed complete!"

- [ ] **Step 2: Run full backend test suite**

Run: `cd backend && npx vitest run`
Expected: All tests pass

- [ ] **Step 3: Run full frontend test suite**

Run: `cd frontend && npx vitest run`
Expected: All tests pass

- [ ] **Step 4: Run both type checks**

Run: `cd backend && npx tsc --noEmit && cd ../frontend && npx tsc --noEmit`
Expected: No errors in either

- [ ] **Step 5: Visual verification**

Start dev servers and verify:
1. Log in as office user (office@flowsense.demo / office123)
2. Click "Create Job" button
3. Select equipment type "furnace" and customer "Acme Residence"
4. Verify dispatch suggestion panel appears with ranked technicians
5. Verify Jordan Smith shows "BEST MATCH" badge (has furnace skill)
6. Verify Maria Garcia does NOT appear (no furnace skill — hard filter)
7. Verify Tyler Brooks appears (has furnace skill)
8. Click a suggestion row — verify it highlights
9. Click "Skip suggestions" — verify manual dropdown appears
10. Change equipment type — verify suggestions re-appear with new ranking
