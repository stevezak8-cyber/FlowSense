import { Router } from "express"
import { z } from "zod"
import { prisma } from "../lib/prisma.js"
import { streamFieldAiResponse } from "../services/field-ai.js"

export const aiRouter = Router()

const chatSchema = z.object({
  jobId: z.string().min(1),
  message: z.string().min(1).max(4000),
})

aiRouter.post("/chat/stream", async (req, res) => {
  // 503 check FIRST — before Zod validation, DB writes, or SSE headers
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({ error: "not_configured" })
  }

  const parsed = chatSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() })
  }

  const { jobId, message } = parsed.data
  const userId = req.user!.id
  const organizationId = req.user!.organizationId

  // Verify job exists and belongs to this org before writing anything
  const job = await prisma.job.findFirst({
    where: { id: jobId, organizationId },
    select: { id: true },
  })
  if (!job) {
    return res.status(404).json({ error: "job_not_found" })
  }

  // Save user message to DB
  await prisma.aiMessage.create({
    data: { jobId, role: "user", content: message },
  })

  // Set SSE headers
  res.setHeader("Content-Type", "text/event-stream")
  res.setHeader("Cache-Control", "no-cache")
  res.setHeader("Connection", "keep-alive")
  res.flushHeaders()

  await streamFieldAiResponse(
    jobId,
    userId,
    organizationId,
    (token) => {
      res.write(`data: ${JSON.stringify({ token })}\n\n`)
    },
    async (fullText) => {
      await prisma.aiMessage.create({
        data: { jobId, role: "assistant", content: fullText },
      })
      res.write("data: [DONE]\n\n")
      res.end()
    },
    (err) => {
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`)
      res.end()
    }
  )
})

aiRouter.get("/chat/:jobId", async (req, res) => {
  const { jobId } = req.params
  const organizationId = req.user!.organizationId

  const job = await prisma.job.findFirst({
    where: { id: jobId, organizationId },
    select: { id: true },
  })
  if (!job) return res.status(404).json({ error: "job_not_found" })

  const messages = await prisma.aiMessage.findMany({
    where: { jobId },
    orderBy: { createdAt: "asc" },
  })
  res.json(messages)
})
