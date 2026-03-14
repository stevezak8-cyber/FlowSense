import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const FROM_EMAIL = "FlowSense <onboarding@resend.dev>"; // Use verified domain in prod

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail(options: SendEmailOptions): Promise<void> {
  if (!resend) {
    console.log(`[Email] Skipped (no RESEND_API_KEY): ${options.subject} → ${options.to}`);
    return;
  }

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: options.to,
      subject: options.subject,
      html: options.html,
    });
    console.log(`[Email] Sent: ${options.subject} → ${options.to}`);
  } catch (error) {
    console.error(`[Email] Failed: ${options.subject} → ${options.to}`, error);
    // Fire-and-forget — don't throw
  }
}
