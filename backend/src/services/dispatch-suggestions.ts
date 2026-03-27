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

    // 5. Geocode destination + build origins for all filtered techs
    let driveTimesAvailable = false;
    const driveTimesMap: Map<string, number | null> = new Map();

    const destCoords = await geocodeAddress(customerAddress);
    if (destCoords) {
      // Build origin geocode requests for all filtered techs that have a known location
      const techOriginAddresses: Array<{ techId: string; address: string }> = [];
      for (const tech of filteredTechs) {
        const addr = techLocations.get(tech.id);
        if (addr) {
          techOriginAddresses.push({ techId: tech.id, address: addr });
        }
      }

      if (techOriginAddresses.length > 0) {
        // Geocode all origins in parallel
        const geocodedOrigins = await Promise.all(
          techOriginAddresses.map((o) => geocodeAddress(o.address))
        );

        // Build list of valid origins preserving index -> techId mapping
        const validOriginIndices: number[] = [];
        const validOriginCoords: { lat: number; lng: number }[] = [];
        for (let i = 0; i < techOriginAddresses.length; i++) {
          if (geocodedOrigins[i]) {
            validOriginIndices.push(i);
            validOriginCoords.push(geocodedOrigins[i]!);
          }
        }

        if (validOriginCoords.length > 0) {
          // Call matrix with all valid origins at once
          // The matrix returns one result per origin in the same order
          const matrixResults = await getDriveTimesMatrix(
            validOriginCoords,
            destCoords
          );

          // Map matrix results back to techIds
          for (let ri = 0; ri < validOriginIndices.length; ri++) {
            const origIdx = validOriginIndices[ri];
            const techId = techOriginAddresses[origIdx].techId;
            driveTimesMap.set(techId, matrixResults[ri]);
          }

          driveTimesAvailable = matrixResults.some((t) => t !== null);
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

    // Min-max normalization for drive times (lower is better -> inverted)
    const validDriveTimes = allDriveTimes.filter((t): t is number => t !== null);
    const minDrive = validDriveTimes.length > 0 ? Math.min(...validDriveTimes) : 0;
    const maxDrive = validDriveTimes.length > 0 ? Math.max(...validDriveTimes) : 0;
    const driveRange = maxDrive - minDrive;

    // Min-max normalization for workload (lower is better -> inverted)
    const maxWorkload = Math.max(...allWorkloads, 1);

    const suggestions: DispatchSuggestion[] = filteredTechs.map((tech) => {
      const driveMinutes = driveTimesMap.get(tech.id) ?? null;
      const todayJobCount = workloadMap.get(tech.id) ?? 0;
      const servedCustomerBefore = historySet.has(tech.id);

      let driveScore = 0;
      if (driveTimesAvailable && driveMinutes !== null) {
        if (driveRange > 0) {
          // Min-max: best (lowest) drive time scores 1.0, worst scores 0.0
          driveScore = (maxDrive - driveMinutes) / driveRange;
        } else {
          // All techs have same drive time
          driveScore = 1.0;
        }
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
