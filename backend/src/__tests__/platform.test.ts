import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import request from "supertest"
import express from "express"

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    user: { findUnique: vi.fn(), groupBy: vi.fn() },
    organization: { findMany: vi.fn() },
    customer: { groupBy: vi.fn() },
    job: { groupBy: vi.fn() },
  },
}))

import { prisma } from "../lib/prisma.js"
import { platformRouter } from "../routes/platform.js"
import { isPlatformAdminEmail } from "../lib/platform-admin.js"

function makeApp() {
  const app = express()
  app.use((req, _res, next) => {
    ;(req as express.Request & { user: unknown }).user = { userId: "u1", organizationId: "org-1", role: "office" }
    next()
  })
  app.use("/", platformRouter)
  return app
}

const ORIGINAL = process.env.PLATFORM_ADMIN_EMAILS
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(prisma.user.groupBy).mockResolvedValue([] as never)
  vi.mocked(prisma.customer.groupBy).mockResolvedValue([] as never)
  vi.mocked(prisma.job.groupBy).mockResolvedValue([] as never)
})
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.PLATFORM_ADMIN_EMAILS
  else process.env.PLATFORM_ADMIN_EMAILS = ORIGINAL
})

describe("isPlatformAdminEmail", () => {
  it("is false for everyone when the variable is unset or empty", () => {
    delete process.env.PLATFORM_ADMIN_EMAILS
    expect(isPlatformAdminEmail("a@b.com")).toBe(false)
    process.env.PLATFORM_ADMIN_EMAILS = " , "
    expect(isPlatformAdminEmail("a@b.com")).toBe(false)
    expect(isPlatformAdminEmail("")).toBe(false)
  })

  it("matches case-insensitively against a comma-separated list", () => {
    process.env.PLATFORM_ADMIN_EMAILS = "Founder@Pneuros.com, other@x.com"
    expect(isPlatformAdminEmail("founder@pneuros.com")).toBe(true)
    expect(isPlatformAdminEmail("OTHER@x.com")).toBe(true)
    expect(isPlatformAdminEmail("nobody@x.com")).toBe(false)
  })
})

describe("GET /organizations", () => {
  it("looks like a missing route (404) to anyone not on the allow-list", async () => {
    process.env.PLATFORM_ADMIN_EMAILS = "founder@pneuros.com"
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ email: "shopowner@example.com" } as never)
    const res = await request(makeApp()).get("/organizations")
    expect(res.status).toBe(404)
    expect(prisma.organization.findMany).not.toHaveBeenCalled()
  })

  it("is closed to everyone when no admins are configured", async () => {
    delete process.env.PLATFORM_ADMIN_EMAILS
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ email: "founder@pneuros.com" } as never)
    const res = await request(makeApp()).get("/organizations")
    expect(res.status).toBe(404)
  })

  it("returns account-level summaries for an admin, with no customer details", async () => {
    process.env.PLATFORM_ADMIN_EMAILS = "founder@pneuros.com"
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ email: "founder@pneuros.com" } as never)
    vi.mocked(prisma.organization.findMany).mockResolvedValue([
      {
        id: "o1", name: "Cool Air LLC", createdAt: new Date("2026-09-19"), plan: "trial",
        trialEndsAt: null, sandboxMode: true, sandboxEndedAt: null, stripeCustomerId: "cus_1",
        users: [{ email: "boss@cool.com", name: "Bo" }],
        _count: { users: 2, customers: 0, technicians: 1, jobs: 0 },
      },
    ] as never)

    const res = await request(makeApp()).get("/organizations")
    expect(res.status).toBe(200)
    expect(res.body[0]).toMatchObject({
      name: "Cool Air LLC",
      owner: { email: "boss@cool.com" },
      counts: { users: 2, customers: 0, technicians: 1, jobs: 0 },
      sandboxMode: true,
    })
    expect(res.body[0].users).toBeUndefined()

    // Only counts are requested for shop contents — never the records themselves.
    const select = vi.mocked(prisma.organization.findMany).mock.calls[0][0]!.select as Record<string, unknown>
    expect(select.customers).toBeUndefined()
    expect(select.jobs).toBeUndefined()
    expect(select.conversations).toBeUndefined()
  })

  describe("activity", () => {
    const org = (id: string) => ({
      id, name: id, createdAt: new Date("2026-10-01"), plan: "shop", trialEndsAt: null, sandboxMode: false,
      sandboxEndedAt: null, stripeCustomerId: null, users: [], _count: { users: 1, customers: 0, technicians: 0, jobs: 0 },
    })
    const asAdmin = () => {
      process.env.PLATFORM_ADMIN_EMAILS = "founder@pneuros.com"
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ email: "founder@pneuros.com" } as never)
    }

    it("reports when each shop's team was last in the app and what they did this week", async () => {
      asAdmin()
      const seen = new Date("2026-10-21T15:00:00Z")
      const login = new Date("2026-10-20T09:00:00Z")
      vi.mocked(prisma.organization.findMany).mockResolvedValue([org("busy"), org("quiet")] as never)
      vi.mocked(prisma.user.groupBy).mockResolvedValue([
        { organizationId: "busy", _max: { lastActiveAt: seen, lastLoginAt: login } },
      ] as never)
      vi.mocked(prisma.customer.groupBy).mockResolvedValue([{ organizationId: "busy", _count: { _all: 4 } }] as never)
      vi.mocked(prisma.job.groupBy).mockResolvedValue([{ organizationId: "busy", _count: { _all: 9 } }] as never)

      const res = await request(makeApp()).get("/organizations")
      const [busy, quiet] = res.body
      expect(busy.activity).toEqual({ lastActiveAt: seen.toISOString(), lastLoginAt: login.toISOString(), customers7d: 4, jobs7d: 9 })
      expect(quiet.activity).toEqual({ lastActiveAt: null, lastLoginAt: null, customers7d: 0, jobs7d: 0 })
    })

    it("counts only the shop's own team and real (non-sample) records from the last 7 days", async () => {
      asAdmin()
      vi.mocked(prisma.organization.findMany).mockResolvedValue([org("o")] as never)
      const before = Date.now()
      await request(makeApp()).get("/organizations")

      expect(vi.mocked(prisma.user.groupBy).mock.calls[0][0]).toMatchObject({ where: { role: { not: "customer" } } })

      const custWhere = vi.mocked(prisma.customer.groupBy).mock.calls[0][0].where as { isSample: boolean; createdAt: { gte: Date } }
      const jobWhere = vi.mocked(prisma.job.groupBy).mock.calls[0][0].where as { customer: { isSample: boolean }; createdAt: { gte: Date } }
      expect(custWhere.isSample).toBe(false)
      expect(jobWhere.customer).toEqual({ isSample: false })
      for (const gte of [custWhere.createdAt.gte, jobWhere.createdAt.gte]) {
        const ageDays = (before - gte.getTime()) / 86_400_000
        expect(ageDays).toBeGreaterThan(6.99)
        expect(ageDays).toBeLessThan(7.01)
      }
    })

    it("asks only for counts, never shop records, and the 404 gate still comes first", async () => {
      process.env.PLATFORM_ADMIN_EMAILS = "founder@pneuros.com"
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ email: "shopowner@example.com" } as never)
      expect((await request(makeApp()).get("/organizations")).status).toBe(404)
      expect(prisma.user.groupBy).not.toHaveBeenCalled()
      expect(prisma.job.groupBy).not.toHaveBeenCalled()
    })
  })
})
