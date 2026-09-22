import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import request from "supertest"
import express from "express"
import jwt from "jsonwebtoken"

const JWT_SECRET = "test-secret"
const authToken = jwt.sign({ userId: "owner1", role: "office", organizationId: "org-1" }, JWT_SECRET)

const orgFindUnique = vi.fn()
const userCount = vi.fn()
const userFindFirst = vi.fn()
const userCreate = vi.fn()

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    organization: { findUnique: orgFindUnique },
    user: { count: userCount, findFirst: userFindFirst, create: userCreate },
    technician: { findFirst: vi.fn() },
    customer: { findFirst: vi.fn() },
  },
}))
vi.mock("../services/stripe.js", () => ({ stripe: null, getPriceId: vi.fn() }))
vi.mock("../services/estimate-ai.js", () => ({ seedPricebook: vi.fn() }))
vi.mock("../services/sandbox.js", () => ({ seedSandboxData: vi.fn() }))
vi.mock("../services/email.js", () => ({ sendEmail: vi.fn() }))
vi.mock("../services/sms.js", () => ({ sendSms: vi.fn() }))

async function makeApp() {
  vi.stubEnv("JWT_SECRET", JWT_SECRET)
  const { authRouter } = await import("../routes/auth.js")
  const app = express()
  app.use(express.json())
  app.use("/", authRouter)
  return app
}

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  userFindFirst.mockResolvedValue(null)
  userCreate.mockImplementation(async ({ data }: { data: object }) => ({ id: "new-user", ...data }))
})
afterEach(() => vi.unstubAllEnvs())

describe("POST /invite — office seat cap", () => {
  it("a Starter org already at its 1 office seat is blocked with 402", async () => {
    orgFindUnique.mockResolvedValue({ plan: "starter" })
    userCount.mockResolvedValue(1)

    const res = await request(await makeApp())
      .post("/invite")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ email: "second@shop.com", role: "office" })
    expect(res.status).toBe(402)
    expect(res.body.error).toMatch(/1 office seat/)
    expect(userCreate).not.toHaveBeenCalled()
  })

  it("does not count technician or customer invites against the office-seat cap", async () => {
    orgFindUnique.mockResolvedValue({ plan: "starter" })
    userCount.mockResolvedValue(1)

    const res = await request(await makeApp())
      .post("/invite")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ email: "tech@shop.com", role: "technician" })
    expect(res.status).not.toBe(402)
    // userCount is only queried by the office-seat-cap check — proves it didn't run for a technician invite
    expect(userCount).not.toHaveBeenCalled()
  })

  it("Shop and higher have no office-seat cap", async () => {
    orgFindUnique.mockResolvedValue({ plan: "shop" })
    userCount.mockResolvedValue(10)

    const res = await request(await makeApp())
      .post("/invite")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ email: "second@shop.com", role: "office" })
    expect(res.status).not.toBe(402)
  })
})
