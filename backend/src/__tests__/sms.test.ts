import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

vi.mock("twilio", () => {
  const createMock = vi.fn().mockResolvedValue({ sid: "SM123" })
  function MockTwilio(this: any) {
    return { messages: { create: createMock } }
  }
  (MockTwilio as any).createMock = createMock
  return { default: MockTwilio }
})

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    job: { findUnique: vi.fn() },
    estimate: { findUnique: vi.fn() },
    customer: { findFirst: vi.fn(), update: vi.fn() },
  },
}))

import { prisma } from "../lib/prisma.js"
import twilio from "twilio"

const BASE_JOB = {
  id: "job-1",
  scheduledAt: new Date("2026-07-20T14:00:00Z"),
  organizationId: "org-1",
  customerId: "cust-1",
  customer: { phone: "+15551234567", smsOptOut: false, name: "Alice" },
  organization: { name: "Acme HVAC", smsEnabled: true },
}

describe("SMS service", () => {
  beforeEach(() => {
    vi.stubEnv("TWILIO_ACCOUNT_SID", "ACtest")
    vi.stubEnv("TWILIO_AUTH_TOKEN", "token123")
    vi.stubEnv("TWILIO_FROM_NUMBER", "+15550000000")
    vi.stubEnv("API_URL", "https://api.test")
    ;(prisma.job.findUnique as any).mockResolvedValue(BASE_JOB)
    ;(twilio as any).createMock.mockClear()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  describe("sendBookingConfirmedSms", () => {
    it("sends SMS on happy path", async () => {
      const { sendBookingConfirmedSms } = await import("../services/sms.js")
      await sendBookingConfirmedSms("job-1")
      expect((twilio as any).createMock).toHaveBeenCalledOnce()
      const call = (twilio as any).createMock.mock.calls[0][0]
      expect(call.to).toBe("+15551234567")
      expect(call.from).toBe("+15550000000")
      expect(call.body).toContain("[Acme HVAC]")
      expect(call.body).toContain("Reply STOP")
    })

    it("skips when smsEnabled is false", async () => {
      ;(prisma.job.findUnique as any).mockResolvedValue({
        ...BASE_JOB, organization: { ...BASE_JOB.organization, smsEnabled: false },
      })
      const { sendBookingConfirmedSms } = await import("../services/sms.js")
      await sendBookingConfirmedSms("job-1")
      expect((twilio as any).createMock).not.toHaveBeenCalled()
    })

    it("skips when customer phone is absent", async () => {
      ;(prisma.job.findUnique as any).mockResolvedValue({
        ...BASE_JOB, customer: { ...BASE_JOB.customer, phone: null },
      })
      const { sendBookingConfirmedSms } = await import("../services/sms.js")
      await sendBookingConfirmedSms("job-1")
      expect((twilio as any).createMock).not.toHaveBeenCalled()
    })

    it("skips when phone is not E.164", async () => {
      ;(prisma.job.findUnique as any).mockResolvedValue({
        ...BASE_JOB, customer: { ...BASE_JOB.customer, phone: "555-1234" },
      })
      const { sendBookingConfirmedSms } = await import("../services/sms.js")
      await sendBookingConfirmedSms("job-1")
      expect((twilio as any).createMock).not.toHaveBeenCalled()
    })

    it("skips when customer has opted out", async () => {
      ;(prisma.job.findUnique as any).mockResolvedValue({
        ...BASE_JOB, customer: { ...BASE_JOB.customer, smsOptOut: true },
      })
      const { sendBookingConfirmedSms } = await import("../services/sms.js")
      await sendBookingConfirmedSms("job-1")
      expect((twilio as any).createMock).not.toHaveBeenCalled()
    })

    it("skips when TWILIO_ACCOUNT_SID is missing", async () => {
      vi.unstubAllEnvs()
      vi.stubEnv("TWILIO_AUTH_TOKEN", "token123")
      vi.stubEnv("TWILIO_FROM_NUMBER", "+15550000000")
      const { sendBookingConfirmedSms } = await import("../services/sms.js")
      await sendBookingConfirmedSms("job-1")
      expect((twilio as any).createMock).not.toHaveBeenCalled()
    })
  })

  describe("sendEnRouteSms", () => {
    it("sends en-route SMS", async () => {
      const { sendEnRouteSms } = await import("../services/sms.js")
      await sendEnRouteSms("job-1")
      const body = (twilio as any).createMock.mock.calls[0][0].body
      expect(body).toContain("on the way")
    })
  })

  describe("sendJobCompletedSms", () => {
    it("sends completion SMS", async () => {
      const { sendJobCompletedSms } = await import("../services/sms.js")
      await sendJobCompletedSms("job-1")
      const body = (twilio as any).createMock.mock.calls[0][0].body
      expect(body).toContain("complete")
    })
  })

  describe("sendEstimateReadySms", () => {
    it("sends estimate SMS with portal URL", async () => {
      ;(prisma.estimate.findUnique as any).mockResolvedValue({
        id: "est-1",
        token: "tok-abc",
        organizationId: "org-1",
        job: { customer: { phone: "+15551234567", smsOptOut: false } },
        organization: { name: "Acme HVAC", smsEnabled: true },
      })
      vi.stubEnv("FRONTEND_URL", "https://app.test")
      const { sendEstimateReadySms } = await import("../services/sms.js")
      await sendEstimateReadySms("est-1")
      const body = (twilio as any).createMock.mock.calls[0][0].body
      expect(body).toContain("https://app.test/customer/estimates/tok-abc")
    })
  })
})
