import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    job: { count: vi.fn() },
    customer: { count: vi.fn() },
    organization: { findUnique: vi.fn() },
  },
}))
vi.mock("../services/email.js", () => ({ sendEmail: vi.fn() }))

import { prisma } from "../lib/prisma.js"
import { sendEmail } from "../services/email.js"
import { describeEvent, notifyFounder, alertIfFirstUse, alertLeftSandbox, type FounderEvent } from "../services/founder-alerts.js"

const ORIGINAL = process.env.PLATFORM_ADMIN_EMAILS
beforeEach(() => {
  vi.clearAllMocks()
  process.env.PLATFORM_ADMIN_EMAILS = "founder@pneuros.com"
  vi.mocked(sendEmail).mockResolvedValue(undefined)
  vi.mocked(prisma.organization.findUnique).mockResolvedValue({ name: "Cool Air LLC" } as never)
})
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.PLATFORM_ADMIN_EMAILS
  else process.env.PLATFORM_ADMIN_EMAILS = ORIGINAL
})

describe("describeEvent", () => {
  it("names the company and plan in a signup", () => {
    const m = describeEvent({ type: "signup", company: "Cool Air LLC", ownerName: "Bo", ownerEmail: "bo@cool.com", plan: "shop" })
    expect(m.subject).toBe("New signup: Cool Air LLC (shop)")
    expect(JSON.stringify(m.details)).toContain("bo@cool.com")
    expect(JSON.stringify(m.details)).toContain("not paid yet")
  })

  it("tells an upgrade from a downgrade", () => {
    expect(describeEvent({ type: "plan_changed", company: "A", from: "shop", to: "fleet" }).subject).toBe("Upgrade: A moved to fleet")
    expect(describeEvent({ type: "plan_changed", company: "A", from: "fleet", to: "starter" }).subject).toBe("Downgrade: A moved to starter")
  })

  it("covers every event type with a subject that names the company", () => {
    const events: FounderEvent[] = [
      { type: "signup", company: "Zed", ownerName: "o", ownerEmail: "o@z.com", plan: "shop" },
      { type: "trial_started", company: "Zed", plan: "shop", trialEndsAt: new Date("2026-11-20T00:00:00Z") },
      { type: "subscribed", company: "Zed", plan: "shop" },
      { type: "plan_changed", company: "Zed", from: "shop", to: "fleet" },
      { type: "cancelled", company: "Zed", plan: "shop" },
      { type: "payment_failed", company: "Zed", plan: "shop" },
      { type: "left_sandbox", company: "Zed" },
      { type: "first_customer", company: "Zed" },
      { type: "first_job", company: "Zed" },
    ]
    for (const e of events) {
      const m = describeEvent(e)
      expect(m.subject).toContain("Zed")
      expect(m.headline.length).toBeGreaterThan(10)
    }
    expect(describeEvent(events[1]).details).toContainEqual(["Trial ends", "2026-11-20"])
  })

  it("keeps a stranger's company name to one line", () => {
    const m = describeEvent({ type: "first_job", company: "Evil\r\nBcc: attacker@x.com" })
    expect(m.subject).not.toMatch(/[\r\n]/)
  })
})

describe("notifyFounder", () => {
  const event: FounderEvent = { type: "signup", company: "Cool Air LLC", ownerName: "Bo", ownerEmail: "bo@cool.com", plan: "shop" }

  it("emails each platform admin with a [Pneuros] subject and a link to /platform", async () => {
    process.env.PLATFORM_ADMIN_EMAILS = "founder@pneuros.com, partner@pneuros.com"
    await notifyFounder(event)
    expect(sendEmail).toHaveBeenCalledTimes(2)
    const first = vi.mocked(sendEmail).mock.calls[0][0]
    expect([first.to, vi.mocked(sendEmail).mock.calls[1][0].to]).toEqual(["founder@pneuros.com", "partner@pneuros.com"])
    expect(first.subject).toBe("[Pneuros] New signup: Cool Air LLC (shop)")
    expect(first.html).toContain("/platform")
  })

  it("does nothing when no admins are configured", async () => {
    delete process.env.PLATFORM_ADMIN_EMAILS
    await notifyFounder(event)
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it("escapes HTML in names that strangers typed", async () => {
    await notifyFounder({ type: "signup", company: "<script>alert(1)</script>", ownerName: "<b>x</b>", ownerEmail: "a@b.com", plan: "shop" })
    const html = vi.mocked(sendEmail).mock.calls[0][0].html
    expect(html).not.toContain("<script>")
    expect(html).not.toContain("<b>x</b>")
    expect(html).toContain("&lt;script&gt;")
  })

  it("never rejects when the email provider fails", async () => {
    vi.mocked(sendEmail).mockRejectedValue(new Error("resend down"))
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    await expect(notifyFounder(event)).resolves.toBeUndefined()
    spy.mockRestore()
  })

  it("one admin's failed send doesn't stop the others", async () => {
    process.env.PLATFORM_ADMIN_EMAILS = "a@pneuros.com,b@pneuros.com"
    vi.mocked(sendEmail).mockRejectedValueOnce(new Error("bounce")).mockResolvedValue(undefined)
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    await notifyFounder(event)
    expect(sendEmail).toHaveBeenCalledTimes(2)
    spy.mockRestore()
  })
})

describe("alertIfFirstUse", () => {
  it("alerts when the first real job was just created", async () => {
    vi.mocked(prisma.job.count).mockResolvedValue(1)
    await alertIfFirstUse("org-1", "job")
    expect(sendEmail).toHaveBeenCalledTimes(1)
    expect(vi.mocked(sendEmail).mock.calls[0][0].subject).toContain("First job created: Cool Air LLC")
    // sample data must not count as use
    expect(vi.mocked(prisma.job.count).mock.calls[0][0]).toEqual({ where: { organizationId: "org-1", customer: { isSample: false } } })
  })

  it("stays quiet once the shop already has real jobs", async () => {
    vi.mocked(prisma.job.count).mockResolvedValue(2)
    await alertIfFirstUse("org-1", "job")
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it("alerts for the first customer, counting only non-sample customers", async () => {
    vi.mocked(prisma.customer.count).mockResolvedValue(1)
    await alertIfFirstUse("org-1", "customer")
    expect(vi.mocked(sendEmail).mock.calls[0][0].subject).toContain("First customer added")
    expect(vi.mocked(prisma.customer.count).mock.calls[0][0]).toEqual({ where: { organizationId: "org-1", isSample: false } })
  })

  it("treats a first bulk import as a first customer, but not a later one", async () => {
    vi.mocked(prisma.customer.count).mockResolvedValue(40)
    await alertIfFirstUse("org-1", "customer", 40)
    expect(sendEmail).toHaveBeenCalledTimes(1)

    vi.mocked(sendEmail).mockClear()
    vi.mocked(prisma.customer.count).mockResolvedValue(55)
    await alertIfFirstUse("org-1", "customer", 40)
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it("doesn't even query when no admins are configured", async () => {
    delete process.env.PLATFORM_ADMIN_EMAILS
    await alertIfFirstUse("org-1", "job")
    expect(prisma.job.count).not.toHaveBeenCalled()
  })

  it("never rejects if the database fails", async () => {
    vi.mocked(prisma.job.count).mockRejectedValue(new Error("db"))
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    await expect(alertIfFirstUse("org-1", "job")).resolves.toBeUndefined()
    expect(sendEmail).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})

describe("alertLeftSandbox", () => {
  it("names the shop that left sandbox", async () => {
    await alertLeftSandbox("org-1")
    expect(vi.mocked(sendEmail).mock.calls[0][0].subject).toContain("Out of sandbox: Cool Air LLC")
  })

  it("does nothing if the organization can't be found", async () => {
    vi.mocked(prisma.organization.findUnique).mockResolvedValue(null)
    await alertLeftSandbox("gone")
    expect(sendEmail).not.toHaveBeenCalled()
  })
})
