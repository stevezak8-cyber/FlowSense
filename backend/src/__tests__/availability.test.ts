import { describe, it, expect, vi, beforeEach } from "vitest"
import request from "supertest"
import express from "express"

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    organization: { findUnique: vi.fn(), update: vi.fn() },
    blockedDate: {
      findMany: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      delete: vi.fn(),
    },
  },
}))

import { prisma } from "../lib/prisma.js"
import { availabilityRouter } from "../routes/availability.js"

const mockPrisma = prisma as unknown as {
  organization: { findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> }
  blockedDate: {
    findMany: ReturnType<typeof vi.fn>
    create: ReturnType<typeof vi.fn>
    findFirst: ReturnType<typeof vi.fn>
    delete: ReturnType<typeof vi.fn>
  }
}

function makeApp(role = "office", orgId = "org1") {
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    ;(req as express.Request & { user: unknown }).user = { userId: "u1", organizationId: orgId, role }
    next()
  })
  app.use("/", availabilityRouter)
  return app
}

const fullSchedule = {
  mon: { open: "08:00", close: "17:00" },
  tue: { open: "08:00", close: "17:00" },
  wed: { open: "08:00", close: "17:00" },
  thu: { open: "08:00", close: "17:00" },
  fri: { open: "08:00", close: "17:00" },
  sat: null,
  sun: null,
}

beforeEach(() => { vi.clearAllMocks() })

describe("GET /", () => {
  it("returns schedule and future blocked dates", async () => {
    mockPrisma.organization.findUnique.mockResolvedValue({ availabilitySchedule: fullSchedule })
    mockPrisma.blockedDate.findMany.mockResolvedValue([
      { id: "bd1", date: new Date("2026-12-25"), reason: "Christmas", createdAt: new Date() },
    ])
    const res = await request(makeApp()).get("/")
    expect(res.status).toBe(200)
    expect(res.body.schedule).toEqual(fullSchedule)
    expect(res.body.blockedDates).toHaveLength(1)
  })
})

describe("PUT /schedule", () => {
  it("returns 403 for non-office role", async () => {
    const res = await request(makeApp("customer")).put("/schedule").send(fullSchedule)
    expect(res.status).toBe(403)
  })

  it("replaces org availabilitySchedule", async () => {
    mockPrisma.organization.update.mockResolvedValue({ availabilitySchedule: fullSchedule })
    const res = await request(makeApp()).put("/schedule").send(fullSchedule)
    expect(res.status).toBe(200)
    expect(mockPrisma.organization.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { availabilitySchedule: fullSchedule } })
    )
  })
})

describe("POST /blocked-dates", () => {
  it("returns 403 for non-office role", async () => {
    const res = await request(makeApp("customer")).post("/blocked-dates").send({ date: "2026-12-25" })
    expect(res.status).toBe(403)
  })

  it("creates a blocked date and returns 409 on duplicate", async () => {
    mockPrisma.blockedDate.create.mockResolvedValue({ id: "bd1", date: new Date("2026-12-25"), reason: null, createdAt: new Date() })
    const res = await request(makeApp()).post("/blocked-dates").send({ date: "2026-12-25" })
    expect(res.status).toBe(201)
    expect(mockPrisma.blockedDate.create).toHaveBeenCalled()

    mockPrisma.blockedDate.create.mockRejectedValue(Object.assign(new Error(), { code: "P2002" }))
    const res2 = await request(makeApp()).post("/blocked-dates").send({ date: "2026-12-25" })
    expect(res2.status).toBe(409)
  })
})

describe("DELETE /blocked-dates/:id", () => {
  it("removes a blocked date", async () => {
    mockPrisma.blockedDate.findFirst.mockResolvedValue({ id: "bd1" })
    mockPrisma.blockedDate.delete.mockResolvedValue({ id: "bd1" })
    const res = await request(makeApp()).delete("/blocked-dates/bd1")
    expect(res.status).toBe(204)
    expect(mockPrisma.blockedDate.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: "bd1", organizationId: "org1" }) })
    )
  })
})
