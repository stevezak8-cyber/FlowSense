import { Router, type Request, type Response } from "express"
import twilio from "twilio"
import { prisma } from "../lib/prisma.js"

export const twilioWebhookRouter = Router()

twilioWebhookRouter.post("/", async (req: Request, res: Response) => {
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const apiUrl = process.env.API_URL

  if (authToken) {
    const signature = (req.headers["x-twilio-signature"] as string) ?? ""
    const webhookUrl = apiUrl
      ? `${apiUrl}/api/webhooks/twilio`
      : `${req.protocol}://${req.get("host")}${req.originalUrl}`
    const valid = twilio.validateRequest(
      authToken,
      signature,
      webhookUrl,
      req.body as Record<string, string>
    )
    if (!valid) {
      return res.status(403).send("Forbidden")
    }
  }

  const { SmsStatus, ErrorCode, To, From, Body } = req.body as Record<string, string>

  try {
    // Opt-out: delivery failed with error 21610 (recipient replied STOP)
    // `To` is the customer's number on outbound delivery events
    if (SmsStatus === "failed" && ErrorCode === "21610" && To) {
      const customer = await prisma.customer.findFirst({ where: { phone: To } })
      if (customer) {
        await prisma.customer.update({ where: { id: customer.id }, data: { smsOptOut: true } })
        console.log(`[SMS] Opt-out recorded for ${To}`)
      } else {
        console.warn(`[SMS] Opt-out received for unknown number: ${To}`)
      }
    }

    // UNSTOP: customer re-opted in
    // `From` is the customer's number on inbound messages
    if (SmsStatus === "received" && Body?.trim().toUpperCase() === "UNSTOP" && From) {
      const customer = await prisma.customer.findFirst({ where: { phone: From } })
      if (customer) {
        await prisma.customer.update({ where: { id: customer.id }, data: { smsOptOut: false } })
        console.log(`[SMS] Opt-in restored for ${From}`)
      }
    }
  } catch (err) {
    console.error("[SMS] Webhook processing error:", err)
    // Always return 200 to prevent Twilio retries
  }

  res.set("Content-Type", "text/xml").status(200).send("<Response/>")
})
