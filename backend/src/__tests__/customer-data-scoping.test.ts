import { describe, it, expect, vi, beforeEach } from "vitest"
import request from "supertest"
import express from "express"

// Routes a customer legitimately uses, which must return only THEIR rows (and
// only the fields they need), while office/technician behavior is unchanged.
// Routers are mounted directly with a fake req.user, with no app-level
// middleware, like the other router tests.

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    equipment: { findMany: vi.fn(), findFirst: vi.fn() },
    recurringJob: { findMany: vi.fn() },
    invoice: { findMany: vi.fn(), findFirst: vi.fn() },
    job: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    organization: { findUnique: vi.fn() },
    blockedDate: { findMany: vi.fn() },
    complianceLog: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
    aiMessage: { findMany: vi.fn(), create: vi.fn() },
    customer: { findFirst: vi.fn() },
    technician: { findUnique: vi.fn() },
    user: { findFirst: vi.fn() },
  },
}))
vi.mock("../services/field-ai.js", () => ({ streamFieldAiResponse: vi.fn() }))
vi.mock("../services/concierge-ai.js", () => ({ getConciergeReply: vi.fn() }))
vi.mock("../services/invoice-pdf.js", () => ({ generateInvoicePdf: vi.fn().mockResolvedValue(Buffer.from("%PDF")) }))
vi.mock("../services/email.js", () => ({
  sendEmail: vi.fn(), sendEnRouteEmail: vi.fn(), sendJobInProgressEmail: vi.fn(), sendJobCompletedEmail: vi.fn(),
}))
vi.mock("../services/notifications.js", () => ({ broadcastToRole: vi.fn(), notifyInApp: vi.fn() }))
vi.mock("../services/push.js", () => ({ sendPushToUser: vi.fn() }))
vi.mock("../services/create-notification.js", () => ({ createNotification: vi.fn() }))
vi.mock("../services/pre-arrival.js", () => ({ generatePreArrival: vi.fn() }))
vi.mock("../services/org-notifications.js", () => ({
  notifyOrgNewBooking: vi.fn(), notifyOrgStatusChange: vi.fn(), notifyOrgJobCompleted: vi.fn(),
  notifyOfficeCancellation: vi.fn(), notifyOfficePaymentReceived: vi.fn(), notifyOfficePlanCreated: vi.fn(),
}))
vi.mock("../services/sms.js", () => ({
  sendBookingConfirmedSms: vi.fn(), sendEnRouteSms: vi.fn(), sendJobCompletedSms: vi.fn(),
}))

import { prisma } from "../lib/prisma.js"
import { equipmentRouter } from "../routes/equipment.js"
import { recurringJobsRouter } from "../routes/recurring-jobs.js"
import { invoicesRouter } from "../routes/invoices.js"
import { jobsRouter } from "../routes/jobs.js"
import { organizationsRouter } from "../routes/organizations.js"
import { availabilityRouter } from "../routes/availability.js"
import { complianceRouter } from "../routes/compliance.js"
import { aiRouter } from "../routes/ai.js"
import { conciergeRouter } from "../routes/concierge.js"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any

type User = { role: string; customerId?: string; technicianId?: string }
const customer: User = { role: "customer", customerId: "cust-1" }
const unlinkedCustomer: User = { role: "customer" }
const office: User = { role: "office" }
const technician: User = { role: "technician", technicianId: "tech-1" }

function appFor(router: express.Router, user: User) {
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    ;(req as express.Request & { user: unknown }).user = { userId: "u1", organizationId: "org-1", ...user }
    next()
  })
  app.use("/", router)
  return app
}

const whereOf = (fn: { mock: { calls: unknown[][] } }, call = 0) =>
  (fn.mock.calls[call][0] as { where: Record<string, unknown> }).where

beforeEach(() => {
  vi.clearAllMocks()
  db.equipment.findMany.mockResolvedValue([])
  db.equipment.findFirst.mockResolvedValue(null)
  db.recurringJob.findMany.mockResolvedValue([])
  db.invoice.findMany.mockResolvedValue([])
  db.invoice.findFirst.mockResolvedValue(null)
  db.job.findMany.mockResolvedValue([])
  db.job.findFirst.mockResolvedValue(null)
  db.blockedDate.findMany.mockResolvedValue([])
  db.complianceLog.findMany.mockResolvedValue([])
  db.complianceLog.findFirst.mockResolvedValue(null)
  db.aiMessage.findMany.mockResolvedValue([])
  db.aiMessage.create.mockResolvedValue({ id: "m1" })
  db.customer.findFirst.mockResolvedValue(null)
})

describe("GET /api/equipment", () => {
  it("returns a customer only their own equipment", async () => {
    await request(appFor(equipmentRouter, customer)).get("/")
    expect(whereOf(db.equipment.findMany)).toEqual({ organizationId: "org-1", customerId: "cust-1" })
  })

  it("ignores a customerId query param from a customer (no peeking at someone else's)", async () => {
    await request(appFor(equipmentRouter, customer)).get("/?customerId=cust-OTHER")
    expect(whereOf(db.equipment.findMany).customerId).toBe("cust-1")
  })

  it("returns nothing for a customer login with no linked customer record", async () => {
    await request(appFor(equipmentRouter, unlinkedCustomer)).get("/")
    expect(whereOf(db.equipment.findMany).customerId).toBe("__none__")
  })

  it("leaves office unscoped, and still honors their customerId filter", async () => {
    await request(appFor(equipmentRouter, office)).get("/")
    expect(whereOf(db.equipment.findMany, 0)).toEqual({ organizationId: "org-1" })
    await request(appFor(equipmentRouter, office)).get("/?customerId=cust-9")
    expect(whereOf(db.equipment.findMany, 1)).toEqual({ organizationId: "org-1", customerId: "cust-9" })
  })

  it("leaves a technician unscoped", async () => {
    await request(appFor(equipmentRouter, technician)).get("/")
    expect(whereOf(db.equipment.findMany)).toEqual({ organizationId: "org-1" })
  })

  it("has no GET /:id route to leak through", async () => {
    const res = await request(appFor(equipmentRouter, customer)).get("/some-equipment-id")
    expect(res.status).toBe(404)
    expect(db.equipment.findFirst).not.toHaveBeenCalled()
  })
})

describe("GET /api/equipment/:id/history", () => {
  it("only finds the equipment if it is the customer's own", async () => {
    const res = await request(appFor(equipmentRouter, customer)).get("/eq-1/history")
    expect(whereOf(db.equipment.findFirst)).toEqual({ id: "eq-1", organizationId: "org-1", customerId: "cust-1" })
    expect(res.status).toBe(404)
    expect(db.job.findMany).not.toHaveBeenCalled()
  })

  it("office can read any equipment's history", async () => {
    db.equipment.findFirst.mockResolvedValue({ id: "eq-1" })
    const res = await request(appFor(equipmentRouter, office)).get("/eq-1/history")
    expect(whereOf(db.equipment.findFirst)).toEqual({ id: "eq-1", organizationId: "org-1" })
    expect(res.status).toBe(200)
  })
})

describe("GET /api/recurring-jobs", () => {
  it("returns a customer only their own schedules, whatever they ask for", async () => {
    await request(appFor(recurringJobsRouter, customer)).get("/?customerId=cust-OTHER&isActive=all")
    expect(whereOf(db.recurringJob.findMany)).toEqual({ organizationId: "org-1", customerId: "cust-1" })
  })

  it("returns nothing for an unlinked customer login", async () => {
    await request(appFor(recurringJobsRouter, unlinkedCustomer)).get("/")
    expect(whereOf(db.recurringJob.findMany).customerId).toBe("__none__")
  })

  it("office still filters by the customerId they pass", async () => {
    await request(appFor(recurringJobsRouter, office)).get("/?customerId=cust-9")
    expect(whereOf(db.recurringJob.findMany)).toMatchObject({ organizationId: "org-1", customerId: "cust-9" })
  })
})

describe("invoices", () => {
  it("GET / returns nothing, not everything, to an unlinked customer login", async () => {
    await request(appFor(invoicesRouter, unlinkedCustomer)).get("/")
    expect(whereOf(db.invoice.findMany)).toEqual({ organizationId: "org-1", customerId: "__none__" })
  })

  it("GET / still scopes a linked customer and leaves office unscoped", async () => {
    await request(appFor(invoicesRouter, customer)).get("/")
    expect(whereOf(db.invoice.findMany, 0)).toEqual({ organizationId: "org-1", customerId: "cust-1" })
    await request(appFor(invoicesRouter, office)).get("/")
    expect(whereOf(db.invoice.findMany, 1)).toEqual({ organizationId: "org-1" })
  })

  it("GET /:id/pdf 404s for another customer's invoice (lookup is pinned to the caller)", async () => {
    const res = await request(appFor(invoicesRouter, customer)).get("/inv-1/pdf")
    expect(whereOf(db.invoice.findFirst)).toEqual({ id: "inv-1", organizationId: "org-1", customerId: "cust-1" })
    expect(res.status).toBe(404)
  })

  it("GET /:id/pdf lets office fetch any invoice", async () => {
    db.invoice.findFirst.mockResolvedValue({ id: "inv-1", organization: {}, customer: {}, job: {} })
    const res = await request(appFor(invoicesRouter, office)).get("/inv-1/pdf")
    expect(whereOf(db.invoice.findFirst)).toEqual({ id: "inv-1", organizationId: "org-1" })
    expect(res.status).toBe(200)
  })

  it("POST /:id/payment-link only finds the caller's own invoice", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_x")
    const res = await request(appFor(invoicesRouter, customer)).post("/inv-1/payment-link")
    vi.unstubAllEnvs()
    expect(whereOf(db.invoice.findFirst)).toEqual({ id: "inv-1", organizationId: "org-1", customerId: "cust-1" })
    expect(res.status).toBe(404)
  })
})

describe("jobs", () => {
  it("GET / returns nothing to an unlinked customer login", async () => {
    await request(appFor(jobsRouter, unlinkedCustomer)).get("/")
    expect(whereOf(db.job.findMany).customerId).toBe("__none__")
  })

  it("GET / keeps scoping a technician to their own jobs, and office to everything", async () => {
    await request(appFor(jobsRouter, technician)).get("/")
    expect(whereOf(db.job.findMany, 0)).toMatchObject({ organizationId: "org-1", technicianId: "tech-1" })
    await request(appFor(jobsRouter, office)).get("/")
    expect(whereOf(db.job.findMany, 1)).toEqual({ organizationId: "org-1" })
  })

  it("GET /:id only finds a customer's own job, without the internal compliance trail", async () => {
    const res = await request(appFor(jobsRouter, customer)).get("/job-1")
    const args = db.job.findFirst.mock.calls[0][0]
    expect(args.where).toEqual({ id: "job-1", organizationId: "org-1", customerId: "cust-1" })
    expect(args.include.complianceLogs).toBeUndefined()
    expect(args.include.technician).toEqual({ select: { id: true, name: true } })
    expect(res.status).toBe(404)
  })

  it("GET /:id gives office the full job, compliance trail included", async () => {
    db.job.findFirst.mockResolvedValue({ id: "job-1" })
    await request(appFor(jobsRouter, office)).get("/job-1")
    const args = db.job.findFirst.mock.calls[0][0]
    expect(args.where).toEqual({ id: "job-1", organizationId: "org-1" })
    expect(args.include.complianceLogs).toBeDefined()
    expect(args.include.technician).toBe(true)
  })

  describe("PATCH /:id as a customer", () => {
    it("rejects any change other than cancelling", async () => {
      for (const body of [{ status: "completed" }, { technicianId: "ckx1234567890abcdefghijkl" }, { summary: "x" }, { status: "cancelled", summary: "x" }]) {
        const res = await request(appFor(jobsRouter, customer)).patch("/job-1").send(body)
        expect(res.status, JSON.stringify(body)).toBe(403)
      }
      expect(db.job.findFirst).not.toHaveBeenCalled()
      expect(db.job.update).not.toHaveBeenCalled()
    })

    it("404s when cancelling someone else's job", async () => {
      const res = await request(appFor(jobsRouter, customer)).patch("/job-1").send({ status: "cancelled" })
      expect(whereOf(db.job.findFirst)).toEqual({ id: "job-1", organizationId: "org-1", customerId: "cust-1" })
      expect(res.status).toBe(404)
      expect(db.job.update).not.toHaveBeenCalled()
    })

    it("won't cancel a job a technician is already working", async () => {
      db.job.findFirst.mockResolvedValue({ status: "in_progress" })
      const res = await request(appFor(jobsRouter, customer)).patch("/job-1").send({ status: "cancelled" })
      expect(res.status).toBe(400)
      expect(db.job.update).not.toHaveBeenCalled()
    })

    it("still lets them cancel their own pending booking (the customer dashboard's Cancel button)", async () => {
      db.job.findFirst.mockResolvedValue({ status: "pending" })
      db.job.update.mockResolvedValue({
        id: "job-1", status: "cancelled", technicianId: null, customerId: "cust-1", equipmentType: "central-ac",
        customer: { id: "cust-1", name: "C", address: "A" }, technician: null,
      })
      const res = await request(appFor(jobsRouter, customer)).patch("/job-1").send({ status: "cancelled" })
      expect(res.status).toBe(200)
      expect(db.job.update.mock.calls[0][0]).toMatchObject({
        where: { id: "job-1", organizationId: "org-1" },
        data: { status: "cancelled" },
      })
    })
  })

  it("PATCH /:id is unchanged for office (arbitrary fields, no ownership pin)", async () => {
    db.job.update.mockResolvedValue({
      id: "job-1", status: "pending", technicianId: null, customerId: "cust-1", equipmentType: null,
      customer: { id: "cust-1", name: "C", address: "A" }, technician: null,
    })
    const res = await request(appFor(jobsRouter, office)).patch("/job-1").send({ summary: "note" })
    expect(res.status).toBe(200)
    expect(db.job.findFirst).not.toHaveBeenCalled()
    expect(db.job.update.mock.calls[0][0].where).toEqual({ id: "job-1", organizationId: "org-1" })
  })
})

describe("GET /api/organizations/me", () => {
  const FULL = { id: "org-1", name: "Cool Air", slug: "cool", phone: "555", email: "a@b.c", address: "1 Main" }

  it("gives a customer only how to reach the shop, not its internal configuration", async () => {
    db.organization.findUnique.mockResolvedValue(FULL)
    await request(appFor(organizationsRouter, customer)).get("/me")
    const select = db.organization.findUnique.mock.calls[0][0].select
    expect(Object.keys(select).sort()).toEqual(["address", "email", "id", "name", "phone", "slug"])
    for (const internal of ["stripeConnectAccountId", "stripeConnectOnboarded", "notificationPreferences", "estimateDepositThreshold", "estimateDepositPercent", "smsEnabled", "sandboxMode"]) {
      expect(select[internal], internal).toBeUndefined()
    }
  })

  it.each([office, technician])("leaves the full org profile for staff (%#)", async (user) => {
    db.organization.findUnique.mockResolvedValue(FULL)
    await request(appFor(organizationsRouter, user)).get("/me")
    const select = db.organization.findUnique.mock.calls[0][0].select
    expect(select.stripeConnectAccountId).toBe(true)
    expect(select.notificationPreferences).toBe(true)
  })
})

describe("GET /api/availability", () => {
  const blocked = [{ id: "b1", organizationId: "org-1", date: new Date("2027-01-02"), reason: "Owner's surgery" }]

  it("tells a customer which dates are closed, but not why", async () => {
    db.organization.findUnique.mockResolvedValue({ availabilitySchedule: { mon: null } })
    db.blockedDate.findMany.mockResolvedValue(blocked)
    const res = await request(appFor(availabilityRouter, customer)).get("/")
    expect(res.status).toBe(200)
    expect(res.body.blockedDates).toHaveLength(1)
    expect(res.body.blockedDates[0].date).toBeDefined()
    expect(res.body.blockedDates[0]).not.toHaveProperty("reason")
    expect(res.body.schedule).toEqual({ mon: null })
  })

  it("keeps the reason for office", async () => {
    db.organization.findUnique.mockResolvedValue({ availabilitySchedule: null })
    db.blockedDate.findMany.mockResolvedValue(blocked)
    const res = await request(appFor(availabilityRouter, office)).get("/")
    expect(res.body.blockedDates[0].reason).toBe("Owner's surgery")
  })
})

describe("compliance logs are tied to the caller's org", () => {
  it("GET /job/:jobId only returns logs for a job in the caller's organization", async () => {
    await request(appFor(complianceRouter, technician)).get("/job/job-1")
    expect(whereOf(db.complianceLog.findMany)).toEqual({ jobId: "job-1", job: { organizationId: "org-1" } })
  })

  it("POST / refuses a jobId from another organization", async () => {
    const res = await request(appFor(complianceRouter, technician))
      .post("/")
      .send({ jobId: "ckx1234567890abcdefghijkl", type: "safety_ack", payload: {} })
    expect(res.status).toBe(404)
    expect(whereOf(db.job.findFirst)).toEqual({ id: "ckx1234567890abcdefghijkl", organizationId: "org-1" })
    expect(db.complianceLog.create).not.toHaveBeenCalled()
  })

  it("POST / still writes a log for a job in the org", async () => {
    db.job.findFirst.mockResolvedValue({ id: "ckx1234567890abcdefghijkl" })
    db.complianceLog.create.mockResolvedValue({ id: "log-1" })
    const res = await request(appFor(complianceRouter, technician))
      .post("/")
      .send({ jobId: "ckx1234567890abcdefghijkl", type: "safety_ack", payload: {} })
    expect(res.status).toBe(201)
  })
})

describe("AI field assistant: staff, and a technician only on their own job", () => {
  it("GET /chat/:jobId pins a technician to jobs assigned to them", async () => {
    const res = await request(appFor(aiRouter, technician)).get("/chat/job-1")
    expect(whereOf(db.job.findFirst)).toEqual({ id: "job-1", organizationId: "org-1", technicianId: "tech-1" })
    expect(res.status).toBe(404)
    expect(db.aiMessage.findMany).not.toHaveBeenCalled()
  })

  it("GET /chat/:jobId lets office read any job in the org", async () => {
    db.job.findFirst.mockResolvedValue({ id: "job-1" })
    const res = await request(appFor(aiRouter, office)).get("/chat/job-1")
    expect(whereOf(db.job.findFirst)).toEqual({ id: "job-1", organizationId: "org-1" })
    expect(res.status).toBe(200)
  })

  it("a technician login with no linked technician record sees nothing", async () => {
    await request(appFor(aiRouter, { role: "technician" })).get("/chat/job-1")
    expect(whereOf(db.job.findFirst).technicianId).toBe("__none__")
  })

  it("POST /chat/stream writes nothing for a job a technician isn't assigned to", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key")
    const res = await request(appFor(aiRouter, technician)).post("/chat/stream").send({ jobId: "job-1", message: "hi" })
    vi.unstubAllEnvs()
    expect(whereOf(db.job.findFirst)).toEqual({ id: "job-1", organizationId: "org-1", technicianId: "tech-1" })
    expect(res.status).toBe(404)
    expect(db.aiMessage.create).not.toHaveBeenCalled()
  })
})

describe("POST /api/concierge/chat", () => {
  it("never falls back to some other customer's record", async () => {
    for (const user of [unlinkedCustomer, office]) {
      db.customer.findFirst.mockResolvedValue({ id: "cust-OTHER" })
      const res = await request(appFor(conciergeRouter, user)).post("/chat").send({ messages: [{ role: "user", content: "hi" }] })
      expect(res.status).toBe(400)
    }
    expect(db.customer.findFirst).not.toHaveBeenCalled()
  })
})
