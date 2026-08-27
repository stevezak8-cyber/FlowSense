/**
 * org-notifications.ts
 *
 * Sends email notifications to an org's dispatch address when job events occur.
 * Respects the org's notificationPreferences settings.
 * All sends are fire-and-forget — errors are logged but never thrown.
 */

import { prisma } from "../lib/prisma.js";
import { sendEmail } from "./email.js";
import { escapeHtml } from "../lib/escape-html.js";
import twilio from "twilio";

interface JobSummary {
  id: string;
  status: string;
  priority?: string;
  equipmentType: string | null;
  serviceType?: string | null;
  symptomSummary?: string | null;
  scheduledAt?: Date | string;
  completedAt?: Date | null;
  customer: { name: string; address: string };
  technician: { name: string } | null;
}

interface NotificationPreferences {
  booking?: boolean;
  statusChange?: boolean;
  completion?: boolean;
  urgent?: boolean;
}

async function getOrgDispatch(organizationId: string): Promise<{
  email: string | null;
  prefs: NotificationPreferences;
}> {
  try {
    // Cast to any to work around local Prisma client not yet knowing about the
    // new fields added in migration 20250508000000_add_org_contact_fields.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const org = await (prisma.organization.findUnique as any)({
      where: { id: organizationId },
      select: { email: true, notificationPreferences: true },
    }) as { email: string | null; notificationPreferences: NotificationPreferences | null } | null;
    return {
      email: org?.email ?? null,
      prefs: org?.notificationPreferences ?? {
        booking: true,
        statusChange: true,
        completion: true,
        urgent: true,
      },
    };
  } catch {
    return { email: null, prefs: {} };
  }
}

function fmt(date: Date | string | null | undefined): string {
  if (!date) return "—";
  return new Date(date).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function jobCard(job: JobSummary): string {
  const rows = [
    ["Customer", escapeHtml(job.customer.name)],
    ["Address", escapeHtml(job.customer.address)],
    ...(job.technician ? [["Technician", escapeHtml(job.technician.name)]] : []),
    ...(job.equipmentType ? [["Equipment", escapeHtml(job.equipmentType)]] : []),
    ...(job.serviceType ? [["Service type", escapeHtml(job.serviceType)]] : []),
    ...(job.symptomSummary ? [["Issue", escapeHtml(job.symptomSummary)]] : []),
    ["Reference", escapeHtml(job.id.slice(0, 12))],
  ] as [string, string][];

  return `
    <div style="background:#f5f5f5;padding:16px;border-radius:8px;margin:16px 0;">
      ${rows.map(([k, v]) => `<p style="margin:4px 0;"><strong>${k}:</strong> ${v}</p>`).join("")}
    </div>
  `;
}

function wrap(title: string, body: string): string {
  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
      <h2 style="color:#1a1a1a;">${title}</h2>
      ${body}
      <p style="color:#888;font-size:13px;margin-top:24px;">— Pneuros</p>
    </div>
  `;
}

/** Call after a new job is created. */
export async function notifyOrgNewBooking(
  organizationId: string,
  job: JobSummary
): Promise<void> {
  const { email, prefs } = await getOrgDispatch(organizationId);
  if (!email) return;

  const isUrgent = job.priority === "urgent";

  // booking notification
  if (prefs.booking !== false) {
    sendEmail({
      to: email,
      subject: `Pneuros: New booking — ${job.customer.name}`,
      html: wrap(
        "New Service Booking",
        `<p>A new job has been booked${isUrgent ? ' <strong style="color:#c0392b;">[URGENT]</strong>' : ""}.</p>
         <p><strong>Scheduled:</strong> ${fmt(job.scheduledAt)}</p>
         ${jobCard(job)}`
      ),
    }).catch(console.error);
  }

  // urgent alert (separate email, higher urgency)
  if (isUrgent && prefs.urgent !== false && prefs.booking === false) {
    // only send the urgent alert if we didn't already send a booking email that covers it
    sendEmail({
      to: email,
      subject: `⚠️ Pneuros: URGENT job — ${job.customer.name}`,
      html: wrap(
        "⚠️ Urgent Job Alert",
        `<p>A high-priority job has been created and requires immediate attention.</p>
         ${jobCard(job)}`
      ),
    }).catch(console.error);
  }
}

/** Call after a job's status changes (but not to completed — use notifyOrgJobCompleted for that). */
export async function notifyOrgStatusChange(
  organizationId: string,
  job: JobSummary
): Promise<void> {
  const { email, prefs } = await getOrgDispatch(organizationId);
  if (!email || prefs.statusChange === false) return;

  const statusLabel: Record<string, string> = {
    en_route: "En Route",
    in_progress: "In Progress",
    scheduled: "Scheduled",
    cancelled: "Cancelled",
  };

  sendEmail({
    to: email,
    subject: `Pneuros: Job status — ${statusLabel[job.status] ?? job.status} (${job.customer.name})`,
    html: wrap(
      `Job Status: ${statusLabel[job.status] ?? job.status}`,
      `<p>A job has moved to <strong>${statusLabel[job.status] ?? job.status}</strong>.</p>
       ${jobCard(job)}`
    ),
  }).catch(console.error);
}

/** Call after a job is marked completed. */
export async function notifyOrgJobCompleted(
  organizationId: string,
  job: JobSummary
): Promise<void> {
  const { email, prefs } = await getOrgDispatch(organizationId);
  if (!email || prefs.completion === false) return;

  sendEmail({
    to: email,
    subject: `Pneuros: Job completed — ${job.customer.name}`,
    html: wrap(
      "Job Completed",
      `<p>A job has been marked complete. An invoice has been automatically generated.</p>
       <p><strong>Completed:</strong> ${fmt(job.completedAt)}</p>
       ${jobCard(job)}`
    ),
  }).catch(console.error);
}

export async function notifyOfficePaymentReceived(params: {
  invoiceId: string
  amount: number
  description: string
  customerName: string
  orgId: string
}): Promise<void> {
  const { amount, description, customerName, orgId } = params

  // Fetch org directly — getOrgDispatch is not used here because it only
  // returns email + notificationPreferences, not phone or smsEnabled.
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { name: true, email: true, phone: true, smsEnabled: true },
  })
  if (!org) return

  // Email notification
  if (org.email) {
    sendEmail({
      to: org.email,
      subject: `Payment received: $${amount.toFixed(2)} from ${customerName}`,
      html: wrap(
        "Payment Received",
        `<p><strong>${escapeHtml(customerName)}</strong> has paid <strong>$${amount.toFixed(2)}</strong> for <strong>${escapeHtml(description)}</strong>.</p>
         <div style="background:#f5f5f5;padding:16px;border-radius:8px;margin:16px 0;">
           <p style="margin:4px 0;"><strong>Customer:</strong> ${escapeHtml(customerName)}</p>
           <p style="margin:4px 0;"><strong>Amount:</strong> $${amount.toFixed(2)}</p>
           <p style="margin:4px 0;"><strong>Service:</strong> ${escapeHtml(description)}</p>
           <p style="margin:4px 0;"><strong>Time:</strong> ${new Date().toLocaleString("en-US")}</p>
         </div>`
      ),
    }).catch((e: unknown) => console.error("[OrgNotify] Payment email failed:", e))
  }

  // SMS notification — only if smsEnabled and org has a valid E.164 phone
  // Note: getClient() in sms.ts is private and not exported. We read Twilio
  // env vars directly here — intentional duplication for a short, isolated path.
  if (org.smsEnabled && org.phone) {
    const E164 = /^\+[1-9]\d{7,14}$/
    if (!E164.test(org.phone)) return

    const sid = process.env.TWILIO_ACCOUNT_SID
    const token = process.env.TWILIO_AUTH_TOKEN
    const from = process.env.TWILIO_FROM_NUMBER
    if (!sid || !token || !from) return

    const client = twilio(sid, token)
    const body = `[Pneuros] Payment received: $${amount.toFixed(2)} from ${customerName} (${description})`
    client.messages
      .create({ to: org.phone, from, body })
      .catch((e: unknown) => console.error("[OrgNotify] Payment SMS failed:", e))
  }
}

export async function notifyOfficePlanCreated(params: {
  planName: string
  customerName: string
  price: number
  itemCount: number
  orgId: string
}): Promise<void> {
  const { planName, customerName, price, itemCount, orgId } = params
  const { email } = await getOrgDispatch(orgId)
  if (!email) return
  await sendEmail({
    to: email,
    subject: `New maintenance plan: ${planName} — ${customerName}`,
    html: `<p>A new maintenance plan has been created.</p>
<ul>
  <li><strong>Plan:</strong> ${escapeHtml(planName)}</li>
  <li><strong>Customer:</strong> ${escapeHtml(customerName)}</li>
  <li><strong>Price:</strong> $${price.toFixed(2)}</li>
  <li><strong>Equipment items:</strong> ${itemCount}</li>
</ul>`,
  })
}

export async function notifyOfficeCancellation(params: {
  jobId: string
  customerName: string
  orgId: string
}): Promise<void> {
  const { jobId, customerName, orgId } = params
  const { email } = await getOrgDispatch(orgId)
  if (!email) return
  sendEmail({
    to: email,
    subject: `Appointment cancelled — ${customerName}`,
    html: wrap(
      "Appointment Cancelled",
      `<p><strong>${escapeHtml(customerName)}</strong> has cancelled their appointment.</p>
       <div style="background:#f5f5f5;padding:16px;border-radius:8px;margin:16px 0;">
         <p style="margin:4px 0;"><strong>Reference:</strong> ${escapeHtml(jobId.slice(0, 12))}</p>
         <p style="margin:4px 0;"><strong>Customer:</strong> ${escapeHtml(customerName)}</p>
       </div>
       <p>You may wish to contact them to reschedule.</p>`
    ),
  }).catch(console.error)
}

export async function notifyOfficeDepositReceived(estimateId: string): Promise<void> {
  const estimate = await prisma.estimate.findUnique({
    where: { id: estimateId },
    include: {
      job: { include: { customer: true } },
      organization: { select: { email: true, notificationPreferences: true } },
    },
  })
  if (!estimate) return

  const orgEmail = estimate.organization?.email
  if (!orgEmail) return

  const amount = estimate.depositAmount ?? 0
  const customerName = estimate.job?.customer?.name ?? "Customer"
  const jobTitle = estimate.job?.title ?? "job"

  await sendEmail({
    to: orgEmail,
    subject: `Deposit received — ${customerName}`,
    html: `
      <p>A deposit of <strong>$${amount.toFixed(2)}</strong> was received from <strong>${customerName}</strong> for <strong>${jobTitle}</strong>.</p>
      <p>The job has been marked as <strong>confirmed</strong>.</p>
    `,
  })
}
