import { Router } from "express"
import { prisma } from "../lib/prisma.js"
import { isPlatformAdminEmail } from "../lib/platform-admin.js"
import { randomBytes } from "node:crypto"
import { resetDemoAccount } from "../services/demo-account/reset.js"
import { createSandboxAccount } from "../services/sandbox-account.js"
import { z } from "zod"

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

// Lets the founder sign-in page confirm the account it just signed in is a platform
// admin. Behind the gate above, so anyone else gets the same 404 as every route here.
platformRouter.get("/me", (_req, res) => {
  res.json({ admin: true })
})

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

platformRouter.get("/organizations", async (_req, res) => {
  try {
    const since = new Date(Date.now() - WEEK_MS)
    const [orgs, lastSeen, newCustomers, newJobs] = await Promise.all([
      prisma.organization.findMany({
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
      }),
      // How recently anyone on the shop's own team (not their end customers) was in the app.
      prisma.user.groupBy({
        by: ["organizationId"],
        where: { role: { not: "customer" } },
        _max: { lastActiveAt: true, lastLoginAt: true },
      }),
      // What they've actually done lately. Counts only; never the records.
      prisma.customer.groupBy({
        by: ["organizationId"],
        where: { isSample: false, createdAt: { gte: since } },
        _count: { _all: true },
      }),
      prisma.job.groupBy({
        by: ["organizationId"],
        where: { createdAt: { gte: since }, customer: { isSample: false } },
        _count: { _all: true },
      }),
    ])

    const seenBy = new Map(lastSeen.map((r) => [r.organizationId, r._max]))
    const customersBy = new Map(newCustomers.map((r) => [r.organizationId, r._count._all]))
    const jobsBy = new Map(newJobs.map((r) => [r.organizationId, r._count._all]))

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
        activity: {
          lastActiveAt: seenBy.get(org.id)?.lastActiveAt ?? null,
          lastLoginAt: seenBy.get(org.id)?.lastLoginAt ?? null,
          customers7d: customersBy.get(org.id) ?? 0,
          jobs7d: jobsBy.get(org.id) ?? 0,
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

// A sandbox account for showing a prospect: sample data and the sandbox banner, no card, never billed.
const sandboxAccountSchema = z.object({
  companyName: z.string().trim().max(60).optional(),
  plan: z.enum(["starter", "shop", "fleet", "enterprise"]).default("fleet"),
})

platformRouter.post("/sandbox-accounts", async (req, res) => {
  const parsed = sandboxAccountSchema.safeParse(req.body ?? {})
  if (!parsed.success) return res.status(400).json({ error: "Check the company name and plan" })
  try {
    const account = await createSandboxAccount({ ...parsed.data, password: randomBytes(9).toString("base64url") })
    res.status(201).json(account)
  } catch (e) {
    console.error("[sandbox-account] failed:", e instanceof Error ? e.message : e)
    res.status(500).json({ error: "Failed to create the sandbox account" })
  }
})
