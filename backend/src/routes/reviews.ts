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

// PATCH /api/reviews/:id — add office response or flag a review
reviewsRouter.patch("/:id", async (req, res) => {
  if (req.user!.role !== "office") return res.status(403).json({ error: "Forbidden" })
  const { officeResponse, flagged } = req.body as { officeResponse?: string; flagged?: boolean }
  try {
    const review = await prisma.jobReview.findFirst({
      where: { id: req.params.id, organizationId: req.user!.organizationId },
    })
    if (!review) return res.status(404).json({ error: "Review not found" })
    const updated = await prisma.jobReview.update({
      where: { id: req.params.id },
      data: {
        ...(officeResponse !== undefined ? { officeResponse } : {}),
        ...(flagged !== undefined ? { flagged } : {}),
      },
    })
    return res.json(updated)
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : "Failed to update review" })
  }
})

// DELETE /api/reviews/:id — remove a review (office only)
reviewsRouter.delete("/:id", async (req, res) => {
  if (req.user!.role !== "office") return res.status(403).json({ error: "Forbidden" })
  try {
    const review = await prisma.jobReview.findFirst({
      where: { id: req.params.id, organizationId: req.user!.organizationId },
    })
    if (!review) return res.status(404).json({ error: "Review not found" })
    await prisma.jobReview.delete({ where: { id: req.params.id } })
    return res.status(204).send()
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : "Failed to delete review" })
  }
})
