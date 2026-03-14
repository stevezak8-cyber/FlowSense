import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { z } from "zod";

export const jobsRouter = Router();

const createJobSchema = z.object({
  customerId: z.string().cuid(),
  technicianId: z.string().cuid().optional(),
  scheduledAt: z.string().datetime(),
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
  symptomSummary: z.string().optional(),
  equipmentType: z.string().optional(),
  equipmentNotes: z.string().optional(),
});

const updateJobSchema = createJobSchema.partial().extend({
  status: z.enum(["scheduled", "en_route", "in_progress", "completed", "cancelled"]).optional(),
  summary: z.string().optional(),
  actionsTaken: z.string().optional(),
  partsUsed: z.array(z.string()).optional(),
  preArrivalNotes: z.string().optional(),
  suggestedParts: z.array(z.string()).optional(),
  suggestedTools: z.array(z.string()).optional(),
  riskFlags: z.array(z.string()).optional(),
  completedAt: z.string().datetime().optional(),
});

// TODO: scope by organizationId from auth
const ORG_ID = "default-org";

jobsRouter.get("/", async (req, res) => {
  try {
    const status = req.query.status as string | undefined;
    const technicianId = req.query.technicianId as string | undefined;
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;

    const jobs = await prisma.job.findMany({
      where: {
        organizationId: ORG_ID,
        ...(status && { status }),
        ...(technicianId && { technicianId }),
        ...(from && to && {
          scheduledAt: {
            gte: new Date(from),
            lte: new Date(to),
          },
        }),
      },
      include: {
        customer: { select: { id: true, name: true, address: true, phone: true } },
        technician: { select: { id: true, name: true } },
      },
      orderBy: { scheduledAt: "asc" },
    });
    res.json(jobs);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Failed to list jobs" });
  }
});

jobsRouter.get("/:id", async (req, res) => {
  try {
    const job = await prisma.job.findFirst({
      where: { id: req.params.id, organizationId: ORG_ID },
      include: {
        customer: true,
        technician: true,
        complianceLogs: { orderBy: { createdAt: "desc" }, take: 50 },
      },
    });
    if (!job) return res.status(404).json({ error: "Job not found" });
    res.json(job);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Failed to get job" });
  }
});

jobsRouter.post("/", async (req, res) => {
  const parsed = createJobSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  try {
    const job = await prisma.job.create({
      data: {
        organizationId: ORG_ID,
        customerId: parsed.data.customerId,
        technicianId: parsed.data.technicianId,
        scheduledAt: new Date(parsed.data.scheduledAt),
        priority: parsed.data.priority,
        symptomSummary: parsed.data.symptomSummary,
        equipmentType: parsed.data.equipmentType,
        equipmentNotes: parsed.data.equipmentNotes,
      },
      include: {
        customer: { select: { id: true, name: true, address: true } },
        technician: { select: { id: true, name: true } },
      },
    });
    res.status(201).json(job);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Failed to create job" });
  }
});

jobsRouter.patch("/:id", async (req, res) => {
  const parsed = updateJobSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  try {
    const data: Record<string, unknown> = { ...parsed.data };
    if (data.scheduledAt) data.scheduledAt = new Date(data.scheduledAt as string);
    if (data.completedAt) data.completedAt = new Date(data.completedAt as string);

    const job = await prisma.job.update({
      where: { id: req.params.id },
      data,
      include: {
        customer: { select: { id: true, name: true, address: true } },
        technician: { select: { id: true, name: true } },
      },
    });
    res.json(job);
  } catch (e) {
    if ((e as { code?: string })?.code === "P2025") {
      return res.status(404).json({ error: "Job not found" });
    }
    res.status(500).json({ error: e instanceof Error ? e.message : "Failed to update job" });
  }
});
