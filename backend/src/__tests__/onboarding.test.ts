import { describe, it, expect, vi, beforeEach } from "vitest"
import request from "supertest"
import express from "express"

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    organization: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}))

import { prisma } from "../lib/prisma.js"
import { onboardingRouter } from "../routes/onboarding.js"

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    ;(req as { user?: object }).user = { id: "u1", organizationId: "org-1", role: "office" }
    next()
  })
  app.use("/api/onboarding", onboardingRouter)
  return app
}

describe("GET /api/onboarding/status", () => {
  beforeEach(() => vi.clearAllMocks())

  it("returns dismissed:true when org has onboardingDismissed=true", async () => {
    vi.mocked(prisma.organization.findUnique).mockResolvedValue({
      onboardingDismissed: true,
      phone: "555-1234",
      address: "123 Main St",
      _count: { technicians: 1, customers: 1, jobs: 1 },
    } as never)

    const res = await request(makeApp()).get("/api/onboarding/status")
    expect(res.status).toBe(200)
    expect(res.body.dismissed).toBe(true)
  })

  it("returns step completion derived from real data", async () => {
    vi.mocked(prisma.organization.findUnique).mockResolvedValue({
      onboardingDismissed: false,
      phone: "555-1234",
      address: "123 Main St",
      _count: { technicians: 1, customers: 0, jobs: 0 },
    } as never)

    const res = await request(makeApp()).get("/api/onboarding/status")
    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      dismissed: false,
      steps: {
        companyProfile: true,
        technician: true,
        customer: false,
        job: false,
      },
    })
  })
})

describe("POST /api/onboarding/dismiss", () => {
  it("sets onboardingDismissed=true and returns ok", async () => {
    vi.mocked(prisma.organization.update).mockResolvedValue({} as never)

    const res = await request(makeApp()).post("/api/onboarding/dismiss")
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })
    expect(prisma.organization.update).toHaveBeenCalledWith({
      where: { id: "org-1" },
      data: { onboardingDismissed: true },
    })
  })
})
