import { escapeHtml } from "../lib/escape-html.js";

interface PasswordResetData {
  name: string | null;
  resetUrl: string;
}

export function passwordResetHtml(data: PasswordResetData): string {
  const name = escapeHtml(data.name ?? "there");
  const url = escapeHtml(data.resetUrl);

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #1a1a1a;">Reset your password</h2>
      <p>Hi ${name},</p>
      <p>We received a request to reset your Pneuros password. Click the button below to choose a new one.</p>
      <div style="margin: 28px 0;">
        <a href="${url}"
           style="display: inline-block; background: #0f766e; color: #ffffff; text-decoration: none;
                  padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 15px;">
          Reset Password
        </a>
      </div>
      <p style="color: #666; font-size: 13px;">
        This link expires in <strong>1 hour</strong>. If you didn't request a password reset,
        you can safely ignore this email — your password won't change.
      </p>
      <p style="color: #999; font-size: 12px; margin-top: 24px;">
        If the button above doesn't work, copy and paste this URL into your browser:<br/>
        <a href="${url}" style="color: #0f766e;">${url}</a>
      </p>
      <p style="color: #666; font-size: 14px;">— The Pneuros Team</p>
    </div>
  `;
}
