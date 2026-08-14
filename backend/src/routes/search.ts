import { Router } from "express"
import { prisma } from "../lib/prisma.js"

export const searchRouter = Router()

searchRouter.get("/", async (req, res) => {
  const user = req.user!
  if (user.role !== "office") {
    res.status(403).json({ error: "Office access only" })
    return
  }

  const q = (req.query.q as string | undefined)?.trim() ?? ""
  if (q.length < 2) {
    res.status(400).json({ error: "Query must be at least 2 characters" })
    return
  }

  const { organizationId } = user

  const [jobs, customers, equipment] = await Promise.all([
    prisma.job.findMany({
      where: {
        organizationId,
        OR: [
          { symptomSummary: { contains: q, mode: "insensitive" } },
          { equipmentType: { contains: q, mode: "insensitive" } },
          { serviceType: { contains: q, mode: "insensitive" } },
          { actionsTaken: { contains: q, mode: "insensitive" } },
          { customer: { name: { contains: q, mode: "insensitive" } } },
        ],
      },
      select: {
        id: true,
        status: true,
        scheduledAt: true,
        equipmentType: true,
        symptomSummary: true,
        customer: { select: { id: true, name: true, address: true } },
        technician: { select: { name: true } },
      },
      take: 5,
      orderBy: { scheduledAt: "desc" },
    }),
    prisma.customer.findMany({
      where: {
        organizationId,
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { phone: { contains: q, mode: "insensitive" } },
          { address: { contains: q, mode: "insensitive" } },
          { email: { contains: q, mode: "insensitive" } },
        ],
      },
      select: { id: true, name: true, phone: true, address: true, email: true },
      take: 5,
      orderBy: { name: "asc" },
    }),
    prisma.equipment.findMany({
      where: {
        organizationId,
        OR: [
          { equipmentType: { contains: q, mode: "insensitive" } },
          { make: { contains: q, mode: "insensitive" } },
          { model: { contains: q, mode: "insensitive" } },
          { serialNumber: { contains: q, mode: "insensitive" } },
          { customer: { name: { contains: q, mode: "insensitive" } } },
        ],
      },
      select: {
        id: true,
        equipmentType: true,
        make: true,
        model: true,
        serialNumber: true,
        customer: { select: { id: true, name: true } },
      },
      take: 5,
      orderBy: { createdAt: "desc" },
    }),
  ])

  // Map technician to assignedTechnician shape expected by frontend
  const mappedJobs = jobs.map((j) => ({
    ...j,
    assignedTechnician: j.technician ?? null,
    technician: undefined,
  }))

  res.json({ jobs: mappedJobs, customers, equipment })
})
