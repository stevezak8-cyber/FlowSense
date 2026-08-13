import { Resend } from "resend";
import { prisma } from "../lib/prisma.js";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const FROM_EMAIL = process.env.FROM_EMAIL ?? "FlowSense <onboarding@resend.dev>";

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
  const jobTitle = estimate.job.title
  const customerName = estimate.job.customer.name

  await sendEmail({
    to: estimate.job.customer.email,
    subject: `Deposit received — ${jobTitle}`,
    html: `
      <p>Hi ${customerName},</p>
      <p>We've received your deposit of <strong>$${amount.toFixed(2)}</strong> for <strong>${jobTitle}</strong>.</p>
      <p>Your appointment is confirmed. Your technician will be in touch soon.</p>
      <p>Thank you,<br/>The FlowSense Team</p>
    `,
  })
}
