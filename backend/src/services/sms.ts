import twilio from "twilio"
import { prisma } from "../lib/prisma.js"

function getClient() {
  const s = process.env.TWILIO_ACCOUNT_SID
  const t = process.env.TWILIO_AUTH_TOKEN
  const f = process.env.TWILIO_FROM_NUMBER
  if (!s || !t || !f) return null
  return { client: twilio(s, t), from: f }
}

const E164 = /^\+[1-9]\d{7,14}$/

function isValidPhone(phone: string | null | undefined): phone is string {
  return !!phone && E164.test(phone)
}

async function send(to: string, fromNum: string, orgName: string, message: string, client: ReturnType<typeof twilio>): Promise<void> {
  const body = `[${orgName}] ${message} Reply STOP to opt out.`
  try {
    await client.messages.create({
      to,
      from: fromNum,
      body,
      statusCallback: `${process.env.API_URL ?? ""}/api/webhooks/twilio`,
    })
    console.log(`[SMS] Sent to ${to}: ${body.slice(0, 60)}…`)
  } catch (err) {
    console.error("[SMS] Failed to send:", err)
  }
}

export async function sendBookingConfirmedSms(jobId: string): Promise<void> {
  const creds = getClient()
  if (!creds) return
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: {
      customer: { select: { phone: true, smsOptOut: true } },
      organization: { select: { name: true, smsEnabled: true } },
    },
  })
  if (!job) return
  if (!job.organization.smsEnabled) return
  if (!isValidPhone(job.customer?.phone)) {
    if (job.customer?.phone) console.warn(`[SMS] Invalid phone for job ${jobId}: ${job.customer.phone}`)
    return
  }
  if (job.customer.smsOptOut) return
  const date = job.scheduledAt
    ? new Date(job.scheduledAt).toLocaleDateString("en-US", {
        weekday: "long", month: "long", day: "numeric",
        hour: "numeric", minute: "2-digit",
      })
    : "your scheduled time"
  await send(job.customer.phone, creds.from, job.organization.name,
    `Your service appointment has been scheduled for ${date}.`, creds.client)
}

export async function sendEnRouteSms(jobId: string): Promise<void> {
  const creds = getClient()
  if (!creds) return
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: {
      customer: { select: { phone: true, smsOptOut: true } },
      organization: { select: { name: true, smsEnabled: true } },
    },
  })
  if (!job) return
  if (!job.organization.smsEnabled) return
  if (!isValidPhone(job.customer?.phone)) {
    if (job.customer?.phone) console.warn(`[SMS] Invalid phone for job ${jobId}: ${job.customer.phone}`)
    return
  }
  if (job.customer.smsOptOut) return
  await send(job.customer.phone, creds.from, job.organization.name,
    "Your technician is on the way and should arrive within the hour.", creds.client)
}

export async function sendJobCompletedSms(jobId: string): Promise<void> {
  const creds = getClient()
  if (!creds) return
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: {
      customer: { select: { phone: true, smsOptOut: true } },
      organization: { select: { name: true, smsEnabled: true } },
    },
  })
  if (!job) return
  if (!job.organization.smsEnabled) return
  if (!isValidPhone(job.customer?.phone)) {
    if (job.customer?.phone) console.warn(`[SMS] Invalid phone for job ${jobId}: ${job.customer.phone}`)
    return
  }
  if (job.customer.smsOptOut) return
  await send(job.customer.phone, creds.from, job.organization.name,
    "Your service is complete. Thank you for choosing us!", creds.client)
}

export async function sendEstimateReadySms(estimateId: string): Promise<void> {
  const creds = getClient()
  if (!creds) return
  const estimate = await prisma.estimate.findUnique({
    where: { id: estimateId },
    include: {
      job: { include: { customer: { select: { phone: true, smsOptOut: true } } } },
      organization: { select: { name: true, smsEnabled: true } },
    },
  })
  if (!estimate) return
  if (!estimate.organization.smsEnabled) return
  const customer = estimate.job.customer
  if (!isValidPhone(customer?.phone)) {
    if (customer?.phone) console.warn(`[SMS] Invalid phone for estimate ${estimateId}: ${customer.phone}`)
    return
  }
  if (customer.smsOptOut) return
  const portalUrl = `${process.env.FRONTEND_URL ?? ""}/customer/estimates/${estimate.token}`
  await send(customer.phone, creds.from, estimate.organization.name,
    `Your estimate is ready to review: ${portalUrl}`, creds.client)
}
