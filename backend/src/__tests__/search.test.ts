import { describe, it, expect, vi, beforeEach } from "vitest"
import request from "supertest"
import express from "express"

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    job: { findMany: vi.fn() },
    customer: { findMany: vi.fn() },
    equipment: { findMany: vi.fn() },
  },
}))

import { prisma } from "../lib/prisma.js"
import { searchRouter } from "../routes/search.js"

const mockPrisma = prisma as unknown as {
  job: { findMany: ReturnType<typeof vi.fn> }
  customer: { findMany: ReturnType<typeof vi.fn> }
  equipment: { findMany: ReturnType<typeof vi.fn> }
}

function makeApp(role = "office") {
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    ;(req as express.Request & { user: unknown }).user = {
      id: "user1",
      organizationId: "org1",
      role,
    }
    next()
  })
  app.use("/", searchRouter)
  return app
}

beforeEach(() => {
  vi.resetAllMocks()
  mockPrisma.job.findMany.mockResolvedValue([])
  mockPrisma.customer.findMany.mockResolvedValue([])
  mockPrisma.equipment.findMany.mockResolvedValue([])
})

describe("GET /", () => {
  it("returns 400 for q shorter than 2 characters", async () => {
    const res = await request(makeApp()).get("/?q=a")
    expect(res.status).toBe(400)
  })

  it("returns 400 when q is missing", async () => {
    const res = await request(makeApp()).get("/")
    expect(res.status).toBe(400)
  })

  it("returns 403 for non-office role", async () => {
    const res = await request(makeApp("technician")).get("/?q=ac")
    expect(res.status).toBe(403)
  })

  it("returns empty arrays for no matches", async () => {
    const res = await request(makeApp()).get("/?q=zzz")
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ jobs: [], customers: [], equipment: [] })
  })

  it("returns matching customers by name", async () => {
    const customer = { id: "c1", name: "Alice Johnson", phone: "555-1234", address: "123 Main St", email: null }
    mockPrisma.customer.findMany.mockResolvedValue([customer])
    const res = await request(makeApp()).get("/?q=alice")
    expect(res.status).toBe(200)
    expect(res.body.customers).toHaveLength(1)
    expect(res.body.customers[0].name).toBe("Alice Johnson")
  })

  it("returns matching jobs by equipment type", async () => {
    const job = {
      id: "j1", status: "completed", scheduledAt: "2026-08-10T10:00:00Z",
      equipmentType: "AC Unit", symptomSummary: null,
      customer: { id: "c1", name: "Alice", address: "123 Main" },
      technician: null,
    }
    mockPrisma.job.findMany.mockResolvedValue([job])
    const res = await request(makeApp()).get("/?q=ac+unit")
    expect(res.status).toBe(200)
    expect(res.body.jobs).toHaveLength(1)
    expect(res.body.jobs[0].equipmentType).toBe("AC Unit")
  })

  it("results are scoped to the requesting org", async () => {
    mockPrisma.customer.findMany.mockResolvedValue([])
    await request(makeApp()).get("/?q=alice")
    const callArgs = mockPrisma.customer.findMany.mock.calls[0][0]
    expect(callArgs.where.organizationId).toBe("org1")
  })
})
