import { describe, it, expect, vi, beforeEach } from "vitest"
import express from "express"
import request from "supertest"

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    recurringJob: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    job: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
    },
    customer: {
      findFirst: vi.fn(),
    },
  },
}))

import { recurringJobsRouter } from "../routes/recurring-jobs.js"
import { spawnDueJobs } from "../services/recurring-jobs.js"
import { prisma } from "../lib/prisma.js"

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    ;(req as any).user = { id: "user-1", organizationId: "org-1", role: "office" }
    next()
  })
  app.use("/api/recurring-jobs", recurringJobsRouter)
  return app
}

describe("GET /api/recurring-jobs", () => {
  beforeEach(() => { vi.clearAllMocks() })

  it("returns org-scoped recurring jobs", async () => {
    vi.mocked(prisma.recurringJob.findMany).mockResolvedValue([
      { id: "rj-1", organizationId: "org-1", customerId: "cust-1", intervalDays: 90, isActive: true } as any,
    ])
    const res = await request(buildApp()).get("/api/recurring-jobs")
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it("filters by customerId", async () => {
    vi.mocked(prisma.recurringJob.findMany).mockResolvedValue([])
    await request(buildApp()).get("/api/recurring-jobs?customerId=cust-1")
    expect(prisma.recurringJob.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ customerId: "cust-1" }) })
    )
  })
})

describe("POST /api/recurring-jobs", () => {
  beforeEach(() => { vi.clearAllMocks() })

  it("returns 400 for invalid intervalDays", async () => {
    const res = await request(buildApp()).post("/api/recurring-jobs").send({
      customerId: "cust-1",
      intervalDays: 999,
      nextDueAt: new Date().toISOString(),
    })
    expect(res.status).toBe(400)
  })

  it("returns 403 if customer not in org", async () => {
    vi.mocked(prisma.customer.findFirst).mockResolvedValue(null)
    const res = await request(buildApp()).post("/api/recurring-jobs").send({
      customerId: "other-cust",
      intervalDays: 30,
      nextDueAt: new Date().toISOString(),
    })
    expect(res.status).toBe(403)
  })

  it("creates a recurring job and returns 201", async () => {
    vi.mocked(prisma.customer.findFirst).mockResolvedValue({ id: "cust-1" } as any)
    vi.mocked(prisma.recurringJob.create).mockResolvedValue({
      id: "rj-1", customerId: "cust-1", intervalDays: 30, isActive: true,
    } as any)
    const res = await request(buildApp()).post("/api/recurring-jobs").send({
      customerId: "cust-1",
      intervalDays: 30,
      nextDueAt: new Date().toISOString(),
    })
    expect(res.status).toBe(201)
  })
})

describe("PATCH /api/recurring-jobs/:id", () => {
  beforeEach(() => { vi.clearAllMocks() })

  it("returns 404 when not found", async () => {
    vi.mocked(prisma.recurringJob.findFirst).mockResolvedValue(null)
    const res = await request(buildApp()).patch("/api/recurring-jobs/not-exist").send({ isActive: false })
    expect(res.status).toBe(404)
  })

  it("updates and returns the record", async () => {
    vi.mocked(prisma.recurringJob.findFirst).mockResolvedValue({ id: "rj-1", organizationId: "org-1" } as any)
    vi.mocked(prisma.recurringJob.update).mockResolvedValue({ id: "rj-1", isActive: false } as any)
    const res = await request(buildApp()).patch("/api/recurring-jobs/rj-1").send({ isActive: false })
    expect(res.status).toBe(200)
  })
})

describe("DELETE /api/recurring-jobs/:id", () => {
  beforeEach(() => { vi.clearAllMocks() })

  it("returns 404 when not found", async () => {
    vi.mocked(prisma.recurringJob.findFirst).mockResolvedValue(null)
    const res = await request(buildApp()).delete("/api/recurring-jobs/not-exist")
    expect(res.status).toBe(404)
  })

  it("returns 204 on success", async () => {
    vi.mocked(prisma.recurringJob.findFirst).mockResolvedValue({ id: "rj-1", organizationId: "org-1" } as any)
    vi.mocked(prisma.recurringJob.delete).mockResolvedValue({} as any)
    const res = await request(buildApp()).delete("/api/recurring-jobs/rj-1")
    expect(res.status).toBe(204)
  })
})

describe("GET /api/recurring-jobs/pending-drafts", () => {
  beforeEach(() => { vi.clearAllMocks() })

  it("returns pending draft jobs for the org", async () => {
    vi.mocked(prisma.job.findMany).mockResolvedValue([
      {
        id: "job-1", customerId: "cust-1", equipmentType: "ac", serviceType: "maintenance",
        recurringJobId: "rj-1", createdAt: new Date(),
        customer: { name: "Acme" },
        recurringJob: { nextDueAt: new Date(), intervalDays: 90, equipment: null },
      } as any,
    ])
    const res = await request(buildApp()).get("/api/recurring-jobs/pending-drafts")
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body[0]).toHaveProperty("recurringJob")
  })
})

describe("spawnDueJobs", () => {
  beforeEach(() => { vi.clearAllMocks() })

  it("creates draft jobs for due schedules", async () => {
    vi.mocked(prisma.recurringJob.findMany).mockResolvedValue([
      {
        id: "rj-1", organizationId: "org-1", customerId: "cust-1",
        technicianId: null, equipmentId: null, equipmentType: "ac",
        serviceType: "maintenance", intervalDays: 90,
        nextDueAt: new Date(Date.now() + 7 * 86400000),
        notes: "Annual check",
      } as any,
    ])
    vi.mocked(prisma.job.create).mockResolvedValue({ id: "job-new" } as any)
    const count = await spawnDueJobs("org-1")
    expect(count).toBe(1)
    expect(prisma.job.create).toHaveBeenCalledTimes(1)
  })

  it("skips schedules that already have a pending draft", async () => {
    vi.mocked(prisma.recurringJob.findMany).mockResolvedValue([])
    const count = await spawnDueJobs("org-1")
    expect(count).toBe(0)
    expect(prisma.job.create).not.toHaveBeenCalled()
  })
})
