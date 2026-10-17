import { describe, it, expect, vi, beforeEach } from "vitest"
import request from "supertest"
import express from "express"

// Every route that used to filter only by organizationId and so served staff-only
// data (or accepted staff-only writes) to a logged-in CUSTOMER. Each router is
// mounted directly with a fake req.user, exactly as the other router tests do —
// no app-level middleware — so this proves the guard lives in the router itself.
//
// prisma is an auto-mocking proxy: any model.method is a vi.fn resolving to an
// empty-ish default, so for allowed roles we only assert "not 403", and for a
// customer we additionally assert the database was never touched.

const { prisma, fns } = vi.hoisted(() => {
  const fns = new Map<string, ReturnType<typeof vi.fn>>()
  const defaultFor = (method: string) =>
    method === "findMany" ? [] : method === "count" ? 0 : method === "aggregate" ? { _sum: {} } : null
  const model = (name: string) =>
    new Proxy({}, {
      get: (_t, method: string) => {
        const key = `${name}.${method}`
        if (!fns.has(key)) fns.set(key, vi.fn(async () => defaultFor(method)))
        return fns.get(key)
      },
    })
  const prisma = new Proxy({}, { get: (_t, name: string) => model(name) })
  return { prisma, fns }
})

vi.mock("../lib/prisma.js", () => ({ prisma }))
vi.mock("../services/stripe.js", () => ({ stripe: null, getPriceId: vi.fn() }))
vi.mock("../services/field-ai.js", () => ({ streamFieldAiResponse: vi.fn() }))
vi.mock("../services/voice-transcribe.js", () => ({ transcribeAudio: vi.fn(), extractJobFields: vi.fn() }))
vi.mock("../services/estimate-ai.js", () => ({ generateEstimate: vi.fn().mockResolvedValue({ error: "job_not_found" }) }))
vi.mock("../services/email.js", () => ({ sendEmail: vi.fn() }))
vi.mock("../services/sms.js", () => ({ sendEstimateReadySms: vi.fn().mockResolvedValue(undefined) }))

import { techniciansRouter } from "../routes/technicians.js"
import { complianceRouter } from "../routes/compliance.js"
import { dashboardRouter } from "../routes/dashboard.js"
import { notificationsRouter } from "../routes/notifications.js"
import { pricebookRouter } from "../routes/pricebook.js"
import { onboardingRouter } from "../routes/onboarding.js"
import { voiceRouter } from "../routes/voice.js"
import { recurringJobsRouter } from "../routes/recurring-jobs.js"
import { equipmentRouter } from "../routes/equipment.js"
import { estimatesRouter } from "../routes/estimates.js"
import { aiRouter } from "../routes/ai.js"
import { invoicesRouter } from "../routes/invoices.js"
import { customersRouter } from "../routes/customers.js"
import { jobsRouter } from "../routes/jobs.js"
import { billingRouter } from "../routes/billing.js"

type Role = "customer" | "office" | "technician"
const STAFF: Role[] = ["office", "technician"]
const OFFICE: Role[] = ["office"]

interface Case {
  router: express.Router
  method: "get" | "post" | "patch" | "delete"
  path: string
  allowed: Role[]
}

const c = (router: express.Router, method: Case["method"], path: string, allowed: Role[]): Case =>
  ({ router, method, path, allowed })

const CASES: Case[] = [
  // Roster with phone/email, and the ability to create/edit/delete technicians
  c(techniciansRouter, "get", "/", STAFF),
  c(techniciansRouter, "get", "/t1", STAFF),
  c(techniciansRouter, "post", "/", STAFF),
  c(techniciansRouter, "patch", "/t1", STAFF),
  c(techniciansRouter, "delete", "/t1", OFFICE), // pre-existing: office only

  // Every job's compliance entries, other customers' and technicians' names
  c(complianceRouter, "get", "/", STAFF),
  c(complianceRouter, "get", "/job/j1", STAFF),
  c(complianceRouter, "post", "/", STAFF),

  // Org-wide revenue and totals
  c(dashboardRouter, "get", "/stats", OFFICE),
  c(dashboardRouter, "get", "/chart", OFFICE),

  // "Payment received $X from <customer>"
  c(notificationsRouter, "get", "/", OFFICE),
  c(notificationsRouter, "patch", "/read-all", OFFICE),
  c(notificationsRouter, "patch", "/n1/read", OFFICE),

  c(pricebookRouter, "get", "/", STAFF),
  c(onboardingRouter, "get", "/status", OFFICE),
  c(onboardingRouter, "post", "/dismiss", OFFICE),
  c(voiceRouter, "post", "/transcribe", STAFF),

  // Other customers' recurring schedules; writes
  c(recurringJobsRouter, "get", "/pending-drafts", STAFF),
  c(recurringJobsRouter, "post", "/", STAFF),
  c(recurringJobsRouter, "patch", "/r1", STAFF),
  c(recurringJobsRouter, "delete", "/r1", STAFF),

  // Equipment writes (reads are scoped, covered in customer-data-scoping)
  c(equipmentRouter, "post", "/", STAFF),
  c(equipmentRouter, "post", "/check-maintenance", STAFF),
  c(equipmentRouter, "patch", "/e1", STAFF),
  c(equipmentRouter, "delete", "/e1", STAFF),

  // Authenticated estimates: AI spend, drafts, and the approval token
  c(estimatesRouter, "post", "/generate", STAFF),
  c(estimatesRouter, "get", "/e1", STAFF),
  c(estimatesRouter, "patch", "/e1", STAFF),
  c(estimatesRouter, "post", "/e1/send", STAFF),
  c(jobsRouter, "get", "/j1/estimates", STAFF),

  // AI field assistant: chat history and AI credit
  c(aiRouter, "get", "/chat/j1", STAFF),
  c(aiRouter, "post", "/chat/stream", STAFF),

  // Invoices: org-wide revenue, and creating/editing (a customer could mark theirs paid)
  c(invoicesRouter, "get", "/revenue", OFFICE),
  c(invoicesRouter, "post", "/", STAFF),
  c(invoicesRouter, "patch", "/i1", STAFF),

  // Customer records: other customers' details, creating and editing them
  c(customersRouter, "get", "/c1", STAFF),
  c(customersRouter, "post", "/", STAFF),
  c(customersRouter, "patch", "/c1", STAFF),

  // The shop's Stripe billing portal (can cancel the subscription)
  c(billingRouter, "post", "/portal", OFFICE),
]

function appFor(router: express.Router, role: Role) {
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    ;(req as express.Request & { user: unknown }).user = {
      userId: "u1",
      organizationId: "org-1",
      role,
      ...(role === "customer" && { customerId: "cust-1" }),
      ...(role === "technician" && { technicianId: "tech-1" }),
    }
    next()
  })
  app.use("/", router)
  return app
}

beforeEach(() => fns.forEach((f) => f.mockClear()))

describe.each(CASES)("$method $path", (tc) => {
  const roles: Role[] = ["customer", "office", "technician"]
  it.each(roles)("as %s", async (role) => {
    const res = await request(appFor(tc.router, role))[tc.method](tc.path).send({})
    if (tc.allowed.includes(role)) {
      expect(res.status, `${role} should keep access`).not.toBe(403)
    } else {
      expect(res.status, `${role} should be forbidden`).toBe(403)
    }
    if (role === "customer") {
      const touched = [...fns.entries()].filter(([, f]) => f.mock.calls.length > 0).map(([k]) => k)
      expect(touched, "database must not be touched for a forbidden customer").toEqual([])
    }
  })
})
