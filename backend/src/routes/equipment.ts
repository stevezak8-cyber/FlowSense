import { Router } from "express"
import { z } from "zod"
import { addMonths } from "date-fns"
import { prisma } from "../lib/prisma.js"

export const equipmentRouter = Router()

function computeNextDueAt(eq: {
  serviceIntervalMonths: number | null
  lastServicedAt: Date | null
  installDate: Date | null
  createdAt: Date
}): Date | null {
  if (!eq.serviceIntervalMonths) return null
  const base = eq.lastServicedAt ?? eq.installDate ?? eq.createdAt
  return addMonths(base, eq.serviceIntervalMonths)
}

// GET /api/equipment
equipmentRouter.get("/", async (req, res) => {
  const { organizationId } = req.user!
  const { customerId, maintenanceDue } = req.query

  const where: Record<string, unknown> = { organizationId }
  if (customerId) where.customerId = customerId as string

  const equipment = await prisma.equipment.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { customer: { select: { name: true } } },
  })

  const now = new Date()
  const thirtyDaysOut = addMonths(now, 1)

  const result = equipment
    .map((eq) => ({
      ...eq,
      nextDueAt: computeNextDueAt(eq)?.toISOString() ?? null,
    }))
    .filter((eq) => {
      if (maintenanceDue !== "true") return true
      if (!eq.nextDueAt) return false
      return new Date(eq.nextDueAt) <= thirtyDaysOut
    })

  res.json(result)
})

const createSchema = z.object({
  customerId: z.string().min(1),
  equipmentType: z.string().min(1),
  make: z.string().optional(),
  model: z.string().optional(),
  serialNumber: z.string().optional(),
  installDate: z.string().datetime({ offset: true }).optional(),
  warrantyExpiry: z.string().datetime({ offset: true }).optional(),
  serviceIntervalMonths: z.number().int().positive().optional(),
  notes: z.string().optional(),
})

// POST /api/equipment (create)
equipmentRouter.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

  const { organizationId } = req.user!
  const { customerId, ...rest } = parsed.data

  const customer = await prisma.customer.findFirst({ where: { id: customerId, organizationId } })
  if (!customer) return res.status(403).json({ error: "customer_not_in_org" })

  const equipment = await prisma.equipment.create({
    data: {
      organizationId,
      customerId,
      ...rest,
      installDate: rest.installDate ? new Date(rest.installDate) : undefined,
      warrantyExpiry: rest.warrantyExpiry ? new Date(rest.warrantyExpiry) : undefined,
    },
  })
  res.status(201).json({ ...equipment, nextDueAt: computeNextDueAt(equipment)?.toISOString() ?? null })
})

// POST /api/equipment/check-maintenance — MUST be before /:id routes
equipmentRouter.post("/check-maintenance", async (req, res) => {
  const { organizationId } = req.user!
  const now = new Date()
  const thirtyDaysOut = addMonths(now, 1)

  const allEquipment = await prisma.equipment.findMany({
    where: { organizationId, serviceIntervalMonths: { not: null } },
  })

  const dueUnits = allEquipment.filter((eq) => {
    const nextDue = computeNextDueAt(eq)
    return nextDue && nextDue <= thirtyDaysOut
  })

  const created = []
  for (const unit of dueUnits) {
    const nextDue = computeNextDueAt(unit)!

    const existing = await prisma.job.findFirst({
      where: {
        equipmentId: unit.id,
        status: { in: ["pending", "scheduled"] },
      },
    })
    if (existing) continue

    const job = await prisma.job.create({
      data: {
        organizationId,
        customerId: unit.customerId,
        equipmentId: unit.id,
        status: "pending",
        priority: "normal",
        scheduledAt: nextDue,
        equipmentType: unit.equipmentType,
        serviceType: "maintenance",
        symptomSummary: `Scheduled maintenance — ${unit.equipmentType} tune-up`,
      },
    })
    created.push(job)
  }

  res.json({ created })
})

const updateSchema = createSchema.partial().omit({ customerId: true })

// PATCH /api/equipment/:id
equipmentRouter.patch("/:id", async (req, res) => {
  const parsed = updateSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

  const { organizationId } = req.user!
  const existing = await prisma.equipment.findFirst({ where: { id: req.params.id, organizationId } })
  if (!existing) return res.status(404).json({ error: "not_found" })

  const { installDate, warrantyExpiry, ...rest } = parsed.data
  const equipment = await prisma.equipment.update({
    where: { id: req.params.id },
    data: {
      ...rest,
      ...(installDate !== undefined && { installDate: new Date(installDate) }),
      ...(warrantyExpiry !== undefined && { warrantyExpiry: new Date(warrantyExpiry) }),
    },
  })
  res.json({ ...equipment, nextDueAt: computeNextDueAt(equipment)?.toISOString() ?? null })
})

// DELETE /api/equipment/:id
equipmentRouter.delete("/:id", async (req, res) => {
  const { organizationId } = req.user!
  const existing = await prisma.equipment.findFirst({ where: { id: req.params.id, organizationId } })
  if (!existing) return res.status(404).json({ error: "not_found" })

  await prisma.equipment.delete({ where: { id: req.params.id } })
  res.status(204).send()
})

// GET /api/equipment/:id/history
equipmentRouter.get("/:id/history", async (req, res) => {
  const { organizationId } = req.user!
  const equipment = await prisma.equipment.findFirst({ where: { id: req.params.id, organizationId } })
  if (!equipment) return res.status(404).json({ error: "not_found" })

  const jobs = await prisma.job.findMany({
    where: { equipmentId: req.params.id },
    orderBy: { scheduledAt: "desc" },
  })
  res.json(jobs)
})
