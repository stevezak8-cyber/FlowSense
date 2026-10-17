import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import request from "supertest"
import express from "express"

vi.mock("../lib/prisma.js", () => ({
  prisma: { user: { findUnique: vi.fn() }, organization: { findMany: vi.fn() } },
}))
vi.mock("../services/demo-account/reset.js", () => ({ resetDemoAccount: vi.fn() }))

import { prisma } from "../lib/prisma.js"
import { resetDemoAccount } from "../services/demo-account/reset.js"
import { platformRouter } from "../routes/platform.js"

function makeApp() {
  const app = express()
  app.use((req, _res, next) => {
    ;(req as express.Request & { user: unknown }).user = { userId: "u1", organizationId: "org-1", role: "office" }
    next()
  })
  app.use("/", platformRouter)
  return app
}

const ORIGINAL = process.env.PLATFORM_ADMIN_EMAILS
const asAdmin = () => {
  process.env.PLATFORM_ADMIN_EMAILS = "founder@pneuros.com"
  vi.mocked(prisma.user.findUnique).mockResolvedValue({ email: "founder@pneuros.com" } as never)
}

beforeEach(() => vi.clearAllMocks())
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.PLATFORM_ADMIN_EMAILS
  else process.env.PLATFORM_ADMIN_EMAILS = ORIGINAL
})

const RESULT = {
  organizationId: "o1",
  logins: [{ role: "office", name: "Taylor Brooks", email: "demo@pneuros.com", password: "abc" }],
  counts: { jobs: 300 },
}

describe("POST /demo/reset", () => {
  it("looks like a missing route to anyone who isn't a platform admin, and does nothing", async () => {
    process.env.PLATFORM_ADMIN_EMAILS = "founder@pneuros.com"
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ email: "shopowner@example.com" } as never)
    const res = await request(makeApp()).post("/demo/reset")
    expect(res.status).toBe(404)
    expect(resetDemoAccount).not.toHaveBeenCalled()
  })

  it("rebuilds the demo account for an admin, with a fresh random password each time", async () => {
    asAdmin()
    vi.mocked(resetDemoAccount).mockResolvedValue(RESULT as never)
    const a = await request(makeApp()).post("/demo/reset")
    const b = await request(makeApp()).post("/demo/reset")
    expect(a.status).toBe(200)
    expect(a.body).toEqual(RESULT)
    const [pa, pb] = vi.mocked(resetDemoAccount).mock.calls.map(([o]) => o.password)
    expect(pa.length).toBeGreaterThanOrEqual(12)
    expect(pa).not.toBe(pb)
    expect(b.status).toBe(200)
  })

  it("returns a generic error and never the underlying message when the rebuild fails", async () => {
    asAdmin()
    vi.mocked(resetDemoAccount).mockRejectedValue(new Error("duplicate key value violates unique constraint secret_detail"))
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    const res = await request(makeApp()).post("/demo/reset")
    expect(res.status).toBe(500)
    expect(JSON.stringify(res.body)).not.toContain("secret_detail")
    spy.mockRestore()
  })

  it("refuses a second reset while one is still running, then allows the next", async () => {
    asAdmin()
    let finish!: (v: unknown) => void
    vi.mocked(resetDemoAccount).mockImplementationOnce(() => new Promise((r) => { finish = r }) as never)
    const app = makeApp()
    const first = request(app).post("/demo/reset").then((r) => r)
    await new Promise((r) => setTimeout(r, 30))
    const second = await request(app).post("/demo/reset")
    expect(second.status).toBe(409)
    finish(RESULT)
    expect((await first).status).toBe(200)

    vi.mocked(resetDemoAccount).mockResolvedValue(RESULT as never)
    expect((await request(app).post("/demo/reset")).status).toBe(200)
  })
})
