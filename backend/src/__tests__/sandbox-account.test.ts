import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import request from "supertest"
import express from "express"
import bcrypt from "bcryptjs"

const tx = { organization: { create: vi.fn() }, user: { create: vi.fn() } }

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    organization: { delete: vi.fn(), findMany: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}))
vi.mock("../services/sandbox.js", () => ({ seedSandboxData: vi.fn() }))
vi.mock("../services/estimate-ai.js", () => ({ seedPricebook: vi.fn() }))
vi.mock("../services/demo-account/reset.js", () => ({ resetDemoAccount: vi.fn() }))

import { prisma } from "../lib/prisma.js"
import { seedSandboxData } from "../services/sandbox.js"
import { seedPricebook } from "../services/estimate-ai.js"
import { createSandboxAccount } from "../services/sandbox-account.js"
import { platformRouter } from "../routes/platform.js"

beforeEach(() => {
  vi.clearAllMocks()
  tx.organization.create.mockImplementation(async ({ data }: { data: { name: string } }) => ({ id: "org-new", ...data }))
  tx.user.create.mockResolvedValue({})
  vi.mocked(prisma.organization.delete).mockResolvedValue({} as never)
  vi.mocked(seedSandboxData).mockResolvedValue(undefined)
  vi.mocked(seedPricebook).mockResolvedValue(undefined)
})

describe("createSandboxAccount", () => {
  it("creates a sandbox org with no billing attached", async () => {
    await createSandboxAccount({ companyName: "Dave's HVAC", plan: "fleet", password: "pw-123456789" })
    const data = tx.organization.create.mock.calls[0][0].data
    expect(data).toMatchObject({ name: "Dave's HVAC", plan: "fleet", sandboxMode: true })
    expect(data.stripeCustomerId).toBeUndefined()
    expect(data.stripeSubscriptionId).toBeUndefined()
    expect(data.trialEndsAt).toBeUndefined()
    expect(data.email).toBeUndefined() // nothing to notify
    expect(data.slug).toMatch(/^dave-s-hvac-[0-9a-f]{8}$/)
  })

  it("creates an office login whose password is hashed, not stored", async () => {
    const acct = await createSandboxAccount({ plan: "shop", password: "pw-123456789" })
    const user = tx.user.create.mock.calls[0][0].data
    expect(user).toMatchObject({ role: "office", organizationId: "org-new", email: acct.email })
    expect(user.passwordHash).not.toContain("pw-123456789")
    expect(await bcrypt.compare("pw-123456789", user.passwordHash)).toBe(true)
  })

  it("uses a made-up login address and a default name", async () => {
    const acct = await createSandboxAccount({ plan: "starter", password: "x".repeat(12) })
    expect(acct.email).toMatch(/^sandbox-[0-9a-f]{8}@pneuros\.com$/)
    expect(acct.name).toBe("Sandbox Demo")
    expect(acct.plan).toBe("starter")
  })

  it("loads the sample data and starts the starter pricebook", async () => {
    await createSandboxAccount({ plan: "fleet", password: "x".repeat(12) })
    expect(seedSandboxData).toHaveBeenCalledWith("org-new")
    expect(seedPricebook).toHaveBeenCalledWith("org-new")
  })

  it("removes the account again if the sample data can't be loaded", async () => {
    vi.mocked(seedSandboxData).mockRejectedValue(new Error("db down"))
    await expect(createSandboxAccount({ plan: "fleet", password: "x".repeat(12) })).rejects.toThrow("db down")
    expect(prisma.organization.delete).toHaveBeenCalledWith({ where: { id: "org-new" } })
  })

  it("doesn't fail the account if the background pricebook fails", async () => {
    vi.mocked(seedPricebook).mockRejectedValue(new Error("no credit"))
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    await expect(createSandboxAccount({ plan: "fleet", password: "x".repeat(12) })).resolves.toBeTruthy()
    await new Promise((r) => setTimeout(r, 0))
    spy.mockRestore()
  })
})

describe("POST /sandbox-accounts", () => {
  const ORIGINAL = process.env.PLATFORM_ADMIN_EMAILS
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.PLATFORM_ADMIN_EMAILS
    else process.env.PLATFORM_ADMIN_EMAILS = ORIGINAL
  })

  function app() {
    const a = express()
    a.use(express.json())
    a.use((req, _res, next) => {
      ;(req as express.Request & { user: unknown }).user = { userId: "u1", organizationId: "org-1", role: "office" }
      next()
    })
    a.use("/", platformRouter)
    return a
  }
  const asAdmin = () => {
    process.env.PLATFORM_ADMIN_EMAILS = "founder@pneuros.com"
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ email: "founder@pneuros.com" } as never)
  }

  it("is invisible (404) to anyone who isn't a platform admin, and creates nothing", async () => {
    process.env.PLATFORM_ADMIN_EMAILS = "founder@pneuros.com"
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ email: "shopowner@example.com" } as never)
    const res = await request(app()).post("/sandbox-accounts").send({ companyName: "x" })
    expect(res.status).toBe(404)
    expect(tx.organization.create).not.toHaveBeenCalled()
  })

  it("creates an account for an admin with a random password, defaulting to the Fleet plan", async () => {
    asAdmin()
    const a = await request(app()).post("/sandbox-accounts").send({ companyName: "Dave's HVAC" })
    const b = await request(app()).post("/sandbox-accounts").send({})
    expect(a.status).toBe(201)
    expect(a.body).toMatchObject({ organizationId: "org-new", name: "Dave's HVAC", plan: "fleet" })
    expect(a.body.password.length).toBeGreaterThanOrEqual(12)
    expect(a.body.password).not.toBe(b.body.password)
    expect(b.body.name).toBe("Sandbox Demo")
  })

  it("passes the chosen plan through", async () => {
    asAdmin()
    const res = await request(app()).post("/sandbox-accounts").send({ plan: "starter" })
    expect(res.body.plan).toBe("starter")
    expect(tx.organization.create.mock.calls[0][0].data.plan).toBe("starter")
  })

  it("rejects an unknown plan or an overlong name before creating anything", async () => {
    asAdmin()
    expect((await request(app()).post("/sandbox-accounts").send({ plan: "platinum" })).status).toBe(400)
    expect((await request(app()).post("/sandbox-accounts").send({ companyName: "x".repeat(61) })).status).toBe(400)
    expect(tx.organization.create).not.toHaveBeenCalled()
  })

  it("returns a generic error and none of the underlying message on failure", async () => {
    asAdmin()
    tx.organization.create.mockRejectedValue(new Error("unique constraint secret_detail"))
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    const res = await request(app()).post("/sandbox-accounts").send({})
    expect(res.status).toBe(500)
    expect(JSON.stringify(res.body)).not.toContain("secret_detail")
    spy.mockRestore()
  })
})
