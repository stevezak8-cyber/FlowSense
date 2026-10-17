import { describe, it, expect, vi } from "vitest"
import type { Request, Response } from "express"
import { customerScope, isCustomer, NO_MATCH_ID, requireOffice, requireStaff, technicianScope } from "../middleware/roles.js"

function reqAs(user?: { role: string; customerId?: string; technicianId?: string }) {
  return { user } as unknown as Request
}

function run(mw: typeof requireStaff, req: Request) {
  const json = vi.fn()
  const res = { status: vi.fn().mockReturnValue({ json }) } as unknown as Response
  const next = vi.fn()
  mw(req, res, next)
  return { res, json, next }
}

describe("requireStaff", () => {
  it.each(["office", "technician"])("lets %s through", (role) => {
    const { next, res } = run(requireStaff, reqAs({ role }))
    expect(next).toHaveBeenCalledOnce()
    expect(res.status).not.toHaveBeenCalled()
  })

  it.each(["customer", "admin", "", "something-new"])("403s role %j", (role) => {
    const { next, res } = run(requireStaff, reqAs({ role }))
    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(403)
  })

  it("403s when there is no user at all", () => {
    const { next, res } = run(requireStaff, reqAs(undefined))
    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(403)
  })
})

describe("requireOffice", () => {
  it("lets office through", () => {
    expect(run(requireOffice, reqAs({ role: "office" })).next).toHaveBeenCalledOnce()
  })

  it.each(["technician", "customer"])("403s %s", (role) => {
    const { next, res } = run(requireOffice, reqAs({ role }))
    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(403)
  })
})

describe("customerScope", () => {
  it("is empty for staff, so their queries are unchanged", () => {
    expect(customerScope(reqAs({ role: "office" }))).toEqual({})
    expect(customerScope(reqAs({ role: "technician", technicianId: "t1" }))).toEqual({})
  })

  it("pins a customer to their own customerId", () => {
    expect(customerScope(reqAs({ role: "customer", customerId: "c1" }))).toEqual({ customerId: "c1" })
  })

  it("matches nothing for a customer login with no linked record (fails closed)", () => {
    expect(customerScope(reqAs({ role: "customer" }))).toEqual({ customerId: NO_MATCH_ID })
  })

  it("isCustomer only matches the customer role", () => {
    expect(isCustomer(reqAs({ role: "customer" }))).toBe(true)
    expect(isCustomer(reqAs({ role: "office" }))).toBe(false)
  })
})

describe("technicianScope", () => {
  it("pins a technician to their own technicianId", () => {
    expect(technicianScope(reqAs({ role: "technician", technicianId: "t1" }))).toEqual({ technicianId: "t1" })
  })

  it("matches nothing for a technician login with no linked record", () => {
    expect(technicianScope(reqAs({ role: "technician" }))).toEqual({ technicianId: NO_MATCH_ID })
  })

  it("is empty for office", () => {
    expect(technicianScope(reqAs({ role: "office" }))).toEqual({})
  })
})
