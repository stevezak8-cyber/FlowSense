import { Router } from "express";
import { prisma } from "../lib/prisma.js";

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
