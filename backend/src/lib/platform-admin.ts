/**
 * Platform admins are the people who run Pneuros itself (not a shop's own
 * office staff). They are listed by email in PLATFORM_ADMIN_EMAILS,
 * comma-separated. With the variable unset, nobody is a platform admin.
 */
export function isPlatformAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false
  const allowed = (process.env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
  return allowed.includes(email.trim().toLowerCase())
}
