import { describe, it, expect, vi, beforeEach } from "vitest"
import request from "supertest"
import express from "express"

vi.mock("twilio", () => ({
  default: {
    validateRequest: vi.fn(),
  },
}))

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    customer: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}))

import twilio from "twilio"
import { prisma } from "../lib/prisma.js"
import { twilioWebhookRouter } from "../routes/twilio-webhook.js"

function makeApp() {
  const app = express()
  app.use(express.urlencoded({ extended: false }))
  app.use("/", twilioWebhookRouter)
  return app
}

const app = makeApp()

describe("POST /webhooks/twilio", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv("TWILIO_AUTH_TOKEN", "token123")
    vi.stubEnv("API_URL", "https://api.test")
    ;(twilio.validateRequest as any).mockReturnValue(true)
    ;(prisma.customer.findFirst as any).mockResolvedValue({ id: "cust-1", smsOptOut: false })
    ;(prisma.customer.update as any).mockResolvedValue({})
  })

  it("returns 403 when signature is invalid", async () => {
    ;(twilio.validateRequest as any).mockReturnValue(false)
    const res = await request(app)
      .post("/")
      .type("form")
      .send({ SmsStatus: "failed", ErrorCode: "21610", To: "+15551234567" })
    expect(res.status).toBe(403)
  })

  it("sets smsOptOut=true on error code 21610", async () => {
    const res = await request(app)
      .post("/")
      .type("form")
      .send({ SmsStatus: "failed", ErrorCode: "21610", To: "+15551234567" })
    expect(res.status).toBe(200)
    expect(prisma.customer.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { smsOptOut: true } })
    )
    expect(res.text).toContain("<Response")
  })

  it("clears smsOptOut=false on UNSTOP", async () => {
    const res = await request(app)
      .post("/")
      .type("form")
      .send({ SmsStatus: "received", Body: "UNSTOP", From: "+15551234567" })
    expect(res.status).toBe(200)
    expect(prisma.customer.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { smsOptOut: false } })
    )
  })

  it("returns 200 and empty TwiML for unhandled events", async () => {
    const res = await request(app)
      .post("/")
      .type("form")
      .send({ SmsStatus: "delivered", To: "+15551234567" })
    expect(res.status).toBe(200)
    expect(res.text).toContain("<Response")
    expect(prisma.customer.update).not.toHaveBeenCalled()
  })

  it("returns 200 even when customer not found", async () => {
    ;(prisma.customer.findFirst as any).mockResolvedValue(null)
    const res = await request(app)
      .post("/")
      .type("form")
      .send({ SmsStatus: "failed", ErrorCode: "21610", To: "+15551234567" })
    expect(res.status).toBe(200)
    expect(prisma.customer.update).not.toHaveBeenCalled()
  })
})
