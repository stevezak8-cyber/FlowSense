import { Router } from "express"
import { z } from "zod"
import { prisma } from "../lib/prisma.js"
import { getConciergeReply } from "../services/concierge-ai.js"

export const conciergeRouter = Router()

const chatSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string().min(1).max(4000),
    })
  ).min(1),
})

conciergeRouter.post("/chat", async (req, res) => {
  try {
    let customerId = req.user?.customerId
    // If the user doesn't have a customerId linked, look it up by userId
    if (!customerId) {
      const customer = await prisma.customer.findFirst({
        where: { organizationId: req.user!.organizationId },
        select: { id: true },
      })
      if (!customer) {
        return res.status(400).json({ error: "Customer account required" })
      }
      customerId = customer.id
    }

    const parsed = chatSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() })
    }

    const result = await getConciergeReply(customerId, req.user!.organizationId, parsed.data.messages)

    if (!result || "error" in result) {
      const errCode = result && "error" in result && result.error === "not_configured" ? 503 : 500
      return res.status(errCode).json({ error: (result as { error: string } | undefined)?.error ?? "failed" })
    }

    let jobCreated: { id: string } | undefined
    if (result.jobAction) {
      try {
        const job = await prisma.job.create({
          data: {
            organizationId: req.user!.organizationId,
            customerId,
            status: "pending",
            priority: "normal",
            scheduledAt: result.jobAction.scheduledAt,
            equipmentType: result.jobAction.equipmentType,
            symptomSummary: result.jobAction.symptomSummary,
          },
        })
        jobCreated = { id: job.id }
      } catch (e) {
        console.error("[Concierge] Job creation failed:", e)
      }
    }

    res.json({ reply: result.reply, ...(jobCreated ? { jobCreated } : {}) })
  } catch (e) {
    console.error("[Concierge] Unhandled error:", e)
    res.status(500).json({ error: "failed" })
  }
})
