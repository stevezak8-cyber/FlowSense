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
    // The concierge speaks to one specific customer and can book jobs for them,
    // so it needs a login that is linked to a customer record. (It used to fall
    // back to the org's first customer, which handed one customer's name, jobs
    // and address to whoever had no link — including staff logins.)
    const customerId = req.user?.customerId
    if (req.user?.role !== "customer" || !customerId) {
      return res.status(400).json({ error: "Customer account required" })
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
