import { describe, it, expect, vi, beforeEach } from "vitest"
import request from "supertest"
import express from "express"

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    job: { findFirst: vi.fn(), update: vi.fn() },
  },
}))

vi.mock("../services/org-notifications.js", () => ({
  notifyOfficeCancellation: vi.fn().mockResolvedValue(undefined),
  notifyOrgNewBooking: vi.fn(),
  notifyOrgStatusChange: vi.fn(),
  notifyOrgJobCompleted: vi.fn(),
  notifyOfficePaymentReceived: vi.fn(),
  notifyOfficePlanCreated: vi.fn(),
}))

import { prisma } from "../lib/prisma.js"
import { notifyOfficeCancellation } from "../services/org-notifications.js"
import { jobsRouter } from "../routes/jobs.js"

const mockPrisma = prisma as unknown as {
  user: { findUnique: ReturnType<typeof vi.fn> }
  job: { findFirst: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> }
}

function makeApp(role = "customer", userId = "u1", orgId = "org1") {
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    ;(req as express.Request & { user: unknown }).user = { userId, organizationId: orgId, role }
    next()
  })
  app.use("/", jobsRouter)
  return app
}

beforeEach(() => { vi.clearAllMocks() })

describe("POST /:id/cancel", () => {
  it("returns 403 for non-customer role", async () => {
    const res = await request(makeApp("office")).post("/job1/cancel")
    expect(res.status).toBe(403)
  })

  it("returns 403 if job belongs to a different customer", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ customerId: "custA" })
    mockPrisma.job.findFirst.mockResolvedValue({ id: "job1", customerId: "custB", status: "pending", customer: { name: "Bob" } })
    const res = await request(makeApp()).post("/job1/cancel")
    expect(res.status).toBe(403)
  })

  it("returns 400 if job status is completed", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ customerId: "cust1" })
    mockPrisma.job.findFirst.mockResolvedValue({ id: "job1", customerId: "cust1", status: "completed", customer: { name: "Alice" } })
    const res = await request(makeApp()).post("/job1/cancel")
    expect(res.status).toBe(400)
  })

  it("sets status to cancelled and calls notifyOfficeCancellation", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ customerId: "cust1" })
    mockPrisma.job.findFirst.mockResolvedValue({ id: "job1", customerId: "cust1", status: "pending", customer: { name: "Alice" } })
    mockPrisma.job.update.mockResolvedValue({ id: "job1", status: "cancelled" })
    const res = await request(makeApp()).post("/job1/cancel")
    expect(res.status).toBe(200)
    expect(res.body.status).toBe("cancelled")
    expect(notifyOfficeCancellation).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: "job1", customerName: "Alice" })
    )
  })
})
