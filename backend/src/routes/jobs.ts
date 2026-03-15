import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { z } from "zod";
import { isValidTransition, getAllowedTransitions } from "../services/job-status.js";
import { broadcastToRole, notifyInApp } from "../services/notifications.js";
import { sendEmail } from "../services/email.js";
import { bookingConfirmationHtml } from "../templates/booking-confirmation.js";
import { statusUpdateHtml } from "../templates/status-update.js";
import { jobCompletedHtml } from "../templates/job-completed.js";
import { generatePreArrival } from "../services/pre-arrival.js";
import { generateCompletionSummary } from "../services/job-completion-ai.js";

export const jobsRouter = Router();

async function sendStatusNotifications(
  job: { id: string; customerId: string; technicianId: string | null; status: string; equipmentType: string | null; customer: { name: string; address: string }; technician: { name: string } | null },
  organizationId: string
) {
  const now = new Date().toISOString();

  if (job.status === "scheduled" && job.technicianId) {
    // Look up the assigned technician's userId via the User-Technician link
    const techUser = await prisma.user.findFirst({
      where: { technicianId: job.technicianId },
      select: { id: true },
    });
    if (techUser) {
      notifyInApp(techUser.id, {
        type: "job.assigned",
        message: `New job assigned: ${job.equipmentType ?? "HVAC"} at ${job.customer.address}`,
        jobId: job.id,
        timestamp: now,
      });
    }
  }

  if (["en_route", "in_progress", "completed"].includes(job.status)) {
    broadcastToRole(organizationId, "office", {
      type: job.status === "completed" ? "job.completed" : "job.status_changed",
      message: job.status === "completed"
        ? `Job completed — invoice ready`
        : `${job.technician?.name ?? "Technician"} is ${job.status === "en_route" ? "en route" : "working on"} ${job.equipmentType ?? "a job"}`,
      jobId: job.id,
      timestamp: now,
    });

    // Also notify the customer
    broadcastToRole(organizationId, "customer", {
      type: job.status === "completed" ? "job.completed" : "job.status_changed",
      message: job.status === "completed"
        ? `Your service is complete`
        : `Your technician is ${job.status === "en_route" ? "on the way" : "working on your system"}`,
      jobId: job.id,
      timestamp: now,
    });
  }
}

async function sendStatusEmails(
  job: { id: string; customerId: string; status: string; equipmentType: string | null; completedAt: Date | null; technician: { name: string } | null },
) {
  const customer = await prisma.customer.findUnique({
    where: { id: job.customerId },
    select: { email: true, name: true },
  });
  if (!customer?.email) return;

  if (job.status === "en_route" && job.technician) {
    sendEmail({
      to: customer.email,
      subject: "FlowSense: Your Technician Is On The Way",
      html: statusUpdateHtml({
        customerName: customer.name,
        technicianName: job.technician.name,
        equipmentType: job.equipmentType,
        status: job.status,
      }),
    });
  }

  if (job.status === "completed" && job.technician) {
    sendEmail({
      to: customer.email,
      subject: "FlowSense: Service Complete",
      html: jobCompletedHtml({
        customerName: customer.name,
        equipmentType: job.equipmentType,
        technicianName: job.technician.name,
        completedAt: (job.completedAt ?? new Date()).toISOString(),
      }),
    });
  }
}

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

const completionSummarySchema = z.object({
  actionsTaken: z.string().min(1),
  partsUsed: z.array(z.string()),
  notes: z.string().optional(),
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

    // Notify office users of new booking
    broadcastToRole(req.user!.organizationId, "office", {
      type: "job.created",
      message: `New booking from ${job.customer.name}`,
      jobId: job.id,
      timestamp: new Date().toISOString(),
    });

    // Send booking confirmation email
    const customer = await prisma.customer.findUnique({
      where: { id: job.customerId },
      select: { email: true, name: true },
    });
    if (customer?.email) {
      sendEmail({
        to: customer.email,
        subject: "FlowSense: Service Request Received",
        html: bookingConfirmationHtml({
          customerName: customer.name,
          serviceType: parsed.data.serviceType ?? null,
          equipmentType: parsed.data.equipmentType ?? null,
          scheduledAt: parsed.data.scheduledAt,
          symptomSummary: parsed.data.symptomSummary ?? null,
          jobId: job.id,
        }),
      });
    }
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
    // Track previous status for auto-trigger logic
    let previousStatus: string | undefined;

    // If status is being changed, validate the transition
    if (parsed.data.status) {
      const currentJob = await prisma.job.findFirst({
        where: { id: req.params.id, organizationId: req.user!.organizationId },
      });
      if (!currentJob) {
        return res.status(404).json({ error: "Job not found" });
      }
      previousStatus = currentJob.status;
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
      res.json(result);
      sendStatusNotifications(result, req.user!.organizationId);
      sendStatusEmails(result);
      return;
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
    sendStatusNotifications(job, req.user!.organizationId);
    sendStatusEmails(job);
    if (previousStatus === "pending" && job.status === "scheduled") {
      generatePreArrival(req.params.id);
    }
  } catch (e) {
    if ((e as { code?: string })?.code === "P2025") {
      return res.status(404).json({ error: "Job not found" });
    }
    res.status(500).json({ error: e instanceof Error ? e.message : "Failed to update job" });
  }
});

jobsRouter.post("/:id/generate-pre-arrival", async (req, res) => {
  try {
    // Role guard — only office and technician can regenerate
    if (req.user!.role === "customer") {
      return res.status(403).json({ error: "Customers cannot regenerate pre-arrival briefings" });
    }

    const job = await prisma.job.findFirst({
      where: { id: req.params.id, organizationId: req.user!.organizationId },
    });
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }

    await generatePreArrival(req.params.id);

    const updated = await prisma.job.findFirst({
      where: { id: req.params.id, organizationId: req.user!.organizationId },
      include: {
        customer: { select: { id: true, name: true, address: true, phone: true } },
        technician: { select: { id: true, name: true } },
      },
    });
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Failed to generate pre-arrival briefing" });
  }
});

jobsRouter.post("/:id/generate-completion-summary", async (req, res) => {
  try {
    if (req.user!.role === "customer") {
      return res
        .status(403)
        .json({ error: "Customers cannot generate completion summaries" });
    }

    const parsed = completionSummarySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const job = await prisma.job.findFirst({
      where: {
        id: req.params.id,
        organizationId: req.user!.organizationId,
      },
    });
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }

    const result = await generateCompletionSummary(req.params.id, parsed.data);

    if ("error" in result) {
      const status = result.error === "not_configured" ? 503 : 500;
      const message =
        result.error === "not_configured"
          ? "AI summary generation not configured"
          : "AI summary generation failed";
      return res.status(status).json({ error: message });
    }

    res.json({ summary: result.summary });
  } catch (e) {
    res.status(500).json({
      error:
        e instanceof Error ? e.message : "Failed to generate completion summary",
    });
  }
});
