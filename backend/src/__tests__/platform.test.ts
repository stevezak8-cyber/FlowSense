import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import request from "supertest"
import express from "express"

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    organization: { findMany: vi.fn() },
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
beforeEach(() => vi.clearAllMocks())
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
})
