import { Request, Response, NextFunction } from "express"
import { prisma } from "../lib/prisma.js"

export async function requireSubscription(req: Request, res: Response, next: NextFunction) {
  const user = req.user
  if (!user) {
    return res.status(401).json({ error: "unauthorized" })
  }
  const org = await prisma.organization.findUnique({
    where: { id: user.organizationId },
    select: { plan: true },
  })
  if (org?.plan === "cancelled") {
    return res.status(402).json({
      error: "subscription_cancelled",
      message: "Your subscription has ended.",
    })
  }
  next()
}
