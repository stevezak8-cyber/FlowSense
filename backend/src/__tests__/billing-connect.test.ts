import { describe, it, expect, vi, beforeEach } from "vitest"
import express from "express"
import request from "supertest"

// Mock stripe service
vi.mock("../services/stripe.js", () => ({
  stripe: null,
  getPriceId: vi.fn(),
}))

// Mock prisma
vi.mock("../lib/prisma.js", () => ({
  prisma: {
    organization: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}))

import * as stripeModule from "../services/stripe.js"
import { prisma } from "../lib/prisma.js"
import { billingRouter } from "../routes/billing.js"

function buildApp(role = "office") {
  const app = express()
  app.use(express.json())
  app.use((req: any, _res: any, next: any) => {
    req.user = { id: "user-1", organizationId: "org-1", role }
    next()
  })
  app.use("/billing", billingRouter)
  return app
}

describe("GET /billing/connect", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
  })

  it("returns 403 when called by a technician", async () => {
    ;(stripeModule as any).stripe = { oauth: { authorizeUrl: vi.fn() } }
    const res = await request(buildApp("technician")).get("/billing/connect")
    expect(res.status).toBe(403)
    expect(res.body.error).toMatch(/office/i)
  })

  it("returns 503 when stripe is not configured", async () => {
    ;(stripeModule as any).stripe = null
    const res = await request(buildApp()).get("/billing/connect")
    expect(res.status).toBe(503)
    expect(res.body.error).toMatch(/not configured/i)
  })

  it("returns 503 when STRIPE_CONNECT_CLIENT_ID is missing", async () => {
    ;(stripeModule as any).stripe = { oauth: { authorizeUrl: vi.fn() } }
    vi.stubEnv("STRIPE_CONNECT_CLIENT_ID", "")
    vi.stubEnv("STRIPE_STATE_SECRET", "testsecret")
    vi.stubEnv("API_URL", "http://api.test")
    const res = await request(buildApp()).get("/billing/connect")
    expect(res.status).toBe(503)
  })

  it("returns 503 when STRIPE_STATE_SECRET is missing", async () => {
    ;(stripeModule as any).stripe = { oauth: { authorizeUrl: vi.fn() } }
    vi.stubEnv("STRIPE_CONNECT_CLIENT_ID", "ca_test")
    vi.stubEnv("STRIPE_STATE_SECRET", "")
    vi.stubEnv("API_URL", "http://api.test")
    const res = await request(buildApp()).get("/billing/connect")
    expect(res.status).toBe(503)
  })

  it("returns url when fully configured", async () => {
    vi.stubEnv("STRIPE_CONNECT_CLIENT_ID", "ca_test")
    vi.stubEnv("STRIPE_STATE_SECRET", "testsecret")
    vi.stubEnv("API_URL", "http://api.test")
    const mockAuthorize = vi.fn().mockReturnValue("https://connect.stripe.com/oauth/authorize?...")
    ;(stripeModule as any).stripe = { oauth: { authorizeUrl: mockAuthorize } }
    const res = await request(buildApp()).get("/billing/connect")
    expect(res.status).toBe(200)
    expect(res.body.url).toBeTruthy()
    expect(mockAuthorize).toHaveBeenCalledWith(
      expect.objectContaining({ client_id: "ca_test", scope: "read_write" })
    )
  })
})

describe("GET /billing/connect/callback", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
  })

  function signState(orgId: string, secret: string): string {
    const crypto = require("crypto")
    const hmac = crypto.createHmac("sha256", secret).update(orgId).digest("hex")
    return `${orgId}.${hmac}`
  }

  it("redirects to error when stripe error param is present", async () => {
    ;(stripeModule as any).stripe = { oauth: { token: vi.fn() } }
    vi.stubEnv("STRIPE_STATE_SECRET", "testsecret")
    vi.stubEnv("FRONTEND_URL", "http://app.test")
    const res = await request(buildApp()).get("/billing/connect/callback?error=access_denied&state=bad")
    expect(res.status).toBe(302)
    expect(res.headers.location).toMatch(/connect=error/)
  })

  it("redirects to error when state is invalid", async () => {
    ;(stripeModule as any).stripe = { oauth: { token: vi.fn() } }
    vi.stubEnv("STRIPE_STATE_SECRET", "testsecret")
    vi.stubEnv("FRONTEND_URL", "http://app.test")
    const res = await request(buildApp()).get("/billing/connect/callback?code=ac_test&state=org-1.badsig")
    expect(res.status).toBe(302)
    expect(res.headers.location).toMatch(/connect=error/)
  })

  it("redirects to error when token exchange fails", async () => {
    vi.stubEnv("STRIPE_STATE_SECRET", "testsecret")
    vi.stubEnv("FRONTEND_URL", "http://app.test")
    const mockToken = vi.fn().mockRejectedValue(new Error("invalid code"))
    ;(stripeModule as any).stripe = { oauth: { token: mockToken } }
    ;(prisma.organization.findUnique as any).mockResolvedValue({ id: "org-1" })
    const state = signState("org-1", "testsecret")
    const res = await request(buildApp()).get(`/billing/connect/callback?code=ac_test&state=${state}`)
    expect(res.status).toBe(302)
    expect(res.headers.location).toMatch(/connect=error/)
  })

  it("saves Connect account and redirects to success", async () => {
    vi.stubEnv("STRIPE_STATE_SECRET", "testsecret")
    vi.stubEnv("FRONTEND_URL", "http://app.test")
    const mockToken = vi.fn().mockResolvedValue({ stripe_user_id: "acct_test" })
    ;(stripeModule as any).stripe = { oauth: { token: mockToken } }
    ;(prisma.organization.findUnique as any).mockResolvedValue({ id: "org-1" })
    ;(prisma.organization.update as any).mockResolvedValue({})
    const state = signState("org-1", "testsecret")
    const res = await request(buildApp()).get(`/billing/connect/callback?code=ac_test&state=${state}`)
    expect(res.status).toBe(302)
    expect(res.headers.location).toMatch(/connect=success/)
    expect(prisma.organization.update).toHaveBeenCalledWith({
      where: { id: "org-1" },
      data: { stripeConnectAccountId: "acct_test", stripeConnectOnboarded: true },
    })
  })
})
