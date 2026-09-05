import { describe, it, expect, vi, beforeEach } from "vitest"
import request from "supertest"
import express from "express"

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    pushSubscription: {
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}))

import { prisma } from "../lib/prisma.js"
import { pushRouter } from "../routes/push.js"

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    ;(req as any).user = { userId: "user-1", organizationId: "org-1" }
    next()
  })
  app.use("/api/push", pushRouter)
  return app
}

const app = makeApp()

describe("GET /api/push/vapid-public-key", () => {
  it("returns publicKey when VAPID_PUBLIC_KEY is set", async () => {
    vi.stubEnv("VAPID_PUBLIC_KEY", "test-pub-key")
    const res = await request(app).get("/api/push/vapid-public-key")
    expect(res.status).toBe(200)
    expect(res.body.publicKey).toBe("test-pub-key")
    vi.unstubAllEnvs()
  })

  it("returns 503 when VAPID_PUBLIC_KEY is not set", async () => {
    vi.unstubAllEnvs()
    const res = await request(app).get("/api/push/vapid-public-key")
    expect(res.status).toBe(503)
  })
})

describe("POST /api/push/subscribe", () => {
  beforeEach(() => vi.clearAllMocks())

  it("upserts a push subscription", async () => {
    ;(prisma.pushSubscription.upsert as any).mockResolvedValue({})
    const res = await request(app)
      .post("/api/push/subscribe")
      .send({ endpoint: "https://push.example.com/1", keys: { p256dh: "abc", auth: "def" } })
    expect(res.status).toBe(201)
    expect(prisma.pushSubscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { endpoint: "https://push.example.com/1" },
        create: expect.objectContaining({ userId: "user-1", organizationId: "org-1" }),
      })
    )
  })

  it("returns 400 when body is invalid", async () => {
    const res = await request(app).post("/api/push/subscribe").send({})
    expect(res.status).toBe(400)
  })
})

describe("DELETE /api/push/subscribe", () => {
  beforeEach(() => vi.clearAllMocks())

  it("deletes subscription by endpoint query param", async () => {
    ;(prisma.pushSubscription.deleteMany as any).mockResolvedValue({ count: 1 })
    const res = await request(app)
      .delete("/api/push/subscribe?endpoint=" + encodeURIComponent("https://push.example.com/1"))
    expect(res.status).toBe(204)
    expect(prisma.pushSubscription.deleteMany).toHaveBeenCalledWith({
      where: { endpoint: "https://push.example.com/1", userId: "user-1" },
    })
  })

  it("returns 400 when endpoint query param is missing", async () => {
    const res = await request(app).delete("/api/push/subscribe")
    expect(res.status).toBe(400)
  })
})
