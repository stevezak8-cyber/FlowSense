import { Router } from "express"
import { z } from "zod"
import { prisma } from "../lib/prisma.js"

export const pushRouter = Router()

pushRouter.get("/vapid-public-key", (_req, res) => {
  const publicKey = process.env.VAPID_PUBLIC_KEY
  if (!publicKey) return res.status(503).json({ error: "Push not configured" })
  res.json({ publicKey })
})

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string(), auth: z.string() }),
})

pushRouter.post("/subscribe", async (req, res) => {
  const parsed = subscribeSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })
  const { endpoint, keys } = parsed.data
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: {
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      userId: req.user!.userId,
      organizationId: req.user!.organizationId,
    },
    update: { p256dh: keys.p256dh, auth: keys.auth },
  })
  res.status(201).json({ ok: true })
})

pushRouter.delete("/subscribe", async (req, res) => {
  const endpoint = req.query.endpoint as string | undefined
  if (!endpoint) return res.status(400).json({ error: "endpoint query parameter required" })
  await prisma.pushSubscription.deleteMany({
    where: { endpoint, userId: req.user!.userId },
  })
  res.status(204).send()
})
