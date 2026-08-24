import { Router } from "express"
import { prisma } from "../lib/prisma.js"

export const reviewsRouter = Router()

reviewsRouter.get("/", async (req, res) => {
  if (req.user!.role !== "office") return res.status(403).json({ error: "Forbidden" })
  const { customerId } = req.query as { customerId?: string }
  const reviews = await prisma.jobReview.findMany({
    where: {
      organizationId: req.user!.organizationId,
      ...(customerId ? { customerId } : {}),
    },
    include: {
      customer: { select: { name: true } },
      job: { select: { scheduledAt: true, equipmentType: true } },
    },
    orderBy: { createdAt: "desc" },
  })
  return res.json(reviews)
})
