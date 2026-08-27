import { Router } from "express"
import { prisma } from "../lib/prisma.js"

export const notificationsRouter = Router()

// GET /api/notifications — latest 50 for this org
notificationsRouter.get("/", async (req, res) => {
  const { organizationId } = req.user!
  const notifications = await prisma.notification.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    take: 50,
  })
  const unreadCount = notifications.filter((n) => !n.read).length
  res.json({ notifications, unreadCount })
})

// PATCH /api/notifications/read-all — mark all as read
notificationsRouter.patch("/read-all", async (req, res) => {
  const { organizationId } = req.user!
  await prisma.notification.updateMany({
    where: { organizationId, read: false },
    data: { read: true },
  })
  res.json({ ok: true })
})

// PATCH /api/notifications/:id/read — mark one as read
notificationsRouter.patch("/:id/read", async (req, res) => {
  const { organizationId } = req.user!
  await prisma.notification.updateMany({
    where: { id: req.params.id, organizationId },
    data: { read: true },
  })
  res.json({ ok: true })
})
