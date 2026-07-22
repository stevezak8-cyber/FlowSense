import { describe, it, expect, vi, beforeEach } from "vitest"
import express from "express"
import request from "supertest"

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    equipment: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    customer: { findFirst: vi.fn() },
    job: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
  },
}))

import { equipmentRouter } from "../routes/equipment.js"
import { prisma } from "../lib/prisma.js"

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    ;(req as any).user = { id: "user-1", organizationId: "org-1", role: "office" }
    next()
  })
  app.use("/api/equipment", equipmentRouter)
  return app
}

describe("GET /api/equipment", () => {
  beforeEach(() => { vi.clearAllMocks() })

  it("returns equipment list for the org", async () => {
    vi.mocked(prisma.equipment.findMany).mockResolvedValue([
      { id: "eq-1", equipmentType: "ac", serviceIntervalMonths: 12,
        lastServicedAt: null, installDate: null, createdAt: new Date() } as any,
    ])
    const app = buildApp()
    const res = await request(app).get("/api/equipment")
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body[0]).toHaveProperty("nextDueAt")
  })

  it("filters by customerId when provided", async () => {
    vi.mocked(prisma.equipment.findMany).mockResolvedValue([])
    const app = buildApp()
    await request(app).get("/api/equipment?customerId=cust-1")
    expect(prisma.equipment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ customerId: "cust-1" }) })
    )
  })
})

describe("POST /api/equipment", () => {
  beforeEach(() => { vi.clearAllMocks() })

  it("returns 400 for missing required fields", async () => {
    const app = buildApp()
    const res = await request(app).post("/api/equipment").send({ customerId: "cust-1" })
    expect(res.status).toBe(400)
  })

  it("returns 403 when customer not in org", async () => {
    vi.mocked(prisma.customer.findFirst).mockResolvedValue(null)
    const app = buildApp()
    const res = await request(app).post("/api/equipment").send({
      customerId: "cust-other",
      equipmentType: "ac",
    })
    expect(res.status).toBe(403)
  })

  it("creates equipment and returns 201", async () => {
    vi.mocked(prisma.customer.findFirst).mockResolvedValue({ id: "cust-1" } as any)
    vi.mocked(prisma.equipment.create).mockResolvedValue({ id: "eq-1", equipmentType: "ac", serviceIntervalMonths: null, lastServicedAt: null, installDate: null, createdAt: new Date() } as any)
    const app = buildApp()
    const res = await request(app).post("/api/equipment").send({
      customerId: "cust-1",
      equipmentType: "ac",
    })
    expect(res.status).toBe(201)
  })
})

describe("PATCH /api/equipment/:id", () => {
  beforeEach(() => { vi.clearAllMocks() })

  it("returns 404 when equipment not found", async () => {
    vi.mocked(prisma.equipment.findFirst).mockResolvedValue(null)
    const app = buildApp()
    const res = await request(app).patch("/api/equipment/bad-id").send({ make: "Carrier" })
    expect(res.status).toBe(404)
  })
})

describe("DELETE /api/equipment/:id", () => {
  beforeEach(() => { vi.clearAllMocks() })

  it("returns 404 when equipment not found", async () => {
    vi.mocked(prisma.equipment.findFirst).mockResolvedValue(null)
    const app = buildApp()
    const res = await request(app).delete("/api/equipment/bad-id")
    expect(res.status).toBe(404)
  })

  it("deletes and returns 204", async () => {
    vi.mocked(prisma.equipment.findFirst).mockResolvedValue({ id: "eq-1", organizationId: "org-1" } as any)
    vi.mocked(prisma.equipment.delete).mockResolvedValue({} as any)
    const app = buildApp()
    const res = await request(app).delete("/api/equipment/eq-1")
    expect(res.status).toBe(204)
  })
})

describe("POST /api/equipment/check-maintenance", () => {
  beforeEach(() => { vi.clearAllMocks() })

  it("creates draft jobs for due units", async () => {
    const pastDate = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000)
    vi.mocked(prisma.equipment.findMany).mockResolvedValue([
      {
        id: "eq-1", customerId: "cust-1", equipmentType: "ac",
        organizationId: "org-1", serviceIntervalMonths: 12,
        lastServicedAt: pastDate, installDate: null, createdAt: pastDate,
      } as any,
    ])
    vi.mocked(prisma.job.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.job.create).mockResolvedValue({ id: "job-new" } as any)
    const app = buildApp()
    const res = await request(app).post("/api/equipment/check-maintenance")
    expect(res.status).toBe(200)
    expect(res.body.created).toHaveLength(1)
    expect(prisma.job.create).toHaveBeenCalledTimes(1)
  })

  it("skips units with existing pending/scheduled jobs", async () => {
    const pastDate = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000)
    vi.mocked(prisma.equipment.findMany).mockResolvedValue([
      {
        id: "eq-1", customerId: "cust-1", equipmentType: "ac",
        organizationId: "org-1", serviceIntervalMonths: 12,
        lastServicedAt: pastDate, installDate: null, createdAt: pastDate,
      } as any,
    ])
    vi.mocked(prisma.job.findFirst).mockResolvedValue({ id: "existing-job" } as any)
    const app = buildApp()
    const res = await request(app).post("/api/equipment/check-maintenance")
    expect(res.status).toBe(200)
    expect(res.body.created).toHaveLength(0)
    expect(prisma.job.create).not.toHaveBeenCalled()
  })
})
