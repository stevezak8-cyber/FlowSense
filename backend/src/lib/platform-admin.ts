/**
 * Platform admins are the people who run Pneuros itself (not a shop's own
 * office staff). They are listed by email in PLATFORM_ADMIN_EMAILS,
 * comma-separated. With the variable unset, nobody is a platform admin.
 */
function emailList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
}

export function platformAdminEmails(): string[] {
  return emailList(process.env.PLATFORM_ADMIN_EMAILS)
}

/**
 * Where founder alerts (signups, billing events, first activity) are emailed.
 * FOUNDER_ALERT_EMAILS, comma-separated, if set; otherwise the platform admins.
 * This is deliberately separate from PLATFORM_ADMIN_EMAILS: that list decides who
 * can open /platform, and an address that only needs to receive mail must not
 * gain access by being on it.
 */
export function founderAlertEmails(): string[] {
  const configured = emailList(process.env.FOUNDER_ALERT_EMAILS)
  return configured.length > 0 ? configured : platformAdminEmails()
}

export function isPlatformAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false
  return platformAdminEmails().includes(email.trim().toLowerCase())
}
