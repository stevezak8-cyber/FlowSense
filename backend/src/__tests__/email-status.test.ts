import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(function () {
    return { emails: { send: vi.fn().mockResolvedValue({ id: "mock-id" }) } }
  }),
}))

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    job: { findUnique: vi.fn() },
  },
}))

import { prisma } from "../lib/prisma.js"
import { sendEnRouteEmail, sendJobInProgressEmail, sendJobCompletedEmail } from "../services/email.js"

const mockPrisma = prisma as unknown as {
  job: { findUnique: ReturnType<typeof vi.fn> }
}

function makeJob(overrides: Partial<{ customerEmail: string | null; emailOptOut: boolean; orgName: string }> = {}) {
  const { customerEmail = "alice@example.com", emailOptOut = false, orgName = "ACME HVAC" } = overrides
  return {
    id: "job1",
    status: "en_route",
    customer: { email: customerEmail, emailOptOut },
    organization: { name: orgName },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.RESEND_API_KEY = "test-key"
})

describe("sendEnRouteEmail", () => {
  it("skips customer with emailOptOut: true", async () => {
    mockPrisma.job.findUnique.mockResolvedValue(makeJob({ emailOptOut: true }))
    await sendEnRouteEmail("job1")
    const { Resend } = await import("resend")
    expect((Resend as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0)
  })

  it("skips customer with no email", async () => {
    mockPrisma.job.findUnique.mockResolvedValue(makeJob({ customerEmail: null }))
    await sendEnRouteEmail("job1")
    const { Resend } = await import("resend")
    expect((Resend as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0)
  })
})

describe("sendJobCompletedEmail", () => {
  it("sends email when customer has email and is not opted out", async () => {
    mockPrisma.job.findUnique.mockResolvedValue({ ...makeJob(), status: "completed" })
    await sendJobCompletedEmail("job1")
    const { Resend } = await import("resend")
    const instance = (Resend as ReturnType<typeof vi.fn>).mock.results[0]?.value
    expect(instance?.emails.send).toHaveBeenCalled()
  })
})
