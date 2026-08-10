import { describe, it, expect, vi, beforeEach } from "vitest"
import express from "express"
import request from "supertest"

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    complianceLog: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
  },
}))

import { complianceRouter } from "../routes/compliance.js"
import { prisma } from "../lib/prisma.js"

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    ;(req as any).user = { id: "user-1", organizationId: "org-1", role: "office" }
    next()
  })
  app.use("/api/compliance", complianceRouter)
  return app
}

describe("GET /api/compliance", () => {
  beforeEach(() => { vi.clearAllMocks() })

  it("returns logs scoped to the org", async () => {
    vi.mocked(prisma.complianceLog.findMany).mockResolvedValue([
      {
        id: "log-1", jobId: "job-1", type: "safety_ack",
        payload: { items: ["PPE worn"] }, createdAt: new Date(),
        job: {
          id: "job-1", scheduledAt: new Date(), equipmentType: "ac",
          customer: { name: "Acme" },
          technician: { user: { name: "Tech A" } },
        },
      } as any,
    ])
    const app = buildApp()
    const res = await request(app).get("/api/compliance")
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body[0]).toHaveProperty("job")
  })

  it("filters by type when provided", async () => {
    vi.mocked(prisma.complianceLog.findMany).mockResolvedValue([])
    const app = buildApp()
    await request(app).get("/api/compliance?type=epa608_prompt")
    expect(prisma.complianceLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ type: "epa608_prompt" }) })
    )
  })

  it("filters by technicianId when provided", async () => {
    vi.mocked(prisma.complianceLog.findMany).mockResolvedValue([])
    const app = buildApp()
    await request(app).get("/api/compliance?technicianId=tech-1")
    expect(prisma.complianceLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          job: expect.objectContaining({ technicianId: "tech-1" }),
        }),
      })
    )
  })

  it("defaults to last 90 days when no date range given", async () => {
    vi.mocked(prisma.complianceLog.findMany).mockResolvedValue([])
    const app = buildApp()
    await request(app).get("/api/compliance")
    const call = vi.mocked(prisma.complianceLog.findMany).mock.calls[0][0] as any
    expect(call.where.createdAt.gte).toBeInstanceOf(Date)
    const diffDays = (Date.now() - call.where.createdAt.gte.getTime()) / (1000 * 60 * 60 * 24)
    expect(diffDays).toBeGreaterThan(88)
    expect(diffDays).toBeLessThan(92)
  })
})

describe("GET /api/compliance/job/:jobId", () => {
  beforeEach(() => { vi.clearAllMocks() })

  it("returns logs for a specific job", async () => {
    vi.mocked(prisma.complianceLog.findMany).mockResolvedValue([
      { id: "log-1", jobId: "job-1", type: "safety_ack", payload: {}, createdAt: new Date() } as any,
    ])
    const app = buildApp()
    const res = await request(app).get("/api/compliance/job/job-1")
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })
})
