import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import request from "supertest"
import express from "express"

const findUnique = vi.fn()

vi.mock("../lib/prisma.js", () => ({ prisma: { user: { findUnique } } }))
vi.mock("../services/stripe.js", () => ({ stripe: null, getPriceId: vi.fn() }))
vi.mock("../services/estimate-ai.js", () => ({ seedPricebook: vi.fn() }))
vi.mock("../services/sandbox.js", () => ({ seedSandboxData: vi.fn() }))
vi.mock("../services/email.js", () => ({ sendEmail: vi.fn() }))
vi.mock("../services/sms.js", () => ({ sendSms: vi.fn() }))

async function makeApp() {
  vi.stubEnv("JWT_SECRET", "test-secret")
  const { authRouter } = await import("../routes/auth.js")
  const app = express()
  app.use(express.json())
  app.use("/", authRouter)
  return app
}

const demoUser = { id: "u1", email: "office@flowsense.demo", name: "Sarah", role: "office", organizationId: "default-org", technicianId: null, customerId: null }

beforeEach(() => {
  vi.resetModules()
  findUnique.mockReset()
  findUnique.mockResolvedValue(demoUser)
})
afterEach(() => vi.unstubAllEnvs())

describe("POST /demo lock", () => {
  it("is 404 in production by default, and never touches the database", async () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("DEMO_ENABLED", "")
    const res = await request(await makeApp()).post("/demo").send({ role: "office" })
    expect(res.status).toBe(404)
    expect(res.body.token).toBeUndefined()
    expect(findUnique).not.toHaveBeenCalled()
  })

  it("stays 404 in production for any DEMO_ENABLED value other than exactly 'true'", async () => {
    vi.stubEnv("NODE_ENV", "production")
    for (const v of ["false", "1", "yes", "TRUE"]) {
      vi.stubEnv("DEMO_ENABLED", v)
      const res = await request(await makeApp()).post("/demo").send({ role: "office" })
      expect(res.status).toBe(404)
    }
  })

  it("works in production only when DEMO_ENABLED=true is set explicitly", async () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("DEMO_ENABLED", "true")
    const res = await request(await makeApp()).post("/demo").send({ role: "office" })
    expect(res.status).toBe(200)
    expect(res.body.token).toBeTruthy()
  })

  it("keeps working in development so local testing isn't affected", async () => {
    vi.stubEnv("NODE_ENV", "development")
    vi.stubEnv("DEMO_ENABLED", "")
    const res = await request(await makeApp()).post("/demo").send({ role: "office" })
    expect(res.status).toBe(200)
    expect(res.body.user.email).toBe("office@flowsense.demo")
  })

  it("still validates the role when enabled", async () => {
    vi.stubEnv("NODE_ENV", "development")
    const res = await request(await makeApp()).post("/demo").send({ role: "admin" })
    expect(res.status).toBe(400)
  })
})
