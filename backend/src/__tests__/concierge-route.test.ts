import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    job: { create: vi.fn() },
    customer: { findFirst: vi.fn() },
  },
}))

vi.mock("../services/concierge-ai.js", () => ({
  getConciergeReply: vi.fn(),
}))

import request from "supertest"
import express from "express"
import { conciergeRouter } from "../routes/concierge.js"
import { getConciergeReply } from "../services/concierge-ai.js"
import { prisma } from "../lib/prisma.js"

function makeApp(customerId: string | null = "cust1") {
  const app = express()
  app.use(express.json())
  app.use((req: express.Request, _res: express.Response, next: express.NextFunction) => {
    (req as unknown as { user: unknown }).user = {
      organizationId: "org1",
      customerId: customerId ?? undefined,
      role: "customer",
    }
    next()
  })
  app.use("/api/concierge", conciergeRouter)
  return app
}

const validMessages = [{ role: "user" as const, content: "hello" }]

describe("POST /api/concierge/chat", () => {
  beforeEach(() => vi.clearAllMocks())

  it("returns 400 when messages array is empty", async () => {
    const res = await request(makeApp()).post("/api/concierge/chat").send({ messages: [] })
    expect(res.status).toBe(400)
  })

  it("returns 400 when user has no customerId", async () => {
    const res = await request(makeApp(null)).post("/api/concierge/chat").send({ messages: validMessages })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/customer/i)
  })

  it("returns 503 when getConciergeReply returns not_configured", async () => {
    vi.mocked(getConciergeReply).mockResolvedValue({ error: "not_configured" })
    const res = await request(makeApp()).post("/api/concierge/chat").send({ messages: validMessages })
    expect(res.status).toBe(503)
  })

  it("returns 200 with reply for a status question (no jobCreated)", async () => {
    vi.mocked(getConciergeReply).mockResolvedValue({ reply: "Your job is scheduled for Monday." })
    const res = await request(makeApp()).post("/api/concierge/chat").send({ messages: validMessages })
    expect(res.status).toBe(200)
    expect(res.body.reply).toBe("Your job is scheduled for Monday.")
    expect(res.body.jobCreated).toBeUndefined()
  })

  it("returns 200 with reply + jobCreated when result includes jobAction", async () => {
    vi.mocked(getConciergeReply).mockResolvedValue({
      reply: "I've submitted your service request.",
      jobAction: { equipmentType: "central-ac", symptomSummary: "Not cooling", scheduledAt: new Date("2026-08-20T09:00:00Z") },
    })
    vi.mocked(prisma.job.create).mockResolvedValue({ id: "job123" } as never)
    const res = await request(makeApp()).post("/api/concierge/chat").send({ messages: validMessages })
    expect(res.status).toBe(200)
    expect(res.body.reply).toBe("I've submitted your service request.")
    expect(res.body.jobCreated).toEqual({ id: "job123" })
  })

  it("returns 200 with reply only when jobAction present but prisma.job.create throws", async () => {
    vi.mocked(getConciergeReply).mockResolvedValue({
      reply: "I've submitted your service request.",
      jobAction: { equipmentType: null, symptomSummary: "Broken AC", scheduledAt: new Date("2026-08-20T09:00:00Z") },
    })
    vi.mocked(prisma.job.create).mockRejectedValue(new Error("DB error"))
    const res = await request(makeApp()).post("/api/concierge/chat").send({ messages: validMessages })
    expect(res.status).toBe(200)
    expect(res.body.reply).toBe("I've submitted your service request.")
    expect(res.body.jobCreated).toBeUndefined()
  })
})
