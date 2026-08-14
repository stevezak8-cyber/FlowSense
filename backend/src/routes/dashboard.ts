import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { getAtRiskReasons, getAnalyticsNarrative } from "../services/analytics-ai.js";
import type { AnalyticsTrends } from "../services/analytics-ai.js";

export const dashboardRouter = Router();

// GET /api/dashboard/stats
dashboardRouter.get("/stats", async (req, res) => {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // Sunday
    const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      totalJobs,
      activeJobs,
      completedToday,
      scheduledThisWeek,
      urgentJobs,
      totalTechnicians,
      totalCustomers,
      completedJobs,
    ] = await Promise.all([
      prisma.job.count({ where: { organizationId: req.user!.organizationId } }),
      prisma.job.count({
        where: {
          organizationId: req.user!.organizationId,
          status: { in: ["scheduled", "en_route", "in_progress"] },
        },
      }),
      prisma.job.count({
        where: {
          organizationId: req.user!.organizationId,
          status: "completed",
          completedAt: { gte: todayStart, lt: todayEnd },
        },
      }),
      prisma.job.count({
        where: {
          organizationId: req.user!.organizationId,
          scheduledAt: { gte: weekStart, lt: weekEnd },
        },
      }),
      prisma.job.count({
        where: { organizationId: req.user!.organizationId, priority: "urgent", status: { not: "completed" } },
      }),
      prisma.technician.count({ where: { organizationId: req.user!.organizationId } }),
      prisma.customer.count({ where: { organizationId: req.user!.organizationId } }),
      prisma.job.count({ where: { organizationId: req.user!.organizationId, status: "completed" } }),
    ]);

    // Revenue MTD from invoices
    const revenueResult = await prisma.invoice.aggregate({
      where: {
        organizationId: req.user!.organizationId,
        status: "paid",
        issuedDate: { gte: monthStart },
      },
      _sum: { amount: true },
    });
    const revenueMtd = revenueResult._sum.amount ?? 0;

    res.json({
      totalJobs,
      activeJobs,
      completedToday,
      scheduledThisWeek,
      urgentJobs,
      totalTechnicians,
      totalCustomers,
      completedJobs,
      revenueMtd,
    });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Failed to get stats" });
  }
});

// GET /api/dashboard/chart - weekly job volume
dashboardRouter.get("/chart", async (req, res) => {
  try {
    const now = new Date();
    const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // Sunday

    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const chartData = [];

    for (let i = 0; i < 7; i++) {
      const dayStart = new Date(weekStart.getTime() + i * 24 * 60 * 60 * 1000);
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

      const [scheduled, completed] = await Promise.all([
        prisma.job.count({
          where: {
            organizationId: req.user!.organizationId,
            scheduledAt: { gte: dayStart, lt: dayEnd },
          },
        }),
        prisma.job.count({
          where: {
            organizationId: req.user!.organizationId,
            status: "completed",
            completedAt: { gte: dayStart, lt: dayEnd },
          },
        }),
      ]);

      chartData.push({ day: days[i], scheduled, completed });
    }

    res.json(chartData);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Failed to get chart data" });
  }
});

async function getAnalyticsTrends(
  organizationId: string,
  sixMonthsAgo: Date
): Promise<AnalyticsTrends> {
  const twelveMonthsAgo = new Date()
  twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1)

  const [invoices, completedJobs, overdueCount, warrantyCount, noRecentJobCount] = await Promise.all([
    prisma.invoice.findMany({
      where: {
        organizationId,
        status: "paid",
        issuedDate: { gte: sixMonthsAgo },
      },
      select: { issuedDate: true, amount: true },
    }),
    prisma.job.findMany({
      where: {
        organizationId,
        status: "completed",
        completedAt: { gte: sixMonthsAgo },
      },
      select: { completedAt: true, equipmentType: true },
    }),
    prisma.equipment.count({
      where: {
        organizationId,
        lastServicedAt: { not: null },
        serviceIntervalMonths: { not: null },
      },
    }),
    prisma.equipment.count({
      where: {
        organizationId,
        warrantyExpiry: {
          gte: new Date(),
          lte: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
        },
      },
    }),
    prisma.customer.count({
      where: {
        organizationId,
        jobs: {
          some: { status: "completed" },
          none: { status: "completed", completedAt: { gte: twelveMonthsAgo } },
        },
      },
    }),
  ])

  const revenueMap = new Map<string, number>()
  for (const inv of invoices) {
    const d = new Date(inv.issuedDate)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    revenueMap.set(key, (revenueMap.get(key) ?? 0) + inv.amount)
  }
  const revenueTrend = Array.from(revenueMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, revenue]) => ({ month, revenue }))

  const jobMap = new Map<string, number>()
  const equipMap = new Map<string, number>()
  for (const job of completedJobs) {
    if (job.completedAt) {
      const d = new Date(job.completedAt)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
      jobMap.set(key, (jobMap.get(key) ?? 0) + 1)
    }
    if (job.equipmentType) {
      equipMap.set(job.equipmentType, (equipMap.get(job.equipmentType) ?? 0) + 1)
    }
  }
  const jobTrend = Array.from(jobMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, jobs]) => ({ month, jobs }))
  const equipmentBreakdown = Array.from(equipMap.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([type, count]) => ({ type, count }))

  const atRiskCount = overdueCount + warrantyCount + noRecentJobCount

  return { revenueTrend, jobTrend, equipmentBreakdown, atRiskCount }
}

// GET /api/dashboard/analytics/data
dashboardRouter.get("/analytics/data", async (req, res) => {
  if (req.user!.role !== "office") return res.status(403).json({ error: "Forbidden" })
  try {
    const now = new Date()
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1)
    const twelveMonthsAgo = new Date(now)
    twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1)
    const ninetyDaysFromNow = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000)
    const orgId = req.user!.organizationId

    const [trends, overdueEquipment, warrantyEquipment, noRecentJobCustomers] =
      await Promise.all([
        getAnalyticsTrends(orgId, sixMonthsAgo),
        prisma.equipment.findMany({
          where: {
            organizationId: orgId,
            lastServicedAt: { not: null },
            serviceIntervalMonths: { not: null },
          },
          select: {
            customerId: true,
            lastServicedAt: true,
            serviceIntervalMonths: true,
            customer: { select: { id: true, name: true, address: true } },
          },
        }),
        prisma.equipment.findMany({
          where: {
            organizationId: orgId,
            warrantyExpiry: { gte: now, lte: ninetyDaysFromNow },
          },
          select: {
            customerId: true,
            customer: { select: { id: true, name: true, address: true } },
          },
        }),
        prisma.customer.findMany({
          where: {
            organizationId: orgId,
            jobs: {
              some: { status: "completed" },
              none: { status: "completed", completedAt: { gte: twelveMonthsAgo } },
            },
          },
          select: { id: true, name: true, address: true },
        }),
      ])

    const { revenueTrend, jobTrend, equipmentBreakdown } = trends
    const forecastEntries = revenueTrend.slice(-3)
    const projectedRevenue =
      forecastEntries.length === 0
        ? 0
        : forecastEntries.reduce((sum, e) => sum + e.revenue, 0) / forecastEntries.length
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    const forecastMonth = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, "0")}`

    const atRiskMap = new Map<
      string,
      { customerId: string; name: string; address: string; flags: string[] }
    >()

    const addFlag = (customerId: string, name: string, address: string, flag: string) => {
      const existing = atRiskMap.get(customerId)
      if (existing) {
        if (!existing.flags.includes(flag)) existing.flags.push(flag)
      } else {
        atRiskMap.set(customerId, { customerId, name, address, flags: [flag] })
      }
    }

    for (const eq of overdueEquipment) {
      if (!eq.lastServicedAt || !eq.serviceIntervalMonths) continue
      const dueDate = new Date(eq.lastServicedAt)
      dueDate.setMonth(dueDate.getMonth() + eq.serviceIntervalMonths)
      if (dueDate < now) {
        addFlag(eq.customerId, eq.customer.name, eq.customer.address, "overdue_service")
      }
    }
    for (const eq of warrantyEquipment) {
      addFlag(eq.customerId, eq.customer.name, eq.customer.address, "warranty_expiring")
    }
    for (const c of noRecentJobCustomers) {
      addFlag(c.id, c.name, c.address, "no_recent_job")
    }

    const atRiskList = Array.from(atRiskMap.values())
    const reasons = await getAtRiskReasons(
      atRiskList.map((c) => ({ customerId: c.customerId, name: c.name, flags: c.flags }))
    )
    const atRisk = atRiskList.map((c) => ({
      ...c,
      aiReason: reasons[c.customerId] ?? null,
    }))

    res.json({
      revenueTrend,
      jobTrend,
      forecast: { month: forecastMonth, projectedRevenue },
      equipmentBreakdown,
      atRisk,
    })
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Failed to get analytics" })
  }
})

// GET /api/dashboard/analytics/insights
dashboardRouter.get("/analytics/insights", async (req, res) => {
  if (req.user!.role !== "office") return res.status(403).json({ error: "Forbidden" })
  try {
    const now = new Date()
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1)
    const trends = await getAnalyticsTrends(req.user!.organizationId, sixMonthsAgo)
    const narrative = await getAnalyticsNarrative(trends)
    res.json({ narrative })
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Failed to get insights" })
  }
})
