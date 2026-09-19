import { describe, it, expect, vi, beforeEach } from "vitest"
import request from "supertest"
import express from "express"

const tx = {
  organization: { updateMany: vi.fn() },
  conversation: { deleteMany: vi.fn(), create: vi.fn() },
  vehicle: { deleteMany: vi.fn(), create: vi.fn() },
  customer: { deleteMany: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
  technician: { deleteMany: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
  equipment: { create: vi.fn() },
  job: { create: vi.fn() },
  invoice: { create: vi.fn() },
  message: { createMany: vi.fn() },
}

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    customer: { count: vi.fn() },
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  },
}))

import { prisma } from "../lib/prisma.js"
import { seedSandboxData, exitSandbox, SandboxNotActiveError } from "../services/sandbox.js"
import { organizationsRouter } from "../routes/organizations.js"

let n = 0
beforeEach(() => {
  vi.clearAllMocks()
  n = 0
  for (const create of [tx.conversation.create, tx.vehicle.create, tx.customer.create, tx.technician.create, tx.equipment.create, tx.job.create, tx.invoice.create]) {
    create.mockImplementation(async ({ data }: { data: object }) => ({ id: `id-${++n}`, ...data }))
  }
  tx.message.createMany.mockResolvedValue({ count: 1 })
})

describe("seedSandboxData", () => {
  it("does nothing if the org already has sample data", async () => {
    vi.mocked(prisma.customer.count).mockResolvedValue(3)
    await seedSandboxData("org-1")
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it("tags every root record as sample and scopes it to the org", async () => {
    vi.mocked(prisma.customer.count).mockResolvedValue(0)
    await seedSandboxData("org-1")

    for (const create of [tx.technician.create, tx.vehicle.create, tx.customer.create, tx.conversation.create]) {
      expect(create).toHaveBeenCalled()
      for (const [{ data }] of create.mock.calls) {
        expect(data.isSample).toBe(true)
        expect(data.organizationId).toBe("org-1")
      }
    }
  })

  it("never gives a sample customer an email address, so nothing real can be sent", async () => {
    vi.mocked(prisma.customer.count).mockResolvedValue(0)
    await seedSandboxData("org-1")
    for (const [{ data }] of tx.customer.create.mock.calls) {
      expect(data.email).toBeUndefined()
      expect(data.phone).toMatch(/555-01\d\d/)
    }
  })

  it("creates jobs across the status lifecycle plus invoices", async () => {
    vi.mocked(prisma.customer.count).mockResolvedValue(0)
    await seedSandboxData("org-1")
    const statuses = new Set(tx.job.create.mock.calls.map(([{ data }]) => data.status))
    for (const s of ["completed", "in_progress", "en_route", "scheduled", "pending", "cancelled"]) {
      expect(statuses.has(s)).toBe(true)
    }
    expect(tx.invoice.create).toHaveBeenCalled()
  })
})

describe("exitSandbox", () => {
  beforeEach(() => {
    tx.organization.updateMany.mockResolvedValue({ count: 1 })
    tx.customer.deleteMany.mockResolvedValue({ count: 5 })
    tx.technician.deleteMany.mockResolvedValue({ count: 3 })
  })

  it("throws and deletes nothing when the org is not in sandbox mode", async () => {
    tx.organization.updateMany.mockResolvedValue({ count: 0 })
    await expect(exitSandbox("org-1")).rejects.toBeInstanceOf(SandboxNotActiveError)
    expect(tx.customer.deleteMany).not.toHaveBeenCalled()
    expect(tx.technician.deleteMany).not.toHaveBeenCalled()
  })

  it("atomically claims the exit and records when it ended (one-way)", async () => {
    await exitSandbox("org-1")
    const arg = tx.organization.updateMany.mock.calls[0][0]
    expect(arg.where).toEqual({ id: "org-1", sandboxMode: true })
    expect(arg.data.sandboxMode).toBe(false)
    expect(arg.data.sandboxEndedAt).toBeInstanceOf(Date)
  })

  it("only deletes rows tagged isSample, and keeps any that gained a real login", async () => {
    const result = await exitSandbox("org-1")
    expect(tx.customer.deleteMany).toHaveBeenCalledWith({ where: { organizationId: "org-1", isSample: true, user: null } })
    expect(tx.technician.deleteMany).toHaveBeenCalledWith({ where: { organizationId: "org-1", isSample: true, user: null } })
    expect(tx.vehicle.deleteMany).toHaveBeenCalledWith({ where: { organizationId: "org-1", isSample: true } })
    expect(tx.conversation.deleteMany).toHaveBeenCalledWith({ where: { organizationId: "org-1", isSample: true } })
    // survivors are reclassified as real
    expect(tx.customer.updateMany).toHaveBeenCalledWith({ where: { organizationId: "org-1", isSample: true }, data: { isSample: false } })
    expect(tx.technician.updateMany).toHaveBeenCalledWith({ where: { organizationId: "org-1", isSample: true }, data: { isSample: false } })
    expect(result).toEqual({ customers: 5, technicians: 3 })
  })
})

describe("POST /me/sandbox/exit", () => {
  function makeApp(role: string) {
    const app = express()
    app.use((req, _res, next) => {
      ;(req as express.Request & { user: unknown }).user = { id: "u1", organizationId: "org-1", role }
      next()
    })
    app.use("/", organizationsRouter)
    return app
  }

  beforeEach(() => {
    tx.organization.updateMany.mockResolvedValue({ count: 1 })
    tx.customer.deleteMany.mockResolvedValue({ count: 5 })
    tx.technician.deleteMany.mockResolvedValue({ count: 3 })
  })

  it("is office-only", async () => {
    for (const role of ["technician", "customer"]) {
      const res = await request(makeApp(role)).post("/me/sandbox/exit")
      expect(res.status).toBe(403)
    }
    expect(tx.organization.updateMany).not.toHaveBeenCalled()
  })

  it("exits sandbox for an office user", async () => {
    const res = await request(makeApp("office")).post("/me/sandbox/exit")
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.removed).toEqual({ customers: 5, technicians: 3 })
  })

  it("returns 409 if sandbox was already exited", async () => {
    tx.organization.updateMany.mockResolvedValue({ count: 0 })
    const res = await request(makeApp("office")).post("/me/sandbox/exit")
    expect(res.status).toBe(409)
  })
})
