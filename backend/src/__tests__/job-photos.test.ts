import { describe, it, expect, vi, beforeEach } from "vitest"
import request from "supertest"
import express from "express"

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    job: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}))

vi.mock("../services/s3.js", () => ({
  s3Available: vi.fn().mockReturnValue(true),
  getUploadUrl: vi.fn().mockResolvedValue({
    uploadUrl: "https://s3.presigned.example.com/upload",
    publicUrl: "https://my-bucket.s3.us-east-1.amazonaws.com/org1/jobs/job1/abc.jpg",
  }),
  deleteObject: vi.fn().mockResolvedValue(undefined),
}))

import { prisma } from "../lib/prisma.js"
import { s3Available, getUploadUrl, deleteObject } from "../services/s3.js"
import { jobsRouter } from "../routes/jobs.js"

const mockPrisma = prisma as unknown as {
  job: { findFirst: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> }
}

function makeApp(role = "technician") {
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
  app.use("/", jobsRouter)
  return app
}

const fakeJob = {
  id: "job1",
  organizationId: "org1",
  photos: ["https://my-bucket.s3.us-east-1.amazonaws.com/org1/jobs/job1/existing.jpg"],
}

describe("Job photo routes", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(s3Available).mockReturnValue(true)
    vi.mocked(getUploadUrl).mockResolvedValue({
      uploadUrl: "https://s3.presigned.example.com/upload",
      publicUrl: "https://my-bucket.s3.us-east-1.amazonaws.com/org1/jobs/job1/abc.jpg",
    })
    vi.mocked(deleteObject).mockResolvedValue(undefined)
    process.env.AWS_S3_BUCKET = "my-bucket"
    process.env.AWS_REGION = "us-east-1"
  })

  it("POST /job1/photos/upload-url returns 503 when S3 not available", async () => {
    vi.mocked(s3Available).mockReturnValue(false)
    const res = await request(makeApp())
      .post("/job1/photos/upload-url")
      .send({ contentType: "image/jpeg" })
    expect(res.status).toBe(503)
  })

  it("POST /job1/photos/upload-url returns 403 for office role", async () => {
    mockPrisma.job.findFirst.mockResolvedValue(fakeJob)
    const res = await request(makeApp("office"))
      .post("/job1/photos/upload-url")
      .send({ contentType: "image/jpeg" })
    expect(res.status).toBe(403)
  })

  it("POST /job1/photos/upload-url returns uploadUrl and publicUrl", async () => {
    mockPrisma.job.findFirst.mockResolvedValue(fakeJob)
    const res = await request(makeApp())
      .post("/job1/photos/upload-url")
      .send({ contentType: "image/jpeg" })
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty("uploadUrl")
    expect(res.body).toHaveProperty("publicUrl")
  })

  it("POST /job1/photos appends URL to job.photos", async () => {
    const updatedPhotos = [...fakeJob.photos, "https://my-bucket.s3.us-east-1.amazonaws.com/org1/jobs/job1/new.jpg"]
    mockPrisma.job.findFirst.mockResolvedValue(fakeJob)
    mockPrisma.job.update.mockResolvedValue({ ...fakeJob, photos: updatedPhotos })
    const res = await request(makeApp())
      .post("/job1/photos")
      .send({ url: "https://my-bucket.s3.us-east-1.amazonaws.com/org1/jobs/job1/new.jpg" })
    expect(res.status).toBe(200)
    expect(res.body.photos).toHaveLength(2)
  })

  it("DELETE /job1/photos removes URL and calls deleteObject", async () => {
    const url = fakeJob.photos[0]
    mockPrisma.job.findFirst.mockResolvedValue(fakeJob)
    mockPrisma.job.update.mockResolvedValue({ ...fakeJob, photos: [] })
    const res = await request(makeApp())
      .delete("/job1/photos")
      .send({ url })
    expect(res.status).toBe(200)
    expect(res.body.photos).toHaveLength(0)
    expect(deleteObject).toHaveBeenCalled()
  })
})
