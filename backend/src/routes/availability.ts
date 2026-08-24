import { Router } from "express"
import { prisma } from "../lib/prisma.js"
import { z } from "zod"

export const availabilityRouter = Router()

const daySchema = z.object({ open: z.string().regex(/^\d{2}:\d{2}$/), close: z.string().regex(/^\d{2}:\d{2}$/) }).nullable()
const scheduleSchema = z.object({
  mon: daySchema, tue: daySchema, wed: daySchema, thu: daySchema,
  fri: daySchema, sat: daySchema, sun: daySchema,
})

availabilityRouter.get("/", async (req, res) => {
  try {
    const org = await prisma.organization.findUnique({
      where: { id: req.user!.organizationId },
      select: { availabilitySchedule: true },
    })
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const blockedDates = await prisma.blockedDate.findMany({
      where: { organizationId: req.user!.organizationId, date: { gte: today } },
      orderBy: { date: "asc" },
    })
    return res.json({ schedule: org?.availabilitySchedule ?? null, blockedDates })
  } catch {
    return res.status(500).json({ error: "Failed to load availability" })
  }
})

availabilityRouter.put("/schedule", async (req, res) => {
  if (req.user!.role !== "office") return res.status(403).json({ error: "Forbidden" })
  const parsed = scheduleSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })
  for (const [, val] of Object.entries(parsed.data)) {
    if (val && val.open >= val.close) {
      return res.status(400).json({ error: "open time must be before close time" })
    }
  }
  try {
    await prisma.organization.update({
      where: { id: req.user!.organizationId },
      data: { availabilitySchedule: parsed.data },
    })
    return res.json(parsed.data)
  } catch {
    return res.status(500).json({ error: "Failed to update schedule" })
  }
})

availabilityRouter.post("/blocked-dates", async (req, res) => {
  if (req.user!.role !== "office") return res.status(403).json({ error: "Forbidden" })
  const { date, reason } = req.body as { date?: string; reason?: string }
  if (!date) return res.status(400).json({ error: "date is required" })
  try {
    const normalised = new Date(date); normalised.setUTCHours(0, 0, 0, 0)
    const record = await prisma.blockedDate.create({
      data: { organizationId: req.user!.organizationId, date: normalised, reason: reason ?? null },
    })
    return res.status(201).json(record)
  } catch (e: unknown) {
    if ((e as { code?: string }).code === "P2002") return res.status(409).json({ error: "This date is already blocked" })
    return res.status(500).json({ error: "Failed to create blocked date" })
  }
})

availabilityRouter.delete("/blocked-dates/:id", async (req, res) => {
  if (req.user!.role !== "office") return res.status(403).json({ error: "Forbidden" })
  const record = await prisma.blockedDate.findFirst({
    where: { id: req.params.id, organizationId: req.user!.organizationId },
  })
  if (!record) return res.status(404).json({ error: "Not found" })
  await prisma.blockedDate.delete({ where: { id: record.id } })
  return res.status(204).send()
})
