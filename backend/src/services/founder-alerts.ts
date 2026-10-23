import { prisma } from "../lib/prisma.js"
import { sendEmail } from "./email.js"
import { platformAdminEmails } from "../lib/platform-admin.js"
import { escapeHtml } from "../lib/escape-html.js"

export type FounderEvent =
  | { type: "signup"; company: string; ownerName: string; ownerEmail: string; plan: string }
  | { type: "trial_started"; company: string; plan: string; trialEndsAt?: Date | null }
  | { type: "subscribed"; company: string; plan: string }
  | { type: "plan_changed"; company: string; from: string; to: string }
  | { type: "cancelled"; company: string; plan: string }
  | { type: "payment_failed"; company: string; plan: string }
  | { type: "left_sandbox"; company: string }
  | { type: "first_customer"; company: string }
  | { type: "first_job"; company: string }

interface Message {
  subject: string
  headline: string
  details: Array<[label: string, value: string]>
}

const TIER_RANK: Record<string, number> = { starter: 1, shop: 2, fleet: 3, enterprise: 4 }
const day = (d: Date) => d.toISOString().slice(0, 10)

// Company names and emails are typed by strangers. They go into a subject line
// and an HTML body, so keep them to one line here and escape them below.
const oneLine = (s: string) => s.replace(/[\r\n\t]+/g, " ").trim().slice(0, 120)

export function describeEvent(e: FounderEvent): Message {
  const company = oneLine(e.company)
  switch (e.type) {
    case "signup":
      return {
        subject: `New signup: ${company} (${e.plan})`,
        headline: `${company} just signed up.`,
        details: [["Owner", `${oneLine(e.ownerName)} <${oneLine(e.ownerEmail)}>`], ["Chose", e.plan], ["Status", "In sandbox. A card is requested at checkout, so this is not paid yet."]],
      }
    case "trial_started":
      return {
        subject: `Card added: ${company} started a trial`,
        headline: `${company} added a card and started their trial.`,
        details: [["Plan", e.plan], ...(e.trialEndsAt ? [["Trial ends", day(e.trialEndsAt)] as [string, string]] : [])],
      }
    case "subscribed":
      return {
        subject: `Subscribed: ${company} (${e.plan})`,
        headline: `${company} started a paid subscription.`,
        details: [["Plan", e.plan]],
      }
    case "plan_changed": {
      const up = (TIER_RANK[e.to] ?? 0) > (TIER_RANK[e.from] ?? 0)
      return {
        subject: `${up ? "Upgrade" : "Downgrade"}: ${company} moved to ${e.to}`,
        headline: `${company} ${up ? "upgraded" : "downgraded"} from ${e.from} to ${e.to}.`,
        details: [["From", e.from], ["To", e.to]],
      }
    }
    case "cancelled":
      return {
        subject: `Cancelled: ${company}`,
        headline: `${company} cancelled their subscription.`,
        details: [["Was on", e.plan]],
      }
    case "payment_failed":
      return {
        subject: `Payment failed: ${company}`,
        headline: `A subscription payment failed for ${company}. Their access is paused until it's fixed.`,
        details: [["Plan", e.plan]],
      }
    case "left_sandbox":
      return {
        subject: `Out of sandbox: ${company} is using it for real`,
        headline: `${company} cleared the sample data and left sandbox mode.`,
        details: [["What it means", "They're done practicing and are setting up their own shop."]],
      }
    case "first_customer":
      return {
        subject: `First customer added: ${company}`,
        headline: `${company} added their first real customer.`,
        details: [],
      }
    case "first_job":
      return {
        subject: `First job created: ${company}`,
        headline: `${company} created their first real job.`,
        details: [],
      }
  }
}

function render(m: Message, link: string): string {
  const rows = m.details
    .map(([k, v]) => `<tr><td style="padding:4px 16px 4px 0;color:#666">${escapeHtml(k)}</td><td style="padding:4px 0">${escapeHtml(v)}</td></tr>`)
    .join("")
  return `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;color:#222;max-width:520px">
<p style="font-size:17px;margin:0 0 12px"><strong>${escapeHtml(m.headline)}</strong></p>
${rows ? `<table style="border-collapse:collapse;margin:0 0 16px">${rows}</table>` : ""}
<p style="margin:0"><a href="${escapeHtml(link)}">Open the accounts page</a></p>
</div>`
}

/**
 * Emails the platform admins about something happening on the product. Never
 * rejects: an alert failing must not break signup, billing or anything else
 * that triggers it. With no admins configured it does nothing.
 */
export async function notifyFounder(event: FounderEvent): Promise<void> {
  try {
    const to = platformAdminEmails()
    if (to.length === 0) return
    const message = describeEvent(event)
    const link = `${process.env.APP_URL ?? "http://localhost:5173"}/platform`
    const html = render(message, link)
    await Promise.all(
      to.map((address) =>
        sendEmail({ to: address, subject: `[Pneuros] ${message.subject}`, html }).catch((err: unknown) =>
          console.error("[founder-alerts] send failed:", err instanceof Error ? err.message : err),
        ),
      ),
    )
  } catch (err) {
    console.error("[founder-alerts] failed:", err instanceof Error ? err.message : err)
  }
}

/**
 * Alerts when a shop does something for the first time that shows they're
 * really using the product (not just clicking around sample data). Call it
 * right after creating the record; it counts the shop's real records and only
 * speaks up if what was just created is all there is.
 */
export async function alertIfFirstUse(organizationId: string, kind: "customer" | "job", justCreated = 1): Promise<void> {
  try {
    if (platformAdminEmails().length === 0) return
    const total =
      kind === "job"
        ? await prisma.job.count({ where: { organizationId, customer: { isSample: false } } })
        : await prisma.customer.count({ where: { organizationId, isSample: false } })
    if (total !== justCreated) return
    const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { name: true } })
    if (!org) return
    await notifyFounder({ type: kind === "job" ? "first_job" : "first_customer", company: org.name })
  } catch (err) {
    console.error("[founder-alerts] first-use check failed:", err instanceof Error ? err.message : err)
  }
}

/** Alerts that a shop left sandbox mode. Looks up the company name itself. */
export async function alertLeftSandbox(organizationId: string): Promise<void> {
  try {
    if (platformAdminEmails().length === 0) return
    const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { name: true } })
    if (!org) return
    await notifyFounder({ type: "left_sandbox", company: org.name })
  } catch (err) {
    console.error("[founder-alerts] left-sandbox alert failed:", err instanceof Error ? err.message : err)
  }
}
