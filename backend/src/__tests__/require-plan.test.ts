import { describe, it, expect, vi, beforeEach } from "vitest"
import request from "supertest"
import express from "express"

vi.mock("../lib/prisma.js", () => ({
  prisma: { organization: { findUnique: vi.fn() } },
}))

import { prisma } from "../lib/prisma.js"
import { requireAdvancedPlan, requireConciergePlan, requireCsvImportPlan } from "../middleware/require-plan.js"

function makeApp(middleware: express.RequestHandler) {
  const app = express()
  app.use((req, _res, next) => {
    ;(req as express.Request & { user: unknown }).user = { userId: "u1", organizationId: "org-1", role: "office" }
    next()
  })
  app.get("/", middleware, (_req, res) => res.json({ ok: true }))
  return app
}

beforeEach(() => vi.clearAllMocks())

describe("requireAdvancedPlan", () => {
  it.each(["fleet", "enterprise", "trial"])("allows plan=%s", async (plan) => {
    vi.mocked(prisma.organization.findUnique).mockResolvedValue({ plan } as never)
    const res = await request(makeApp(requireAdvancedPlan)).get("/")
    expect(res.status).toBe(200)
  })

  it.each(["starter", "shop", "cancelled", "payment_failed"])("blocks plan=%s with 402", async (plan) => {
    vi.mocked(prisma.organization.findUnique).mockResolvedValue({ plan } as never)
    const res = await request(makeApp(requireAdvancedPlan)).get("/")
    expect(res.status).toBe(402)
    expect(res.body.error).toMatch(/Fleet plan/)
  })

  it("blocks with 402 when the organization can't be found", async () => {
    vi.mocked(prisma.organization.findUnique).mockResolvedValue(null)
    const res = await request(makeApp(requireAdvancedPlan)).get("/")
    expect(res.status).toBe(402)
  })
})

describe("requireConciergePlan", () => {
  it("allows enterprise, blocks fleet", async () => {
    vi.mocked(prisma.organization.findUnique).mockResolvedValue({ plan: "enterprise" } as never)
    expect((await request(makeApp(requireConciergePlan)).get("/")).status).toBe(200)

    vi.mocked(prisma.organization.findUnique).mockResolvedValue({ plan: "fleet" } as never)
    const res = await request(makeApp(requireConciergePlan)).get("/")
    expect(res.status).toBe(402)
    expect(res.body.error).toMatch(/Enterprise plan/)
  })
})

describe("requireCsvImportPlan", () => {
  it("allows shop, blocks starter", async () => {
    vi.mocked(prisma.organization.findUnique).mockResolvedValue({ plan: "shop" } as never)
    expect((await request(makeApp(requireCsvImportPlan)).get("/")).status).toBe(200)

    vi.mocked(prisma.organization.findUnique).mockResolvedValue({ plan: "starter" } as never)
    const res = await request(makeApp(requireCsvImportPlan)).get("/")
    expect(res.status).toBe(402)
    expect(res.body.error).toMatch(/Shop plan/)
  })
})
