import { describe, it, expect, vi } from "vitest"
import { Request, Response, NextFunction } from "express"

// Mock prisma
vi.mock("../lib/prisma.js", () => ({
  prisma: {
    organization: {
      findUnique: vi.fn(),
    },
  },
}))

import { prisma } from "../lib/prisma.js"
import { requireSubscription } from "../middleware/require-subscription.js"
import { requireAdmin } from "../middleware/require-admin.js"

function makeReq(overrides: object = {}) {
  return {
    user: { id: "u1", email: "x@x.com", role: "office", organizationId: "org-1" },
    ...overrides,
  } as unknown as Request
}
function makeRes() {
  const res = { status: vi.fn(), json: vi.fn() } as unknown as Response
  ;(res.status as ReturnType<typeof vi.fn>).mockReturnValue(res)
  return res
}

describe("requireSubscription", () => {
  it("calls next() when plan is active", async () => {
    vi.mocked(prisma.organization.findUnique).mockResolvedValue({ plan: "entry" } as never)
    const next = vi.fn() as unknown as NextFunction
    await requireSubscription(makeReq(), makeRes(), next)
    expect(next).toHaveBeenCalled()
  })

  it("returns 402 when plan is cancelled", async () => {
    vi.mocked(prisma.organization.findUnique).mockResolvedValue({ plan: "cancelled" } as never)
    const res = makeRes()
    const next = vi.fn() as unknown as NextFunction
    await requireSubscription(makeReq(), res, next)
    expect(res.status).toHaveBeenCalledWith(402)
    expect(next).not.toHaveBeenCalled()
  })
})

describe("requireAdmin", () => {
  it("calls next() when role is admin", () => {
    const next = vi.fn() as unknown as NextFunction
    requireAdmin(makeReq({ user: { role: "admin", organizationId: "o" } }), makeRes(), next)
    expect(next).toHaveBeenCalled()
  })

  it("returns 403 when role is not admin", () => {
    const res = makeRes()
    const next = vi.fn() as unknown as NextFunction
    requireAdmin(makeReq(), res, next)
    expect(res.status).toHaveBeenCalledWith(403)
    expect(next).not.toHaveBeenCalled()
  })
})
