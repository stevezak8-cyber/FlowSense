import type { Request, Response, NextFunction } from "express"

// Three login roles exist: office, technician (both "staff") and customer (an
// end customer of the shop, not an employee). Routes that only filter by
// organizationId treat a customer login like staff, so anything internal to
// the shop must opt in to one of these guards. They are applied inside each
// router (not only in index.ts) so a router mounted on its own in a test, or
// somewhere else later, is still protected.

const STAFF_ROLES = ["office", "technician"]

export function isCustomer(req: Request): boolean {
  return req.user?.role === "customer"
}

/** Office or technician. Customers (and any unknown role) get a 403. */
export function requireStaff(req: Request, res: Response, next: NextFunction) {
  if (!req.user || !STAFF_ROLES.includes(req.user.role)) {
    return res.status(403).json({ error: "Forbidden" })
  }
  next()
}

/** Office only. */
export function requireOffice(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== "office") {
    return res.status(403).json({ error: "Forbidden" })
  }
  next()
}

// Matches no real row; used so a customer login with no linked customer record
// sees nothing rather than everything.
export const NO_MATCH_ID = "__none__"

/**
 * Prisma `where` fragment for a model with a `technicianId` column: a
 * technician is pinned to the jobs assigned to them (a technician login with
 * no linked record matches nothing); office is unchanged.
 */
export function technicianScope(req: Request): { technicianId?: string } {
  if (req.user?.role !== "technician") return {}
  return { technicianId: req.user.technicianId ?? NO_MATCH_ID }
}

/**
 * Prisma `where` fragment that pins a query to the caller's own customer
 * record. Spread it into any query on a model with a `customerId` column:
 * empty for staff (unchanged behavior), `{ customerId }` for a customer, and a
 * never-matching customerId for a customer login that has no linked record.
 */
export function customerScope(req: Request): { customerId?: string } {
  if (!isCustomer(req)) return {}
  return { customerId: req.user!.customerId ?? NO_MATCH_ID }
}
