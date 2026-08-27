import { Router, type Request, type Response } from "express"
import twilio from "twilio"
import { prisma } from "../lib/prisma.js"

export const twilioWebhookRouter = Router()

twilioWebhookRouter.post("/", async (req: Request, res: Response) => {
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const apiUrl = process.env.API_URL

  if (!authToken) {
    console.error("[SMS] TWILIO_AUTH_TOKEN not configured — rejecting webhook")
    return res.status(403).send("Forbidden")
  }

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
    if (SmsStatus === "received" && Body?.trim().toUpperCase() === "UNSTOP" && From) {
      const customer = await prisma.customer.findFirst({ where: { phone: From } })
      if (customer) {
        await prisma.customer.update({ where: { id: customer.id }, data: { smsOptOut: false } })
        console.log(`[SMS] Opt-in restored for ${From}`)
      }
    }

    // Inbound SMS — store as conversation message
    if (SmsStatus === "received" && From && Body && Body.trim().toUpperCase() !== "UNSTOP") {
      const customer = await prisma.customer.findFirst({ where: { phone: From } })
      if (customer) {
        // Find or create an SMS conversation for this customer
        let conversation = await prisma.conversation.findFirst({
          where: {
            organizationId: customer.organizationId,
            channel: "sms",
            subject: { contains: customer.id },
          },
        })
        if (!conversation) {
          conversation = await prisma.conversation.create({
            data: {
              organizationId: customer.organizationId,
              subject: `SMS — ${customer.name} (${customer.id})`,
              channel: "sms",
              participants: [],
              lastMessageAt: new Date(),
              unreadCount: 1,
            },
          })
        }
        await prisma.message.create({
          data: {
            conversationId: conversation.id,
            sender: customer.name,
            senderRole: "customer",
            content: Body.trim(),
          },
        })
        await prisma.conversation.update({
          where: { id: conversation.id },
          data: { lastMessageAt: new Date(), unreadCount: { increment: 1 } },
        })
        console.log(`[SMS] Inbound message from ${customer.name} stored in conversation ${conversation.id}`)
      } else {
        console.warn(`[SMS] Inbound from unknown number: ${From}`)
      }
    }
  } catch (err) {
    console.error("[SMS] Webhook processing error:", err)
    // Always return 200 to prevent Twilio retries
  }

  res.set("Content-Type", "text/xml").status(200).send("<Response/>")
})
