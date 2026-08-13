import { Router } from "express"
import { z } from "zod"
import { prisma } from "../lib/prisma.js"

export const recurringJobsRouter = Router()

const VALID_INTERVALS = [7, 14, 30, 90, 180, 365] as const

const createSchema = z.object({
  customerId: z.string().min(1),
  technicianId: z.string().min(1).optional(),
  equipmentId: z.string().min(1).optional(),
  equipmentType: z.string().optional(),
  serviceType: z.string().optional(),
  intervalDays: z.number().refine((v) => (VALID_INTERVALS as readonly number[]).includes(v), {
    message: "intervalDays must be one of: 7, 14, 30, 90, 180, 365",
  }),
  nextDueAt: z.string().datetime(),
  notes: z.string().optional(),
})

const updateSchema = z.object({
  technicianId: z.string().min(1).nullable().optional(),
  equipmentId: z.string().min(1).nullable().optional(),
  equipmentType: z.string().optional(),
  serviceType: z.string().optional(),
  intervalDays: z.number().refine((v) => (VALID_INTERVALS as readonly number[]).includes(v), {
    message: "intervalDays must be one of: 7, 14, 30, 90, 180, 365",
  }).optional(),
  nextDueAt: z.string().datetime().optional(),
  notes: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
})

// IMPORTANT: GET /pending-drafts must be registered BEFORE GET / and any /:id routes
recurringJobsRouter.get("/pending-drafts", async (req, res) => {
  try {
    const { organizationId } = req.user!
    const drafts = await prisma.job.findMany({
      where: {
        organizationId,
        status: "pending",
        recurringJobId: { not: null },
      },
      select: {
        id: true,
        customerId: true,
        equipmentType: true,
        serviceType: true,
        recurringJobId: true,
        createdAt: true,
        customer: { select: { name: true } },
        recurringJob: {
          select: {
            nextDueAt: true,
            intervalDays: true,
            equipment: { select: { make: true, model: true } },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    })
    res.json(drafts)
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Failed to fetch pending drafts" })
  }
})

recurringJobsRouter.get("/", async (req, res) => {
  try {
    const { organizationId } = req.user!
    const { customerId, isActive } = req.query as Record<string, string | undefined>

    const isActiveFilter =
      isActive === "false" ? false : isActive === "all" ? undefined : true

    const jobs = await prisma.recurringJob.findMany({
      where: {
        organizationId,
        ...(customerId ? { customerId } : {}),
        ...(isActiveFilter !== undefined ? { isActive: isActiveFilter } : {}),
      },
      include: {
        customer: { select: { name: true } },
        equipment: { select: { make: true, model: true } },
        technician: { select: { user: { select: { name: true } } } },
      },
      orderBy: { nextDueAt: "asc" },
    })
    res.json(jobs)
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Failed to list recurring jobs" })
  }
})

recurringJobsRouter.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

  const { organizationId } = req.user!

  try {
    // Verify customer belongs to this org (same pattern as equipment.ts)
    const customerCheck = await prisma.customer.findFirst({
      where: { id: parsed.data.customerId, organizationId },
    })
    if (!customerCheck) {
      return res.status(403).json({ error: "Customer not in your organization" })
    }

    const record = await prisma.recurringJob.create({
      data: {
        organizationId,
        customerId: parsed.data.customerId,
        technicianId: parsed.data.technicianId ?? null,
        equipmentId: parsed.data.equipmentId ?? null,
        equipmentType: parsed.data.equipmentType ?? null,
        serviceType: parsed.data.serviceType ?? null,
        intervalDays: parsed.data.intervalDays,
        nextDueAt: new Date(parsed.data.nextDueAt),
        notes: parsed.data.notes ?? null,
      },
      include: {
        customer: { select: { name: true } },
        equipment: { select: { make: true, model: true } },
      },
    })
    res.status(201).json(record)
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Failed to create recurring job" })
  }
})

recurringJobsRouter.patch("/:id", async (req, res) => {
  const parsed = updateSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

  const { organizationId } = req.user!

  try {
    const existing = await prisma.recurringJob.findFirst({
      where: { id: req.params.id, organizationId },
    })
    if (!existing) return res.status(404).json({ error: "Recurring job not found" })

    const record = await prisma.recurringJob.update({
      where: { id: req.params.id },
      data: {
        ...parsed.data,
        nextDueAt: parsed.data.nextDueAt ? new Date(parsed.data.nextDueAt) : undefined,
      },
      include: {
        customer: { select: { name: true } },
        equipment: { select: { make: true, model: true } },
      },
    })
    res.json(record)
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Failed to update recurring job" })
  }
})

recurringJobsRouter.delete("/:id", async (req, res) => {
  const { organizationId } = req.user!

  try {
    const existing = await prisma.recurringJob.findFirst({
      where: { id: req.params.id, organizationId },
    })
    if (!existing) return res.status(404).json({ error: "Recurring job not found" })

    await prisma.recurringJob.delete({ where: { id: req.params.id } })
    res.status(204).send()
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Failed to delete recurring job" })
  }
})
