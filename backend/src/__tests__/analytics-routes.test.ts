import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    invoice: { findMany: vi.fn() },
    job: { findMany: vi.fn() },
    equipment: { findMany: vi.fn(), count: vi.fn() },
    customer: { findMany: vi.fn(), count: vi.fn() },
  },
}))

vi.mock("../services/analytics-ai.js", () => ({
  getAtRiskReasons: vi.fn().mockResolvedValue({}),
  getAnalyticsNarrative: vi.fn().mockResolvedValue("Business is trending upward this quarter."),
}))

import request from "supertest"
import express from "express"
import { dashboardRouter } from "../routes/dashboard.js"
import { prisma } from "../lib/prisma.js"
import { getAtRiskReasons, getAnalyticsNarrative } from "../services/analytics-ai.js"

const mockPrisma = prisma as unknown as {
  invoice: { findMany: ReturnType<typeof vi.fn> }
  job: { findMany: ReturnType<typeof vi.fn> }
  equipment: { findMany: ReturnType<typeof vi.fn>; count: ReturnType<typeof vi.fn> }
  customer: { findMany: ReturnType<typeof vi.fn>; count: ReturnType<typeof vi.fn> }
}

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    ;(req as express.Request & { user: unknown }).user = {
      organizationId: "org1",
      role: "office",
    }
    next()
  })
  app.use("/", dashboardRouter)
  return app
}

function setupDefaultMocks() {
  mockPrisma.invoice.findMany.mockResolvedValue([])
  mockPrisma.job.findMany.mockResolvedValue([])
  mockPrisma.equipment.findMany.mockResolvedValue([])
  mockPrisma.equipment.count.mockResolvedValue(0)
  mockPrisma.customer.findMany.mockResolvedValue([])
  mockPrisma.customer.count.mockResolvedValue(0)
}

describe("GET /analytics/data", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupDefaultMocks()
  })

  it("returns 200 with correct shape", async () => {
    const res = await request(makeApp()).get("/analytics/data")
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty("revenueTrend")
    expect(res.body).toHaveProperty("jobTrend")
    expect(res.body).toHaveProperty("forecast")
    expect(res.body).toHaveProperty("equipmentBreakdown")
    expect(res.body).toHaveProperty("atRisk")
    expect(Array.isArray(res.body.revenueTrend)).toBe(true)
    expect(Array.isArray(res.body.jobTrend)).toBe(true)
    expect(Array.isArray(res.body.atRisk)).toBe(true)
  })

  it("atRisk includes customer with overdue equipment (lastServicedAt + serviceIntervalMonths in the past)", async () => {
    const pastDate = new Date()
    pastDate.setMonth(pastDate.getMonth() - 24) // serviced 24 months ago
    mockPrisma.equipment.findMany.mockImplementation((args: { where?: { warrantyExpiry?: unknown; lastServicedAt?: unknown; serviceIntervalMonths?: unknown } }) => {
      // overdue query: lastServicedAt not null + serviceIntervalMonths not null
      if (args?.where?.lastServicedAt && args?.where?.serviceIntervalMonths) {
        return Promise.resolve([
          {
            id: "eq1",
            customerId: "cust1",
            lastServicedAt: pastDate,
            serviceIntervalMonths: 12,
            customer: { id: "cust1", name: "Bob", address: "123 Main St" },
          },
        ])
      }
      return Promise.resolve([])
    })
    const res = await request(makeApp()).get("/analytics/data")
    expect(res.status).toBe(200)
    const atRisk = res.body.atRisk as Array<{ customerId: string; flags: string[] }>
    const customer = atRisk.find((c) => c.customerId === "cust1")
    expect(customer).toBeDefined()
    expect(customer?.flags).toContain("overdue_service")
  })

  it("atRisk includes customer with warrantyExpiry within 90 days", async () => {
    const soonDate = new Date()
    soonDate.setDate(soonDate.getDate() + 30)
    mockPrisma.equipment.findMany.mockImplementation((args: { where?: { warrantyExpiry?: unknown; lastServicedAt?: unknown } }) => {
      if (args?.where?.warrantyExpiry) {
        return Promise.resolve([
          {
            id: "eq2",
            customerId: "cust2",
            warrantyExpiry: soonDate,
            customer: { id: "cust2", name: "Carol", address: "456 Oak Ave" },
          },
        ])
      }
      return Promise.resolve([])
    })
    const res = await request(makeApp()).get("/analytics/data")
    expect(res.status).toBe(200)
    const atRisk = res.body.atRisk as Array<{ customerId: string; flags: string[] }>
    const customer = atRisk.find((c) => c.customerId === "cust2")
    expect(customer).toBeDefined()
    expect(customer?.flags).toContain("warranty_expiring")
  })

  it("atRisk includes customer with no completed job in 12+ months", async () => {
    mockPrisma.customer.findMany.mockResolvedValue([
      { id: "cust3", name: "Dave", address: "789 Pine Rd" },
    ])
    const res = await request(makeApp()).get("/analytics/data")
    expect(res.status).toBe(200)
    const atRisk = res.body.atRisk as Array<{ customerId: string; flags: string[] }>
    const customer = atRisk.find((c) => c.customerId === "cust3")
    expect(customer).toBeDefined()
    expect(customer?.flags).toContain("no_recent_job")
  })

  it("customer appears once even when multiple flags apply", async () => {
    const pastDate = new Date()
    pastDate.setMonth(pastDate.getMonth() - 24)
    const soonDate = new Date()
    soonDate.setDate(soonDate.getDate() + 30)
    mockPrisma.equipment.findMany.mockResolvedValue([
      {
        id: "eq3",
        customerId: "cust4",
        lastServicedAt: pastDate,
        serviceIntervalMonths: 12,
        warrantyExpiry: soonDate,
        customer: { id: "cust4", name: "Eve", address: "101 Elm St" },
      },
    ])
    const res = await request(makeApp()).get("/analytics/data")
    expect(res.status).toBe(200)
    const atRisk = res.body.atRisk as Array<{ customerId: string }>
    const matches = atRisk.filter((c) => c.customerId === "cust4")
    expect(matches.length).toBe(1)
    expect(matches[0].flags).toContain("overdue_service")
    expect(matches[0].flags).toContain("warranty_expiring")
  })

  it("equipment with null lastServicedAt does NOT trigger overdue_service", async () => {
    mockPrisma.equipment.findMany.mockResolvedValue([])
    const res = await request(makeApp()).get("/analytics/data")
    expect(res.status).toBe(200)
    expect(res.body.atRisk).toEqual([])
  })

  it("forecast.projectedRevenue averages 2 available months when only 2 months of data exist", async () => {
    const now = new Date()
    const m1 = new Date(now.getFullYear(), now.getMonth() - 1, 15)
    const m2 = new Date(now.getFullYear(), now.getMonth() - 2, 15)
    mockPrisma.invoice.findMany.mockResolvedValue([
      { issuedDate: m1, amount: 1000 },
      { issuedDate: m2, amount: 2000 },
    ])
    const res = await request(makeApp()).get("/analytics/data")
    expect(res.status).toBe(200)
    // average of 1000 and 2000 = 1500
    expect(res.body.forecast.projectedRevenue).toBeCloseTo(1500, 0)
  })

  it("forecast.projectedRevenue is 0 when revenueTrend is empty", async () => {
    mockPrisma.invoice.findMany.mockResolvedValue([])
    const res = await request(makeApp()).get("/analytics/data")
    expect(res.status).toBe(200)
    expect(res.body.forecast.projectedRevenue).toBe(0)
  })
})

describe("GET /analytics/insights", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupDefaultMocks()
  })

  it("returns 200 with narrative string when AI configured", async () => {
    ;(getAnalyticsNarrative as ReturnType<typeof vi.fn>).mockResolvedValue("Revenue is trending upward.")
    const res = await request(makeApp()).get("/analytics/insights")
    expect(res.status).toBe(200)
    expect(typeof res.body.narrative).toBe("string")
  })

  it("returns 200 with narrative null when AI not configured", async () => {
    ;(getAnalyticsNarrative as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    const res = await request(makeApp()).get("/analytics/insights")
    expect(res.status).toBe(200)
    expect(res.body.narrative).toBeNull()
  })
})
