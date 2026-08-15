import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    job: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}))

vi.mock("twilio", () => ({
  default: vi.fn(function () {
    return {
      messages: { create: vi.fn().mockResolvedValue({ sid: "SM123" }) },
    }
  }),
}))

vi.mock("../services/email.js", () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
}))

import { prisma } from "../lib/prisma.js"
import { sendEmail } from "../services/email.js"
import { runReminderSchedule } from "../services/reminder-scheduler.js"

const mockPrisma = prisma as unknown as {
  job: { findMany: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> }
}

function makeJob(overrides: Partial<{
  id: string
  phone: string | null
  email: string | null
  smsOptOut: boolean
  emailOptOut: boolean
  orgSmsEnabled: boolean
}> = {}) {
  const {
    id = "job1", phone = "+15550001234", email = "alice@example.com",
    smsOptOut = false, emailOptOut = false, orgSmsEnabled = true,
  } = overrides
  return {
    id,
    scheduledAt: new Date(Date.now() + 24.5 * 60 * 60 * 1000),
    reminder24hSentAt: null,
    reminder2hSentAt: null,
    customer: { phone, email, smsOptOut, emailOptOut },
    organization: { name: "ACME HVAC", smsEnabled: orgSmsEnabled },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.TWILIO_ACCOUNT_SID = "AC123"
  process.env.TWILIO_AUTH_TOKEN = "tok"
  process.env.TWILIO_FROM_NUMBER = "+15550000000"
  mockPrisma.job.update.mockResolvedValue({})
})

describe("runReminderSchedule — 24h window", () => {
  it("sends email for eligible job and marks reminder sent", async () => {
    mockPrisma.job.findMany
      .mockResolvedValueOnce([makeJob()])  // 24h jobs
      .mockResolvedValueOnce([])           // 2h jobs
    await runReminderSchedule()
    expect(mockPrisma.job.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ reminder24hSentAt: expect.any(Date) }) })
    )
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ subject: "Service appointment reminder" }))
  })

  it("queries with reminder24hSentAt: null filter", async () => {
    mockPrisma.job.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
    await runReminderSchedule()
    const call24h = mockPrisma.job.findMany.mock.calls[0][0]
    expect(call24h.where.reminder24hSentAt).toBe(null)
  })
})

describe("runReminderSchedule — 2h window", () => {
  it("sends 2h reminder for eligible job", async () => {
    mockPrisma.job.findMany
      .mockResolvedValueOnce([])  // 24h jobs
      .mockResolvedValueOnce([makeJob()])  // 2h jobs
    await runReminderSchedule()
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ subject: "Your technician is arriving soon" }))
    expect(mockPrisma.job.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ reminder2hSentAt: expect.any(Date) }) })
    )
  })
})

describe("runReminderSchedule — opt-out guards", () => {
  it("skips email when customer has emailOptOut", async () => {
    mockPrisma.job.findMany
      .mockResolvedValueOnce([makeJob({ emailOptOut: true })])
      .mockResolvedValueOnce([])
    await runReminderSchedule()
    expect(sendEmail).not.toHaveBeenCalled()
  })
})
