import { describe, it, expect, vi, beforeEach } from "vitest"
import request from "supertest"
import express from "express"

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    customer: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    equipment: {
      findMany: vi.fn(),
    },
    job: {
      findMany: vi.fn(),
    },
  },
}))

import { prisma } from "../lib/prisma.js"
import { customersRouter } from "../routes/customers.js"

const mockPrisma = prisma as unknown as {
  customer: { findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> }
  equipment: { findMany: ReturnType<typeof vi.fn> }
  job: { findMany: ReturnType<typeof vi.fn> }
}

function makeApp(role = "customer", customerId = "cust1", organizationId = "org1") {
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    ;(req as express.Request & { user: unknown }).user = {
      id: "user1",
      organizationId,
      role,
      customerId,
    }
    next()
  })
  app.use("/", customersRouter)
  return app
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe("GET /me", () => {
  it("returns 403 for non-customer role", async () => {
    const res = await request(makeApp("office")).get("/me")
    expect(res.status).toBe(403)
  })

  it("returns customer profile for customer role", async () => {
    mockPrisma.customer.findUnique.mockResolvedValue({
      id: "cust1",
      name: "Alice",
      phone: "5550001234",
      email: "alice@example.com",
      address: "123 Main St",
      smsOptOut: false,
      emailOptOut: false,
    })
    const res = await request(makeApp()).get("/me")
    expect(res.status).toBe(200)
    expect(res.body.name).toBe("Alice")
    expect(res.body.emailOptOut).toBe(false)
  })
})

describe("PATCH /me", () => {
  it("updates name and phone", async () => {
    mockPrisma.customer.update.mockResolvedValue({
      id: "cust1",
      name: "Alice Updated",
      phone: "5550009999",
      email: null,
      address: "123 Main St",
      smsOptOut: false,
      emailOptOut: false,
    })
    const res = await request(makeApp()).patch("/me").send({ name: "Alice Updated", phone: "5550009999" })
    expect(res.status).toBe(200)
    expect(res.body.name).toBe("Alice Updated")
    const callArgs = mockPrisma.customer.update.mock.calls[0][0]
    expect(callArgs.data.name).toBe("Alice Updated")
    expect(callArgs.where.id).toBe("cust1")
  })

  it("toggles smsOptOut", async () => {
    mockPrisma.customer.update.mockResolvedValue({
      id: "cust1", name: "Alice", phone: "5550001234", email: null,
      address: "123 Main St", smsOptOut: true, emailOptOut: false,
    })
    const res = await request(makeApp()).patch("/me").send({ smsOptOut: true })
    expect(res.status).toBe(200)
    expect(res.body.smsOptOut).toBe(true)
  })

  it("toggles emailOptOut", async () => {
    mockPrisma.customer.update.mockResolvedValue({
      id: "cust1", name: "Alice", phone: "5550001234", email: "a@b.com",
      address: "123 Main St", smsOptOut: false, emailOptOut: true,
    })
    const res = await request(makeApp()).patch("/me").send({ emailOptOut: true })
    expect(res.status).toBe(200)
    expect(res.body.emailOptOut).toBe(true)
  })
})

describe("GET /me/jobs", () => {
  it("returns 403 for non-customer role", async () => {
    const res = await request(makeApp("office")).get("/me/jobs")
    expect(res.status).toBe(403)
  })

  it("returns completed and cancelled jobs for the customer", async () => {
    mockPrisma.job.findMany.mockResolvedValue([
      {
        id: "job1",
        status: "completed",
        scheduledAt: "2026-08-10T10:00:00.000Z",
        completedAt: "2026-08-10T12:00:00.000Z",
        equipmentType: "AC",
        symptomSummary: "Not cooling",
        actionsTaken: "Replaced capacitor",
        technician: { name: "Bob Tech" },
      },
      {
        id: "job2",
        status: "cancelled",
        scheduledAt: "2026-07-01T09:00:00.000Z",
        completedAt: null,
        equipmentType: null,
        symptomSummary: null,
        actionsTaken: null,
        technician: null,
      },
    ])
    const res = await request(makeApp()).get("/me/jobs")
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(2)
    expect(res.body[0].status).toBe("completed")
    expect(res.body[1].status).toBe("cancelled")
    const callArgs = mockPrisma.job.findMany.mock.calls[0][0]
    expect(callArgs.where.customerId).toBe("cust1")
    expect(callArgs.where.organizationId).toBe("org1")
    expect(callArgs.where.status.in).toContain("completed")
    expect(callArgs.where.status.in).toContain("cancelled")
  })
})

describe("GET /me/equipment", () => {
  it("returns equipment scoped to the customer and org", async () => {
    mockPrisma.equipment.findMany.mockResolvedValue([
      { id: "eq1", equipmentType: "AC", make: "Carrier", model: "24ACC", serialNumber: "SN123",
        installDate: null, warrantyExpiry: null, serviceIntervalMonths: 12, lastServicedAt: null },
    ])
    const res = await request(makeApp()).get("/me/equipment")
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].equipmentType).toBe("AC")
    const callArgs = mockPrisma.equipment.findMany.mock.calls[0][0]
    expect(callArgs.where.customerId).toBe("cust1")
    expect(callArgs.where.organizationId).toBe("org1")
  })
})
