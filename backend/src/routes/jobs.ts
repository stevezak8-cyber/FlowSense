import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { z } from "zod";
import { isValidTransition, getAllowedTransitions } from "../services/job-status.js";

export const jobsRouter = Router();

const createJobSchema = z.object({
  technicianId: z.string().cuid().optional(),
  scheduledAt: z.string().datetime(),
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
  symptomSummary: z.string().optional(),
  equipmentType: z.string().optional(),
  equipmentNotes: z.string().optional(),
  serviceType: z.enum(["repair", "maintenance", "inspection", "installation"]).optional(),
});

const updateJobSchema = createJobSchema.partial().extend({
  status: z.enum(["pending", "scheduled", "en_route", "in_progress", "completed", "cancelled"]).optional(),
  summary: z.string().optional(),
  actionsTaken: z.string().optional(),
  partsUsed: z.array(z.string()).optional(),
  preArrivalNotes: z.string().optional(),
  suggestedParts: z.array(z.string()).optional(),
  suggestedTools: z.array(z.string()).optional(),
  riskFlags: z.array(z.string()).optional(),
  completedAt: z.string().datetime().optional(),
});

jobsRouter.get("/", async (req, res) => {
  try {
    const status = req.query.status as string | undefined;
    const technicianId = req.query.technicianId as string | undefined;
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;

    const jobs = await prisma.job.findMany({
      where: {
        organizationId: req.user!.organizationId,
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
      where: { id: req.params.id, organizationId: req.user!.organizationId },
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
    // Resolve customerId from authenticated user if role is customer
    let customerId: string | undefined;
    if (req.user!.role === "customer") {
      const user = await prisma.user.findUnique({
        where: { id: req.user!.userId },
        select: { customerId: true },
      });
      if (!user?.customerId) {
        return res.status(400).json({ error: "No customer profile linked to this account" });
      }
      customerId = user.customerId;
    } else {
      // Office users must provide customerId in the body
      const bodyCustomerId = (req.body as { customerId?: string }).customerId;
      if (!bodyCustomerId) {
        return res.status(400).json({ error: "customerId is required for office-created jobs" });
      }
      customerId = bodyCustomerId;
    }

    const job = await prisma.job.create({
      data: {
        organizationId: req.user!.organizationId,
        customerId,
        technicianId: parsed.data.technicianId,
        scheduledAt: new Date(parsed.data.scheduledAt),
        priority: parsed.data.priority,
        symptomSummary: parsed.data.symptomSummary,
        equipmentType: parsed.data.equipmentType,
        equipmentNotes: parsed.data.equipmentNotes,
        serviceType: parsed.data.serviceType,
        status: "pending",
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
    // If status is being changed, validate the transition
    if (parsed.data.status) {
      const currentJob = await prisma.job.findFirst({
        where: { id: req.params.id, organizationId: req.user!.organizationId },
      });
      if (!currentJob) {
        return res.status(404).json({ error: "Job not found" });
      }
      if (!isValidTransition(currentJob.status, parsed.data.status)) {
        return res.status(400).json({
          error: `Cannot transition from '${currentJob.status}' to '${parsed.data.status}'. Allowed: ${getAllowedTransitions(currentJob.status).join(", ") || "none"}`,
        });
      }
    }

    const data: Record<string, unknown> = { ...parsed.data };
    if (data.scheduledAt) data.scheduledAt = new Date(data.scheduledAt as string);
    if (data.completedAt) data.completedAt = new Date(data.completedAt as string);

    // Auto-set completedAt when transitioning to completed
    if (parsed.data.status === "completed" && !data.completedAt) {
      data.completedAt = new Date();
    }

    // If completing, use transaction to also create invoice
    if (parsed.data.status === "completed") {
      const result = await prisma.$transaction(async (tx) => {
        const updatedJob = await tx.job.update({
          where: { id: req.params.id, organizationId: req.user!.organizationId },
          data,
          include: {
            customer: { select: { id: true, name: true, address: true, email: true } },
            technician: { select: { id: true, name: true } },
          },
        });

        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 30);

        await tx.invoice.create({
          data: {
            organizationId: req.user!.organizationId,
            jobId: updatedJob.id,
            customerId: updatedJob.customerId,
            description: `Service completed — ${updatedJob.equipmentType ?? "HVAC service"}`,
            amount: 0,
            status: "pending",
            dueDate,
          },
        });

        return updatedJob;
      });
      return res.json(result);
    }

    const job = await prisma.job.update({
      where: { id: req.params.id, organizationId: req.user!.organizationId },
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
