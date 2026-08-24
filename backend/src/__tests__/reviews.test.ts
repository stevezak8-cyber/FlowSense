import { describe, it, expect, vi, beforeEach } from "vitest"
import request from "supertest"
import express from "express"

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    job: { findFirst: vi.fn() },
    jobReview: { create: vi.fn(), findMany: vi.fn() },
  },
}))

import { prisma } from "../lib/prisma.js"
import { jobsRouter } from "../routes/jobs.js"
import { reviewsRouter } from "../routes/reviews.js"

const mockPrisma = prisma as unknown as {
  user: { findUnique: ReturnType<typeof vi.fn> }
  job: { findFirst: ReturnType<typeof vi.fn> }
  jobReview: { create: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> }
}

function makeJobsApp(role = "customer", userId = "u1", orgId = "org1") {
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    ;(req as express.Request & { user: unknown }).user = { userId, organizationId: orgId, role }
    next()
  })
  app.use("/", jobsRouter)
  return app
}

function makeReviewsApp(role = "office", orgId = "org1") {
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    ;(req as express.Request & { user: unknown }).user = { userId: "u1", organizationId: orgId, role }
    next()
  })
  app.use("/", reviewsRouter)
  return app
}

beforeEach(() => { vi.clearAllMocks() })

describe("POST /jobs/:id/review", () => {
  it("returns 403 for non-customer role", async () => {
    const res = await request(makeJobsApp("office")).post("/job1/review").send({ rating: 5 })
    expect(res.status).toBe(403)
  })

  it("returns 400 if job status is not completed", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ customerId: "cust1" })
    mockPrisma.job.findFirst.mockResolvedValue({ id: "job1", customerId: "cust1", status: "pending" })
    const res = await request(makeJobsApp()).post("/job1/review").send({ rating: 5 })
    expect(res.status).toBe(400)
  })

  it("returns 403 if job belongs to different customer", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ customerId: "custA" })
    mockPrisma.job.findFirst.mockResolvedValue({ id: "job1", customerId: "custB", status: "completed" })
    const res = await request(makeJobsApp()).post("/job1/review").send({ rating: 5 })
    expect(res.status).toBe(403)
  })

  it("creates review and returns 201", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ customerId: "cust1" })
    mockPrisma.job.findFirst.mockResolvedValue({ id: "job1", customerId: "cust1", status: "completed" })
    mockPrisma.jobReview.create.mockResolvedValue({ id: "rev1", jobId: "job1", rating: 5, comment: "Great!", createdAt: new Date() })
    const res = await request(makeJobsApp()).post("/job1/review").send({ rating: 5, comment: "Great!" })
    expect(res.status).toBe(201)
    expect(res.body.rating).toBe(5)
  })

  it("returns 409 with existing review in body if review already exists", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ customerId: "cust1" })
    mockPrisma.job.findFirst.mockResolvedValue({ id: "job1", customerId: "cust1", status: "completed" })
    mockPrisma.jobReview.create.mockRejectedValue(Object.assign(new Error(), { code: "P2002" }))
    const res = await request(makeJobsApp()).post("/job1/review").send({ rating: 5 })
    expect(res.status).toBe(409)
  })
})

describe("GET /reviews", () => {
  it("returns 403 for non-office role", async () => {
    const res = await request(makeReviewsApp("customer")).get("/")
    expect(res.status).toBe(403)
  })

  it("returns reviews for org", async () => {
    mockPrisma.jobReview.findMany.mockResolvedValue([
      { id: "rev1", rating: 5, comment: "Amazing", createdAt: new Date(), customer: { name: "Alice" }, job: { scheduledAt: new Date(), equipmentType: "HVAC" } },
    ])
    const res = await request(makeReviewsApp()).get("/")
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
  })
})
