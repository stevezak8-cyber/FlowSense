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
  },
}))

import { prisma } from "../lib/prisma.js"
import { customersRouter } from "../routes/customers.js"

const mockPrisma = prisma as unknown as {
  customer: { findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> }
  equipment: { findMany: ReturnType<typeof vi.fn> }
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
