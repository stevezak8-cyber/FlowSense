import { describe, it, expect, vi, beforeEach } from "vitest"
import request from "supertest"
import express from "express"

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    customer: { findFirst: vi.fn() },
    maintenancePlan: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    recurringJob: { updateMany: vi.fn() },
    $transaction: vi.fn(),
  },
}))

vi.mock("../services/org-notifications.js", () => ({
  notifyOfficePlanCreated: vi.fn().mockResolvedValue(undefined),
}))

import { prisma } from "../lib/prisma.js"
import { maintenancePlansRouter } from "../routes/maintenance-plans.js"

const mockPrisma = prisma as unknown as {
  customer: { findFirst: ReturnType<typeof vi.fn> }
  maintenancePlan: {
    create: ReturnType<typeof vi.fn>
    findMany: ReturnType<typeof vi.fn>
    findFirst: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
  }
  recurringJob: { updateMany: ReturnType<typeof vi.fn> }
  $transaction: ReturnType<typeof vi.fn>
}

function makeApp(role = "office", orgId = "org1") {
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    ;(req as express.Request & { user: unknown }).user = { id: "user1", organizationId: orgId, role }
    next()
  })
  app.use("/", maintenancePlansRouter)
  return app
}

const samplePlanBody = {
  customerId: "cust1",
  name: "Gold Plan",
  price: 299,
  startDate: "2026-01-01T00:00:00.000Z",
  endDate: "2026-12-31T00:00:00.000Z",
  items: [{ equipmentId: "eq1", serviceType: "Tune-up", intervalMonths: 12 }],
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("POST /", () => {
  it("returns 403 for non-office role", async () => {
    const res = await request(makeApp("customer")).post("/").send(samplePlanBody)
    expect(res.status).toBe(403)
  })

  it("returns 400 when items array is empty", async () => {
    const res = await request(makeApp()).post("/").send({ ...samplePlanBody, items: [] })
    expect(res.status).toBe(400)
  })

  it("returns 403 if customerId is not in org", async () => {
    mockPrisma.customer.findFirst.mockResolvedValue(null)
    const res = await request(makeApp()).post("/").send(samplePlanBody)
    expect(res.status).toBe(403)
  })

  it("creates plan, items, RecurringJobs, and Invoice in one transaction", async () => {
    mockPrisma.customer.findFirst.mockResolvedValue({ id: "cust1", name: "Alice" })
    const createdPlan = { id: "plan1", name: "Gold Plan", invoiceId: "inv1", items: [], status: "active" }
    mockPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
      return fn({
        maintenancePlan: { create: vi.fn().mockResolvedValue(createdPlan), update: vi.fn().mockResolvedValue(createdPlan) },
        maintenancePlanItem: { create: vi.fn() },
        recurringJob: { create: vi.fn().mockResolvedValue({ id: "rj1" }) },
        invoice: { create: vi.fn().mockResolvedValue({ id: "inv1" }) },
      })
    })
    const res = await request(makeApp()).post("/").send(samplePlanBody)
    expect(res.status).toBe(201)
    expect(mockPrisma.$transaction).toHaveBeenCalled()
  })
})

describe("GET /", () => {
  it("returns only active plans by default", async () => {
    mockPrisma.maintenancePlan.findMany.mockResolvedValue([{ id: "p1", status: "active" }])
    const res = await request(makeApp()).get("/")
    expect(res.status).toBe(200)
    expect(mockPrisma.maintenancePlan.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: "active" }) })
    )
  })

  it("filters by customerId when provided", async () => {
    mockPrisma.maintenancePlan.findMany.mockResolvedValue([])
    const res = await request(makeApp()).get("/?customerId=cust1")
    expect(res.status).toBe(200)
    expect(mockPrisma.maintenancePlan.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ customerId: "cust1" }) })
    )
  })
})

describe("PATCH /:id", () => {
  it("cancels plan and deactivates linked RecurringJobs", async () => {
    const plan = {
      id: "plan1",
      organizationId: "org1",
      items: [{ recurringJobId: "rj1" }, { recurringJobId: "rj2" }],
    }
    mockPrisma.maintenancePlan.findFirst.mockResolvedValue(plan)
    mockPrisma.recurringJob.updateMany.mockResolvedValue({ count: 2 })
    mockPrisma.maintenancePlan.update.mockResolvedValue({ ...plan, status: "cancelled" })
    const res = await request(makeApp()).patch("/plan1").send({ status: "cancelled" })
    expect(res.status).toBe(200)
    expect(mockPrisma.recurringJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isActive: false } })
    )
  })
})
