import { describe, it, expect } from "vitest"
import { buildDemoData, type DemoData } from "../services/demo-account/build.js"
import { DEMO_TZ } from "../services/demo-account/content.js"

const DAY = 86_400_000
const MONTH = 30.44 * DAY

function counter() {
  let n = 0
  return () => `id-${++n}`
}

function build(now: Date, seed?: number): DemoData {
  return buildDemoData({ now, orgId: "org-demo", idGen: counter(), seed })
}

const asDate = (v: unknown) => new Date(v as Date | string)
const localParts = (d: Date) => {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: DEMO_TZ, hourCycle: "h23", hour: "2-digit", minute: "2-digit", weekday: "short" }).formatToParts(d)
  const get = (t: string) => p.find((x) => x.type === t)?.value as string
  return { hour: Number(get("hour")) + Number(get("minute")) / 60, weekday: get("weekday") }
}

// Wed Oct 14 2026, 10:30am Central (CDT = UTC-5)
const MORNING = new Date("2026-10-14T15:30:00Z")
const EVENING = new Date("2026-10-14T01:30:00Z")
const data = build(MORNING)

describe("buildDemoData", () => {
  it("is large enough to fill every page", () => {
    expect(data.technicians).toHaveLength(6)
    expect(data.vehicles).toHaveLength(6)
    expect(data.customers.length).toBeGreaterThanOrEqual(25)
    expect(data.equipment.length).toBeGreaterThan(40)
    expect(data.jobs.length).toBeGreaterThan(250)
    expect(data.invoices.length).toBeGreaterThan(250)
    expect(data.pricebook.length).toBeGreaterThanOrEqual(30)
    expect(data.complianceLogs.length).toBeGreaterThan(40)
  })

  it("is deterministic for a given seed and changes with a different one", () => {
    expect(JSON.stringify(build(MORNING, 7))).toBe(JSON.stringify(build(MORNING, 7)))
    expect(JSON.stringify(build(MORNING, 7))).not.toBe(JSON.stringify(build(MORNING, 8)))
  })

  it("never uses a real contact: no customer emails, only fictional 555-01xx phones", () => {
    for (const c of data.customers) {
      expect(c.email ?? null).toBeNull()
      expect(c.phone).toMatch(/^\(512\) 555-01\d\d$/)
    }
    const phones = [...data.customers, ...data.technicians].map((x) => x.phone)
    expect(new Set(phones).size).toBe(phones.length)
  })

  it("keeps every foreign key pointing at a row that exists", () => {
    const ids = (rows: Array<{ id?: unknown }>) => new Set(rows.map((r) => r.id as string))
    const tech = ids(data.technicians), cust = ids(data.customers), eq = ids(data.equipment)
    const job = ids(data.jobs), inv = ids(data.invoices), pb = ids(data.pricebook), est = ids(data.estimates)
    const rj = ids(data.recurringJobs), plan = ids(data.plans), conv = ids(data.conversations)
    const custOfEquip = new Map(data.equipment.map((e) => [e.id as string, e.customerId]))

    for (const j of data.jobs) {
      expect(cust.has(j.customerId as string)).toBe(true)
      if (j.technicianId) expect(tech.has(j.technicianId as string)).toBe(true)
      if (j.equipmentId) {
        expect(eq.has(j.equipmentId as string)).toBe(true)
        expect(custOfEquip.get(j.equipmentId as string)).toBe(j.customerId)
      }
      if (j.recurringJobId) expect(rj.has(j.recurringJobId as string)).toBe(true)
    }
    for (const i of data.invoices) { if (i.jobId) expect(job.has(i.jobId as string)).toBe(true); expect(cust.has(i.customerId as string)).toBe(true) }
    for (const e of data.estimates) expect(job.has(e.jobId as string)).toBe(true)
    for (const l of data.estimateLines) { expect(est.has(l.estimateId as string)).toBe(true); expect(pb.has(l.pricebookItemId as string)).toBe(true) }
    for (const r of data.reviews) expect(job.has(r.jobId as string)).toBe(true)
    for (const c of data.complianceLogs) expect(job.has(c.jobId as string)).toBe(true)
    for (const p of data.plans) { expect(cust.has(p.customerId as string)).toBe(true); expect(inv.has(p.invoiceId as string)).toBe(true) }
    for (const it of data.planItems) { expect(plan.has(it.planId as string)).toBe(true); expect(rj.has(it.recurringJobId as string)).toBe(true) }
    for (const m of data.messages) expect(conv.has(m.conversationId as string)).toBe(true)
  })

  it("has unique ids and respects one-per-job rules", () => {
    const all = [
      ...data.technicians, ...data.vehicles, ...data.customers, ...data.equipment, ...data.pricebook, ...data.recurringJobs,
      ...data.jobs, ...data.invoices, ...data.estimates, ...data.estimateLines, ...data.reviews, ...data.complianceLogs,
      ...data.plans, ...data.planItems, ...data.conversations, ...data.messages, ...data.notifications,
    ].map((r) => r.id as string)
    expect(new Set(all).size).toBe(all.length)
    expect(new Set(data.reviews.map((r) => r.jobId)).size).toBe(data.reviews.length)
    expect(new Set(data.plans.map((p) => p.invoiceId)).size).toBe(data.plans.length)
    expect(new Set(data.planItems.map((p) => p.recurringJobId)).size).toBe(data.planItems.length)
    expect(new Set(data.vehicles.map((v) => v.technicianId)).size).toBe(data.vehicles.length)
  })

  it("dates the data around now: six months back, ten days ahead", () => {
    const times = data.jobs.map((j) => asDate(j.scheduledAt).getTime())
    expect(Math.min(...times)).toBeGreaterThanOrEqual(MORNING.getTime() - 182 * DAY)
    expect(Math.max(...times)).toBeLessThanOrEqual(MORNING.getTime() + 12 * DAY)
  })

  it("keeps job status consistent with the clock", () => {
    for (const j of data.jobs) {
      const at = asDate(j.scheduledAt).getTime()
      if (j.status === "completed") {
        expect(j.completedAt).toBeTruthy()
        expect(asDate(j.completedAt).getTime()).toBeLessThanOrEqual(MORNING.getTime())
        expect(asDate(j.completedAt).getTime()).toBeGreaterThanOrEqual(at)
        expect(j.summary).toBeTruthy()
      }
      if (j.status === "scheduled" || j.status === "pending") expect(at).toBeGreaterThan(MORNING.getTime() - 1)
      if (j.status === "in_progress") expect(at).toBeLessThanOrEqual(MORNING.getTime())
      if (j.status === "cancelled") expect(j.priority).toBe("normal")
      expect(asDate(j.createdAt).getTime()).toBeLessThanOrEqual(MORNING.getTime())
    }
  })

  it("puts a live day on the board at 10:30am: some done, some underway, some coming", () => {
    const start = new Date("2026-10-14T05:00:00Z").getTime() // local midnight
    const todays = data.jobs.filter((j) => asDate(j.scheduledAt).getTime() >= start && asDate(j.scheduledAt).getTime() < start + DAY)
    const statuses = new Set(todays.map((j) => j.status))
    for (const s of ["completed", "in_progress", "scheduled"]) expect(statuses.has(s)).toBe(true)
    expect(todays.filter((j) => j.status === "pending" && j.priority === "urgent")).toHaveLength(1)
  })

  it("shows an empty-of-active day as finished when built after hours", () => {
    const night = build(EVENING)
    const startOfDay = new Date("2026-10-13T05:00:00Z").getTime()
    const today = night.jobs.filter((j) => asDate(j.scheduledAt).getTime() >= startOfDay && asDate(j.scheduledAt).getTime() < startOfDay + DAY && j.technicianId)
    expect(today.length).toBeGreaterThan(0)
    expect(today.every((j) => j.status === "completed")).toBe(true)
  })

  it("schedules everything during business hours in the shop's timezone, never Sundays, even across a DST change", () => {
    for (const now of [MORNING, new Date("2026-11-03T17:00:00Z")]) {
      for (const j of build(now).jobs) {
        const { hour, weekday } = localParts(asDate(j.scheduledAt))
        expect(weekday).not.toBe("Sun")
        if (j.recurringJobId) continue // plan visits sit on their due date
        if (j.status === "pending" && j.priority === "urgent") continue // set from the clock
        expect(hour).toBeGreaterThanOrEqual(7)
        expect(hour).toBeLessThan(17)
      }
    }
  })

  it("matches invoices to jobs and invoice status to due dates", () => {
    const completed = data.jobs.filter((j) => j.status === "completed")
    const byJob = new Map<string, number>()
    for (const i of data.invoices) if (i.jobId) byJob.set(i.jobId as string, (byJob.get(i.jobId as string) ?? 0) + 1)
    for (const j of completed) expect(byJob.get(j.id as string)).toBe(1)
    for (const j of data.jobs.filter((x) => x.status !== "completed")) expect(byJob.has(j.id as string)).toBe(false)
    for (const i of data.invoices) {
      expect(i.amount as number).toBeGreaterThan(0)
      expect(["paid", "pending", "overdue"]).toContain(i.status)
      if (i.status === "overdue") expect(asDate(i.dueDate).getTime()).toBeLessThan(MORNING.getTime())
      if (i.status === "pending") expect(asDate(i.dueDate).getTime()).toBeGreaterThanOrEqual(MORNING.getTime())
    }
  })

  it("gives the revenue chart paid revenue in each of the last six months", () => {
    for (let back = 0; back < 6; back++) {
      const from = new Date(MORNING.getFullYear(), MORNING.getMonth() - back, 1).getTime()
      const to = new Date(MORNING.getFullYear(), MORNING.getMonth() - back + 1, 1).getTime()
      const paid = data.invoices.filter((i) => i.status === "paid" && asDate(i.issuedDate).getTime() >= from && asDate(i.issuedDate).getTime() < to)
      expect(paid.length).toBeGreaterThan(0)
    }
  })

  it("has maintenance coming due and recurring visits waiting for a truck", () => {
    const due = data.equipment.filter((e) => {
      const next = asDate(e.lastServicedAt).getTime() + (e.serviceIntervalMonths as number) * MONTH
      return next - MORNING.getTime() < 30 * DAY && next - MORNING.getTime() > -80 * DAY
    })
    expect(due.length).toBeGreaterThanOrEqual(5)
    const drafts = data.jobs.filter((j) => j.status === "pending" && j.recurringJobId)
    expect(drafts.length).toBeGreaterThanOrEqual(3)
    expect(drafts.every((j) => !j.technicianId)).toBe(true)
  })

  it("only logs compliance entries on completed jobs, with the right payload shapes", () => {
    const done = new Set(data.jobs.filter((j) => j.status === "completed").map((j) => j.id))
    for (const c of data.complianceLogs) {
      expect(done.has(c.jobId)).toBe(true)
      const p = c.payload as Record<string, unknown>
      if (c.type === "epa608_prompt") { expect(typeof p.refrigerantType).toBe("string"); expect(typeof p.certLevel).toBe("string") }
      else if (c.type === "safety_ack") expect(Array.isArray(p.items)).toBe(true)
      else if (c.type === "code_reminder") expect(Array.isArray(p.codes)).toBe(true)
      else throw new Error(`unexpected compliance type ${c.type}`)
    }
  })

  it("keeps customer-facing conversations tied to a customer and internal ones to none", () => {
    for (const c of data.conversations) {
      if (c.channel === "internal") expect(c.customerId ?? null).toBeNull()
      else expect(c.customerId).toBeTruthy()
    }
  })

  it("gives the hero customer a full story for the customer app", () => {
    const mine = data.jobs.filter((j) => j.customerId === data.heroCustomerId)
    expect(mine.some((j) => ["scheduled", "en_route", "in_progress"].includes(j.status as string))).toBe(true)
    const reviewed = new Set(data.reviews.map((r) => r.jobId))
    expect(mine.some((j) => j.status === "completed" && !reviewed.has(j.id as string))).toBe(true)
    expect(mine.some((j) => reviewed.has(j.id as string))).toBe(true)
    expect(data.conversations.some((c) => c.customerId === data.heroCustomerId && c.channel === "sms")).toBe(true)
    expect(data.plans.some((p) => p.customerId === data.heroCustomerId)).toBe(true)
    expect(data.invoices.some((i) => i.customerId === data.heroCustomerId && i.status === "pending")).toBe(true)
  })

  it("covers every estimate state and only prices lines from the pricebook", () => {
    const states = new Set(data.estimates.map((e) => e.status))
    for (const s of ["draft", "sent", "approved"]) expect(states.has(s as string)).toBe(true)
    const price = new Map(data.pricebook.map((p) => [p.id as string, p.unitPrice]))
    for (const l of data.estimateLines) expect(l.unitPrice).toBe(price.get(l.pricebookItemId as string))
  })

  it("leaves the technician who's off duty off duty, and gives the lead tech a login target", () => {
    expect(data.technicians.filter((t) => t.isOnDuty === false)).toHaveLength(1)
    expect(data.technicians.some((t) => t.id === data.leadTechnicianId)).toBe(true)
  })
})
