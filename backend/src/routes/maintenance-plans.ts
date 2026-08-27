import { Router } from "express"
import { z } from "zod"
import { prisma } from "../lib/prisma.js"
import { notifyOfficePlanCreated } from "../services/org-notifications.js"

export const maintenancePlansRouter = Router()

const itemSchema = z.object({
  equipmentId: z.string().optional(),
  serviceType: z.string().optional(),
  intervalMonths: z.union([z.literal(6), z.literal(12)]),
})

const createSchema = z.object({
  customerId: z.string().min(1),
  name: z.string().min(1),
  price: z.number().min(0),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  items: z.array(itemSchema).min(1, "At least one equipment item is required"),
})

const INTERVAL_MAP: Record<number, number> = { 6: 180, 12: 365 }

maintenancePlansRouter.post("/", async (req, res) => {
  if (req.user!.role !== "office") return res.status(403).json({ error: "Forbidden" })

  const parsed = createSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

  const { customerId, name, price, startDate, endDate, items } = parsed.data
  const { organizationId } = req.user!

  if (new Date(endDate) <= new Date(startDate)) {
    return res.status(400).json({ error: "endDate must be after startDate" })
  }

  const customer = await prisma.customer.findFirst({ where: { id: customerId, organizationId } })
  if (!customer) return res.status(403).json({ error: "Customer not in org" })

  const plan = await prisma.$transaction(async (tx) => {
    const newPlan = await tx.maintenancePlan.create({
      data: { organizationId, customerId, name, price, startDate, endDate, status: "active" },
    })

    for (const item of items) {
      const rj = await tx.recurringJob.create({
        data: {
          organizationId,
          customerId,
          equipmentId: item.equipmentId ?? null,
          serviceType: item.serviceType ?? null,
          intervalDays: INTERVAL_MAP[item.intervalMonths],
          nextDueAt: new Date(startDate),
          isActive: true,
        },
      })
      await tx.maintenancePlanItem.create({
        data: {
          planId: newPlan.id,
          equipmentId: item.equipmentId ?? null,
          serviceType: item.serviceType ?? null,
          intervalMonths: item.intervalMonths,
          recurringJobId: rj.id,
        },
      })
    }

    const invoice = await tx.invoice.create({
      data: {
        organizationId,
        customerId,
        jobId: null,
        description: name,
        amount: price,
        status: "pending",
        issuedDate: new Date(),
        dueDate: new Date(startDate),
      },
    })

    return tx.maintenancePlan.update({
      where: { id: newPlan.id },
      data: { invoiceId: invoice.id },
      include: { items: true },
    })
  })

  notifyOfficePlanCreated({
    planName: name,
    customerName: customer.name,
    price,
    itemCount: items.length,
    orgId: organizationId,
  }).catch(() => {})

  return res.status(201).json(plan)
})

maintenancePlansRouter.get("/", async (req, res) => {
  const { organizationId } = req.user!

  // Customers see only their own plans
  if (req.user!.role === "customer") {
    const customerId = req.user!.customerId
    if (!customerId) return res.status(400).json({ error: "Customer account required" })
    const plans = await prisma.maintenancePlan.findMany({
      where: { organizationId, customerId },
      include: { items: true, invoice: { select: { id: true, status: true } } },
      orderBy: { startDate: "desc" },
    })
    return res.json(plans)
  }

  if (req.user!.role !== "office") return res.status(403).json({ error: "Forbidden" })
  const status = (req.query.status as string) ?? "active"
  const customerId = req.query.customerId as string | undefined

  const where: Record<string, unknown> = { organizationId }
  if (status !== "all") where.status = status
  if (customerId) where.customerId = customerId

  const plans = await prisma.maintenancePlan.findMany({
    where,
    include: { items: true, customer: { select: { name: true } }, invoice: { select: { id: true, status: true } } },
    orderBy: { startDate: "desc" },
  })
  return res.json(plans)
})

maintenancePlansRouter.get("/:id", async (req, res) => {
  if (req.user!.role !== "office") return res.status(403).json({ error: "Forbidden" })
  const plan = await prisma.maintenancePlan.findFirst({
    where: { id: req.params.id, organizationId: req.user!.organizationId },
    include: {
      items: { include: { equipment: { select: { make: true, model: true, equipmentType: true } } } },
      invoice: true,
      customer: { select: { name: true } },
    },
  })
  if (!plan) return res.status(404).json({ error: "Not found" })
  return res.json(plan)
})

maintenancePlansRouter.patch("/:id", async (req, res) => {
  if (req.user!.role !== "office") return res.status(403).json({ error: "Forbidden" })
  const plan = await prisma.maintenancePlan.findFirst({
    where: { id: req.params.id, organizationId: req.user!.organizationId },
    include: { items: true },
  })
  if (!plan) return res.status(404).json({ error: "Not found" })

  const { status, name } = req.body as { status?: string; name?: string }

  if (status === "cancelled") {
    const rjIds = plan.items.map((i) => i.recurringJobId).filter(Boolean) as string[]
    if (rjIds.length > 0) {
      await prisma.recurringJob.updateMany({ where: { id: { in: rjIds } }, data: { isActive: false } })
    }
  }

  const updated = await prisma.maintenancePlan.update({
    where: { id: plan.id },
    data: { ...(status ? { status } : {}), ...(name ? { name } : {}) },
  })
  return res.json(updated)
})
