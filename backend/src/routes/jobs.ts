import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { z } from "zod";
import { isValidTransition, getAllowedTransitions } from "../services/job-status.js";
import { s3Available, getUploadUrl, deleteObject } from "../services/s3.js";
import { randomUUID } from "crypto";
import { broadcastToRole, notifyInApp } from "../services/notifications.js";
import { sendEmail, sendEnRouteEmail, sendJobInProgressEmail, sendJobCompletedEmail } from "../services/email.js";
import { bookingConfirmationHtml } from "../templates/booking-confirmation.js";
import { generatePreArrival } from "../services/pre-arrival.js";
import { generateCompletionSummary } from "../services/job-completion-ai.js";
import { sendPushToUser } from "../services/push.js";
import {
  notifyOrgNewBooking,
  notifyOrgStatusChange,
  notifyOrgJobCompleted,
  notifyOfficeCancellation,
} from "../services/org-notifications.js"
import {
  sendBookingConfirmedSms,
  sendEnRouteSms,
  sendJobCompletedSms,
} from "../services/sms.js";

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
  job: { id: string; status: string },
) {
  if (job.status === "en_route") sendEnRouteEmail(job.id).catch(console.error)
  if (job.status === "in_progress") sendJobInProgressEmail(job.id).catch(console.error)
  if (job.status === "completed") sendJobCompletedEmail(job.id).catch(console.error)
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
  laborHours: z.number().positive().optional(),
  photos: z.array(z.string()).optional(),
});

const completionSummarySchema = z.object({
  actionsTaken: z.string().min(1),
  partsUsed: z.array(z.string()),
  notes: z.string().optional(),
});

// HVAC rate card — base service call fee by type + hourly labor rate
const SERVICE_BASE_FEE: Record<string, number> = {
  repair: 95,
  maintenance: 79,
  inspection: 65,
  installation: 175,
};
const DEFAULT_BASE_FEE = 95;
const LABOR_RATE_PER_HOUR = 95; // $/hr after the first hour

function calculateInvoiceAmount(
  serviceType: string | null | undefined,
  laborHours: number
): number {
  const base = SERVICE_BASE_FEE[serviceType ?? ""] ?? DEFAULT_BASE_FEE;
  // First hour is included in base fee; additional hours billed at LABOR_RATE_PER_HOUR
  const additionalHours = Math.max(0, laborHours - 1);
  return parseFloat((base + additionalHours * LABOR_RATE_PER_HOUR).toFixed(2));
}

jobsRouter.get("/", async (req, res) => {
  try {
    const status = req.query.status as string | undefined;
    const technicianId = req.query.technicianId as string | undefined;
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;

    // Scope results to the requesting user's role
    const { role, technicianId: myTechId, customerId: myCustomerId } = req.user!;
    const roleFilter =
      role === "technician" && myTechId
        ? { technicianId: myTechId }
        : role === "customer" && myCustomerId
          ? { customerId: myCustomerId }
          : {};

    const jobs = await prisma.job.findMany({
      where: {
        organizationId: req.user!.organizationId,
        ...roleFilter,
        ...(status && { status }),
        ...(technicianId && role !== "technician" && { technicianId }),
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

jobsRouter.post("/:id/cancel", async (req, res) => {
  if (req.user!.role !== "customer") return res.status(403).json({ error: "Forbidden" })
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    select: { customerId: true },
  })
  if (!user?.customerId) return res.status(400).json({ error: "No customer profile linked to this account" })
  const job = await prisma.job.findFirst({
    where: { id: req.params.id, organizationId: req.user!.organizationId },
    include: { customer: { select: { name: true } } },
  })
  if (!job) return res.status(404).json({ error: "Job not found" })
  if (job.customerId !== user.customerId) return res.status(403).json({ error: "Forbidden" })
  if (!["pending", "scheduled"].includes(job.status)) {
    return res.status(400).json({ error: "Job cannot be cancelled at this stage" })
  }
  const updated = await prisma.job.update({ where: { id: job.id }, data: { status: "cancelled" } })
  notifyOfficeCancellation({ jobId: job.id, customerName: job.customer.name, orgId: req.user!.organizationId }).catch(console.error)
  return res.json(updated)
})

jobsRouter.post("/:id/review", async (req, res) => {
  if (req.user!.role !== "customer") return res.status(403).json({ error: "Forbidden" })
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    select: { customerId: true },
  })
  if (!user?.customerId) return res.status(400).json({ error: "No customer profile linked to this account" })
  const job = await prisma.job.findFirst({
    where: { id: req.params.id, organizationId: req.user!.organizationId },
  })
  if (!job) return res.status(404).json({ error: "Job not found" })
  if (job.customerId !== user.customerId) return res.status(403).json({ error: "Forbidden" })
  if (job.status !== "completed") return res.status(400).json({ error: "Job must be completed before reviewing" })
  const { rating, comment } = req.body as { rating?: unknown; comment?: string }
  if (typeof rating !== "number" || rating < 1 || rating > 5) {
    return res.status(400).json({ error: "rating must be a number between 1 and 5" })
  }
  try {
    const review = await prisma.jobReview.create({
      data: {
        jobId: job.id,
        organizationId: req.user!.organizationId,
        customerId: user.customerId,
        rating,
        comment: comment ?? null,
      },
    })
    return res.status(201).json(review)
  } catch (e: unknown) {
    if ((e as { code?: string }).code === "P2002") {
      return res.status(409).json({ error: "You have already reviewed this job" })
    }
    return res.status(500).json({ error: "Failed to create review" })
  }
})

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

    // Duplicate check: reject if an active job already exists for this
    // customer within ±30 minutes of the requested scheduled time.
    const scheduledAt = new Date(parsed.data.scheduledAt);
    const windowStart = new Date(scheduledAt.getTime() - 30 * 60 * 1000);
    const windowEnd = new Date(scheduledAt.getTime() + 30 * 60 * 1000);
    const existingJob = await prisma.job.findFirst({
      where: {
        organizationId: req.user!.organizationId,
        customerId,
        status: { notIn: ["completed", "cancelled"] },
        scheduledAt: { gte: windowStart, lte: windowEnd },
      },
      select: { id: true },
    });
    if (existingJob) {
      return res.status(409).json({
        error: "A job is already scheduled for this customer at this time",
        existingJobId: existingJob.id,
      });
    }

    const job = await prisma.job.create({
      data: {
        organizationId: req.user!.organizationId,
        customerId,
        technicianId: parsed.data.technicianId,
        scheduledAt,
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

    // Send booking confirmation email to customer
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
      }).catch(console.error);
    }

    sendBookingConfirmedSms(job.id).catch(console.error)

    // Notify org dispatch email
    notifyOrgNewBooking(req.user!.organizationId, {
      ...job,
      priority: parsed.data.priority,
      serviceType: parsed.data.serviceType ?? null,
      symptomSummary: parsed.data.symptomSummary ?? null,
    });
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
            recurringJob: { select: { intervalDays: true } },
          },
        });

        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 30);

        const laborHours = parsed.data.laborHours ?? 1;
        const invoiceAmount = calculateInvoiceAmount(updatedJob.serviceType, laborHours);
        const partsCount = (parsed.data.partsUsed ?? []).length;
        const descriptionParts = [
          `${updatedJob.serviceType ?? "HVAC"} service — ${updatedJob.equipmentType ?? "equipment"}`,
          `${laborHours} hr${laborHours !== 1 ? "s" : ""} labor`,
          ...(partsCount > 0 ? [`${partsCount} part${partsCount !== 1 ? "s" : ""} used`] : []),
        ];

        await tx.invoice.create({
          data: {
            organizationId: req.user!.organizationId,
            jobId: updatedJob.id,
            customerId: updatedJob.customerId,
            description: descriptionParts.join(" · "),
            amount: invoiceAmount,
            status: "pending",
            dueDate,
          },
        });

        return updatedJob;
      });
      if (result.recurringJobId && result.recurringJob) {
        prisma.recurringJob.update({
          where: { id: result.recurringJobId },
          data: {
            lastJobAt: new Date(),
            nextDueAt: new Date(Date.now() + result.recurringJob.intervalDays * 86400000),
          },
        }).catch(console.error)
      }
      if (result.equipmentId) {
        prisma.equipment.update({
          where: { id: result.equipmentId },
          data: { lastServicedAt: new Date() },
        }).catch(console.error)
      }
      res.json(result);
      sendStatusNotifications(result, req.user!.organizationId);
      sendStatusEmails(result);
      notifyOrgJobCompleted(req.user!.organizationId, result);
      sendJobCompletedSms(result.id).catch(console.error)
      return;
    }

    // Capture previous technicianId before update so we can detect assignment changes
    let prevTechnicianId: string | null | undefined
    if (parsed.data.technicianId !== undefined) {
      const prev = await prisma.job.findFirst({
        where: { id: req.params.id, organizationId: req.user!.organizationId },
        select: { technicianId: true },
      })
      prevTechnicianId = prev?.technicianId
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

    if (parsed.data.technicianId && parsed.data.technicianId !== prevTechnicianId) {
      prisma.technician.findUnique({
        where: { id: parsed.data.technicianId as string },
        select: { user: { select: { id: true } } },
      }).then((tech) => {
        if (tech?.user?.id) {
          return sendPushToUser(tech.user.id, {
            title: "New Job Assigned",
            body: `${job.equipmentType ?? "New job"} — ${job.customer?.address ?? ""}`.trim(),
            url: "/technician",
          })
        }
      }).catch(console.error)
    }

    const jobUpdated = "scheduledAt" in parsed.data || "symptomSummary" in parsed.data
    if (jobUpdated && job.technicianId) {
      prisma.technician.findUnique({
        where: { id: job.technicianId },
        select: { user: { select: { id: true } } },
      }).then((tech) => {
        if (tech?.user?.id) {
          return sendPushToUser(tech.user.id, {
            title: "Job Updated",
            body: "One of your appointments has been updated.",
            url: "/technician",
          })
        }
      }).catch(console.error)
    }

    sendStatusNotifications(job, req.user!.organizationId);
    sendStatusEmails(job);
    notifyOrgStatusChange(req.user!.organizationId, job);
    if (job.status === "en_route") sendEnRouteSms(job.id).catch(console.error)
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


// GET /api/jobs/:jobId/estimates
jobsRouter.get("/:jobId/estimates", async (req, res) => {
  try {
    const estimates = await prisma.estimate.findMany({
      where: { jobId: req.params.jobId, organizationId: req.user!.organizationId },
      include: { lines: true },
      orderBy: { createdAt: "desc" },
    });
    res.json(estimates);
  } catch {
    res.status(500).json({ error: "Failed to fetch estimates" });
  }
});

jobsRouter.delete("/:id", async (req, res) => {
  if (req.user!.role !== "office") {
    return res.status(403).json({ error: "Forbidden" });
  }
  try {
    await prisma.job.delete({
      where: { id: req.params.id, organizationId: req.user!.organizationId },
    });
    res.status(204).send();
  } catch (e) {
    if ((e as { code?: string })?.code === "P2025") {
      return res.status(404).json({ error: "Job not found" });
    }
    if ((e as { code?: string })?.code === "P2003") {
      return res.status(409).json({ error: "Cannot delete job with linked invoices" });
    }
    res.status(500).json({ error: e instanceof Error ? e.message : "Failed to delete job" });
  }
});

// Photo routes

const ALLOWED_CONTENT_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
}

jobsRouter.post("/:id/photos/upload-url", async (req, res) => {
  if (!s3Available()) {
    return res.status(503).json({ error: "Photo upload not configured" })
  }

  const { role, organizationId } = req.user!
  if (role !== "technician") {
    return res.status(403).json({ error: "Only technicians can upload photos" })
  }

  const { contentType } = req.body
  const ext = ALLOWED_CONTENT_TYPES[contentType as string]
  if (!ext) {
    return res.status(400).json({ error: "Unsupported content type. Allowed: image/jpeg, image/png, image/webp" })
  }

  const job = await prisma.job.findFirst({
    where: { id: req.params.id, organizationId },
  })
  if (!job) return res.status(404).json({ error: "Job not found" })

  const key = `${organizationId}/jobs/${job.id}/${randomUUID()}.${ext}`
  try {
    const { uploadUrl, publicUrl } = await getUploadUrl(key, contentType)
    return res.json({ uploadUrl, publicUrl })
  } catch (e) {
    return res.status(500).json({ error: "Failed to generate upload URL" })
  }
})

jobsRouter.post("/:id/photos", async (req, res) => {
  const { role, organizationId } = req.user!
  if (role !== "technician") {
    return res.status(403).json({ error: "Only technicians can upload photos" })
  }

  const { url } = req.body
  const bucket = process.env.AWS_S3_BUCKET ?? ""
  if (!url || !url.startsWith(`https://${bucket}.s3.`)) {
    return res.status(400).json({ error: "Invalid photo URL" })
  }

  const job = await prisma.job.findFirst({
    where: { id: req.params.id, organizationId },
  })
  if (!job) return res.status(404).json({ error: "Job not found" })

  try {
    const updated = await prisma.job.update({
      where: { id: req.params.id },
      data: { photos: { push: url } },
    })
    return res.json({ photos: updated.photos })
  } catch {
    return res.status(500).json({ error: "Failed to save photo" })
  }
})

jobsRouter.delete("/:id/photos", async (req, res) => {
  const { role, organizationId } = req.user!
  if (role !== "technician") {
    return res.status(403).json({ error: "Only technicians can delete photos" })
  }

  const { url } = req.body
  const bucket = process.env.AWS_S3_BUCKET ?? ""
  const region = process.env.AWS_REGION ?? "us-east-1"
  if (!url || !url.startsWith(`https://${bucket}.s3.`)) {
    return res.status(400).json({ error: "Invalid photo URL" })
  }

  const job = await prisma.job.findFirst({
    where: { id: req.params.id, organizationId },
  })
  if (!job) return res.status(404).json({ error: "Job not found" })

  const prefix = `https://${bucket}.s3.${region}.amazonaws.com/`
  const key = url.startsWith(prefix) ? url.slice(prefix.length) : null

  try {
    const updated = await prisma.job.update({
      where: { id: req.params.id },
      data: { photos: job.photos.filter((p) => p !== url) },
    })
    if (key) deleteObject(key).catch((e) => console.error("[Photos] deleteObject failed:", e))
    return res.json({ photos: updated.photos })
  } catch {
    return res.status(500).json({ error: "Failed to delete photo" })
  }
})
