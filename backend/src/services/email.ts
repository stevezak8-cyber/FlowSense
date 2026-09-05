import { Resend } from "resend";
import { prisma } from "../lib/prisma.js";
import { jobTitle } from "../lib/job-title.js";
import { escapeHtml } from "../lib/escape-html.js";

const FROM_EMAIL = process.env.FROM_EMAIL ?? "Pneuros <onboarding@resend.dev>";

function getResend() {
  return process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
}

export interface Attachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  attachments?: Attachment[];
}

export async function sendEmail(options: SendEmailOptions): Promise<void> {
  const resend = getResend();
  if (!resend) {
    console.log(`[Email] Skipped (no RESEND_API_KEY): ${options.subject} → ${options.to}`);
    return;
  }

  await resend.emails.send({
    from: FROM_EMAIL,
    to: options.to,
    subject: options.subject,
    html: options.html,
    ...(options.attachments && options.attachments.length > 0
      ? {
          attachments: options.attachments.map((a) => ({
            filename: a.filename,
            content: a.content,
            content_type: a.contentType,
          })),
        }
      : {}),
  });
  console.log(`[Email] Sent: ${options.subject} → ${options.to}`);
}

export async function sendDepositReceiptEmail(estimateId: string): Promise<void> {
  const estimate = await prisma.estimate.findUnique({
    where: { id: estimateId },
    include: {
      job: { include: { customer: true } },
    },
  })
  if (!estimate?.job?.customer?.email) return

  const amount = estimate.depositAmount ?? 0
  const title = jobTitle(estimate.job)
  const customerName = estimate.job.customer.name

  await sendEmail({
    to: estimate.job.customer.email,
    subject: `Deposit received — ${title}`,
    html: `
      <p>Hi ${escapeHtml(customerName)},</p>
      <p>We've received your deposit of <strong>$${amount.toFixed(2)}</strong> for <strong>${escapeHtml(title)}</strong>.</p>
      <p>Your appointment is confirmed. Your technician will be in touch soon.</p>
      <p>Thank you,<br/>The Pneuros Team</p>
    `,
  })
}

export async function sendInvoiceReceiptEmail(params: {
  invoiceId: string
  amount: number
  description: string
  issuedDate: Date
  customerName: string
  customerEmail: string | null
  orgName: string
  orgContactPhone: string | null
  orgContactEmail: string | null
}): Promise<void> {
  if (!params.customerEmail) return

  const { customerName, customerEmail, amount, description, orgName, orgContactPhone, orgContactEmail } = params

  await sendEmail({
    to: customerEmail,
    subject: `Payment received — ${orgName}`,
    html: `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
        <h2 style="color:#1a1a1a;">Payment Received</h2>
        <p>Hi ${escapeHtml(customerName)},</p>
        <p>Thank you — we've received your payment of <strong>$${amount.toFixed(2)}</strong> for <strong>${escapeHtml(description)}</strong>.</p>
        <div style="background:#f5f5f5;padding:16px;border-radius:8px;margin:16px 0;">
          <p style="margin:4px 0;"><strong>Amount paid:</strong> $${amount.toFixed(2)}</p>
          <p style="margin:4px 0;"><strong>Service:</strong> ${escapeHtml(description)}</p>
          <p style="margin:4px 0;"><strong>Date:</strong> ${new Date(params.issuedDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</p>
        </div>
        ${orgContactPhone || orgContactEmail ? `
        <p style="color:#555;font-size:14px;">Questions? Contact us:<br/>
          ${orgContactPhone ? `Phone: ${escapeHtml(orgContactPhone)}<br/>` : ""}
          ${orgContactEmail ? `Email: ${escapeHtml(orgContactEmail)}` : ""}
        </p>` : ""}
        <p>Thank you,<br/>${escapeHtml(orgName)}</p>
        <p style="color:#888;font-size:13px;margin-top:24px;">— Pneuros</p>
      </div>
    `,
  })
}

async function getJobForEmail(jobId: string) {
  return prisma.job.findUnique({
    where: { id: jobId },
    select: {
      customer: { select: { email: true, emailOptOut: true } },
      organization: { select: { name: true } },
    },
  })
}

export async function sendEnRouteEmail(jobId: string): Promise<void> {
  const job = await getJobForEmail(jobId)
  if (!job?.customer?.email || job.customer.emailOptOut) return
  await sendEmail({
    to: job.customer.email,
    subject: "Your technician is on the way",
    html: `<p>Your technician is on the way and should arrive within the hour. Thank you for choosing ${job.organization.name}.</p>`,
  })
}

export async function sendJobInProgressEmail(jobId: string): Promise<void> {
  const job = await getJobForEmail(jobId)
  if (!job?.customer?.email || job.customer.emailOptOut) return
  await sendEmail({
    to: job.customer.email,
    subject: "Your service has started",
    html: `<p>Your technician has arrived and your service is now in progress.</p>`,
  })
}

export async function sendJobCompletedEmail(jobId: string): Promise<void> {
  const job = await getJobForEmail(jobId)
  if (!job?.customer?.email || job.customer.emailOptOut) return
  await sendEmail({
    to: job.customer.email,
    subject: "Your service is complete",
    html: `<p>Your service is complete. Thank you for choosing ${job.organization.name}!</p>`,
  })
}
