import twilio from "twilio"
import { prisma } from "../lib/prisma.js"
import { sendEmail } from "./email.js"

const E164 = /^\+[1-9]\d{7,14}$/

function getClient() {
  const s = process.env.TWILIO_ACCOUNT_SID
  const t = process.env.TWILIO_AUTH_TOKEN
  const f = process.env.TWILIO_FROM_NUMBER
  if (!s || !t || !f) return null
  return { client: twilio(s, t), from: f }
}

async function sendReminderSms(
  job: { id: string; scheduledAt: Date; customer: { phone: string | null; smsOptOut: boolean }; organization: { name: string; smsEnabled: boolean } },
  window: "24h" | "2h",
): Promise<void> {
  const creds = getClient()
  if (!creds) return
  if (!job.organization.smsEnabled) return
  if (job.customer.smsOptOut) return
  const phone = job.customer.phone
  if (!phone || !E164.test(phone)) return

  const time = new Date(job.scheduledAt).toLocaleString("en-US", {
    weekday: "short", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
  })
  const message = window === "24h"
    ? `Reminder: your service appointment is scheduled for ${time}.`
    : "Reminder: your technician will arrive in about 2 hours."

  const body = `[${job.organization.name}] ${message} Reply STOP to opt out.`
  try {
    await creds.client.messages.create({ to: phone, from: creds.from, body })
    console.log(`[Reminders] SMS ${window} sent to ${phone}`)
  } catch (err) {
    console.error(`[Reminders] SMS ${window} failed:`, err)
  }
}

async function sendReminderEmail(
  job: { scheduledAt: Date; customer: { email: string | null; emailOptOut: boolean }; organization: { name: string } },
  window: "24h" | "2h",
): Promise<void> {
  if (!job.customer.email || job.customer.emailOptOut) return
  const time = new Date(job.scheduledAt).toLocaleString("en-US", {
    weekday: "short", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
  })
  if (window === "24h") {
    await sendEmail({
      to: job.customer.email,
      subject: "Service appointment reminder",
      html: `<p>This is a reminder that your service appointment is scheduled for <strong>${time}</strong>. We look forward to seeing you!</p>`,
    })
  } else {
    await sendEmail({
      to: job.customer.email,
      subject: "Your technician is arriving soon",
      html: `<p>Your technician will arrive in approximately 2 hours for your service appointment today at <strong>${time}</strong>.</p>`,
    })
  }
}

export async function runReminderSchedule(): Promise<void> {
  const now = new Date()
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  const in25h = new Date(now.getTime() + 25 * 60 * 60 * 1000)
  const in2h = new Date(now.getTime() + 2 * 60 * 60 * 1000)
  const in2h30 = new Date(now.getTime() + (2 * 60 + 30) * 60 * 1000)

  const jobs24h = await prisma.job.findMany({
    where: {
      status: { in: ["pending", "scheduled"] },
      scheduledAt: { gte: in24h, lte: in25h },
      reminder24hSentAt: null,
    },
    select: {
      id: true,
      scheduledAt: true,
      reminder24hSentAt: true,
      reminder2hSentAt: true,
      customer: { select: { phone: true, email: true, smsOptOut: true, emailOptOut: true } },
      organization: { select: { name: true, smsEnabled: true } },
    },
  })

  for (const job of jobs24h) {
    await sendReminderSms(job, "24h")
    await sendReminderEmail(job, "24h")
    await prisma.job.update({ where: { id: job.id }, data: { reminder24hSentAt: new Date() } })
  }

  const jobs2h = await prisma.job.findMany({
    where: {
      status: { in: ["pending", "scheduled"] },
      scheduledAt: { gte: in2h, lte: in2h30 },
      reminder2hSentAt: null,
    },
    select: {
      id: true,
      scheduledAt: true,
      reminder24hSentAt: true,
      reminder2hSentAt: true,
      customer: { select: { phone: true, email: true, smsOptOut: true, emailOptOut: true } },
      organization: { select: { name: true, smsEnabled: true } },
    },
  })

  for (const job of jobs2h) {
    await sendReminderSms(job, "2h")
    await sendReminderEmail(job, "2h")
    await prisma.job.update({ where: { id: job.id }, data: { reminder2hSentAt: new Date() } })
  }

  console.log(`[Reminders] Checked: ${jobs24h.length} 24h + ${jobs2h.length} 2h reminders sent`)
}
