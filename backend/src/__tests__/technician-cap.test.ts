import { describe, it, expect, vi, beforeEach } from "vitest"
import request from "supertest"
import express from "express"

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    organization: { findUnique: vi.fn() },
    technician: { count: vi.fn(), create: vi.fn() },
  },
}))

import { prisma } from "../lib/prisma.js"
import { techniciansRouter } from "../routes/technicians.js"

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    ;(req as express.Request & { user: unknown }).user = { organizationId: "org-1", role: "office" }
    next()
  })
  app.use("/", techniciansRouter)
  return app
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(prisma.technician.create).mockImplementation(async ({ data }: { data: object }) => ({ id: "t1", ...data }) as never)
})

describe("POST / — technician cap", () => {
  it("a Starter org at its 2-technician cap is blocked with 402", async () => {
    vi.mocked(prisma.organization.findUnique).mockResolvedValue({ plan: "starter" } as never)
    vi.mocked(prisma.technician.count).mockResolvedValue(2)

    const res = await request(makeApp()).post("/").send({ name: "New Tech" })
    expect(res.status).toBe(402)
    expect(res.body.error).toMatch(/up to 2 technicians/)
    expect(prisma.technician.create).not.toHaveBeenCalled()
  })

  it("a Starter org under its cap can still add one", async () => {
    vi.mocked(prisma.organization.findUnique).mockResolvedValue({ plan: "starter" } as never)
    vi.mocked(prisma.technician.count).mockResolvedValue(1)

    const res = await request(makeApp()).post("/").send({ name: "New Tech" })
    expect(res.status).toBe(201)
    expect(prisma.technician.create).toHaveBeenCalled()
  })

  it("sample (sandbox) technicians don't count against the cap", async () => {
    vi.mocked(prisma.organization.findUnique).mockResolvedValue({ plan: "starter" } as never)
    vi.mocked(prisma.technician.count).mockResolvedValue(1)

    await request(makeApp()).post("/").send({ name: "New Tech" })
    expect(prisma.technician.count).toHaveBeenCalledWith({
      where: { organizationId: "org-1", isSample: false },
    })
  })

  it("Shop and higher have no technician cap", async () => {
    vi.mocked(prisma.organization.findUnique).mockResolvedValue({ plan: "shop" } as never)
    vi.mocked(prisma.technician.count).mockResolvedValue(50)

    const res = await request(makeApp()).post("/").send({ name: "New Tech" })
    expect(res.status).toBe(201)
  })
})
