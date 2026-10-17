import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { z } from "zod";
import { requireStaff } from "../middleware/roles.js";

export const complianceRouter = Router();

complianceRouter.use(requireStaff);

const createLogSchema = z.object({
  jobId: z.string().cuid(),
  type: z.enum(["epa608_prompt", "safety_ack", "code_reminder", "photo_audit", "ai_disclaimer"]),
  payload: z.record(z.unknown()),
});

complianceRouter.get("/job/:jobId", async (req, res) => {
  try {
    const logs = await prisma.complianceLog.findMany({
      where: { jobId: req.params.jobId, job: { organizationId: req.user!.organizationId } },
      orderBy: { createdAt: "desc" },
    });
    res.json(logs);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Failed to list compliance logs" });
  }
});

complianceRouter.post("/", async (req, res) => {
  const parsed = createLogSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  try {
    const job = await prisma.job.findFirst({
      where: { id: parsed.data.jobId, organizationId: req.user!.organizationId },
      select: { id: true },
    });
    if (!job) return res.status(404).json({ error: "Job not found" });
    const log = await prisma.complianceLog.create({
      data: {
        jobId: parsed.data.jobId,
        type: parsed.data.type,
        payload: parsed.data.payload as object,
      },
    });
    res.status(201).json(log);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Failed to create compliance log" });
  }
});

complianceRouter.get("/", async (req, res) => {
  try {
    const { organizationId } = req.user!;
    const { technicianId, type, from, to } = req.query as Record<string, string | undefined>;

    const defaultFrom = new Date();
    defaultFrom.setDate(defaultFrom.getDate() - 90);

    const logs = await prisma.complianceLog.findMany({
      where: {
        job: {
          organizationId,
          ...(technicianId ? { technicianId } : {}),
        },
        ...(type ? { type } : {}),
        createdAt: {
          gte: from ? new Date(from) : defaultFrom,
          ...(to ? { lte: new Date(to) } : {}),
        },
      },
      include: {
        job: {
          select: {
            id: true,
            scheduledAt: true,
            equipmentType: true,
            customer: { select: { name: true } },
            technician: { select: { user: { select: { name: true } } } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json(logs);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Failed to list compliance logs" });
  }
});
