import { describe, it, expect, vi, beforeEach } from "vitest"
import express from "express"
import request from "supertest"

vi.mock("../services/field-ai.js", () => ({
  streamFieldAiResponse: vi.fn(),
}))

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    aiMessage: {
      create: vi.fn().mockResolvedValue({ id: "msg-1" }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    job: { findFirst: vi.fn() },
  },
}))

import { aiRouter } from "../routes/ai.js"
import { streamFieldAiResponse } from "../services/field-ai.js"
import { prisma } from "../lib/prisma.js"

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    ;(req as any).user = { id: "user-1", organizationId: "org-1", role: "technician" }
    next()
  })
  app.use("/api/ai", aiRouter)
  return app
}

describe("POST /api/ai/chat/stream", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
  })

  it("returns 503 when ANTHROPIC_API_KEY is absent", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "")
    const app = buildApp()
    const res = await request(app)
      .post("/api/ai/chat/stream")
      .send({ jobId: "job-1", message: "help" })
    expect(res.status).toBe(503)
    expect(res.body).toEqual({ error: "not_configured" })
    expect(prisma.aiMessage.create).not.toHaveBeenCalled()
  })

  it("returns 400 for missing message field", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key")
    const app = buildApp()
    const res = await request(app)
      .post("/api/ai/chat/stream")
      .send({ jobId: "job-1" })
    expect(res.status).toBe(400)
  })

  it("returns 400 for missing jobId field", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key")
    const app = buildApp()
    const res = await request(app)
      .post("/api/ai/chat/stream")
      .send({ message: "help" })
    expect(res.status).toBe(400)
  })
})

describe("GET /api/ai/chat/:jobId", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns 404 when job not found or wrong org", async () => {
    vi.mocked(prisma.job.findFirst).mockResolvedValue(null)
    const app = buildApp()
    const res = await request(app).get("/api/ai/chat/job-999")
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: "job_not_found" })
  })

  it("returns message history for the job", async () => {
    vi.mocked(prisma.job.findFirst).mockResolvedValue({ id: "job-1" } as any)
    const msgs = [{ id: "m1", jobId: "job-1", role: "user", content: "hi", createdAt: new Date() }]
    vi.mocked(prisma.aiMessage.findMany).mockResolvedValue(msgs as any)
    const app = buildApp()
    const res = await request(app).get("/api/ai/chat/job-1")
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body).toHaveLength(1)
  })
})
