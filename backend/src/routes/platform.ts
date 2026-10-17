import { Router } from "express"
import { prisma } from "../lib/prisma.js"
import { isPlatformAdminEmail } from "../lib/platform-admin.js"
import { randomBytes } from "node:crypto"
import { resetDemoAccount } from "../services/demo-account/reset.js"

export const platformRouter = Router()

// Platform-admin only. Returns account-level facts about every organization
// (who, which plan, how much they've set up) and deliberately nothing from
// inside a shop: no customer names, addresses, jobs or messages.
platformRouter.use(async (req, res, next) => {
  try {
    const me = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { email: true },
    })
    if (!isPlatformAdminEmail(me?.email)) {
      return res.status(404).json({ error: "Not found" })
    }
    next()
  } catch {
    return res.status(500).json({ error: "Failed to verify access" })
  }
})

platformRouter.get("/organizations", async (_req, res) => {
  try {
    const orgs = await prisma.organization.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        createdAt: true,
        plan: true,
        trialEndsAt: true,
        sandboxMode: true,
        sandboxEndedAt: true,
        stripeCustomerId: true,
        users: {
          where: { role: "office" },
          orderBy: { createdAt: "asc" },
          take: 1,
          select: { email: true, name: true },
        },
        _count: {
          select: {
            users: true,
            customers: { where: { isSample: false } },
            technicians: { where: { isSample: false } },
            jobs: { where: { customer: { isSample: false } } },
          },
        },
      },
    })

    res.json(
      orgs.map(({ users, _count, ...org }) => ({
        ...org,
        owner: users[0] ?? null,
        counts: {
          users: _count.users,
          customers: _count.customers,
          technicians: _count.technicians,
          jobs: _count.jobs,
        },
      })),
    )
  } catch {
    res.status(500).json({ error: "Failed to load organizations" })
  }
})

// Rebuilds the founder's demo organization with a month of data dated around today.
// A fresh random password is generated each time and returned once; it's never logged.
let demoResetRunning = false
platformRouter.post("/demo/reset", async (_req, res) => {
  if (demoResetRunning) return res.status(409).json({ error: "A reset is already running" })
  demoResetRunning = true
  try {
    const result = await resetDemoAccount({ password: randomBytes(9).toString("base64url") })
    res.json(result)
  } catch (e) {
    console.error("[demo-reset] failed:", e instanceof Error ? e.message : e)
    res.status(500).json({ error: "Failed to reset the demo account" })
  } finally {
    demoResetRunning = false
  }
})
