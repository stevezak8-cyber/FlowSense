export interface OrgActivity {
  lastActiveAt: string | null
  lastLoginAt: string | null
  customers7d: number
  jobs7d: number
}

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

/** "just now", "12m ago", "5h ago", "3d ago", or a date once it's over two weeks. null means never seen. */
export function timeAgo(iso: string | null, now: number = Date.now()): string {
  if (!iso) return "—"
  const diff = now - new Date(iso).getTime()
  if (Number.isNaN(diff)) return "—"
  if (diff < MIN) return "just now"
  if (diff < HOUR) return `${Math.floor(diff / MIN)}m ago`
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h ago`
  if (diff < 14 * DAY) return `${Math.floor(diff / DAY)}d ago`
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

/** Used within the last day: the shops worth watching right now. */
export function isActiveToday(iso: string | null, now: number = Date.now()): boolean {
  return !!iso && now - new Date(iso).getTime() < DAY
}

/** "2 customers · 5 jobs", or null when nothing real happened in the last 7 days. */
export function weekSummary(a: Pick<OrgActivity, "customers7d" | "jobs7d">): string | null {
  const parts: string[] = []
  if (a.customers7d > 0) parts.push(`${a.customers7d} ${a.customers7d === 1 ? "customer" : "customers"}`)
  if (a.jobs7d > 0) parts.push(`${a.jobs7d} ${a.jobs7d === 1 ? "job" : "jobs"}`)
  return parts.length ? parts.join(" · ") : null
}

/** Newest activity first; shops never seen go last, keeping their existing order. */
export function byRecentActivity<T extends { activity: Pick<OrgActivity, "lastActiveAt"> }>(orgs: T[]): T[] {
  const time = (o: T) => (o.activity.lastActiveAt ? new Date(o.activity.lastActiveAt).getTime() : -Infinity)
  return [...orgs].sort((a, b) => time(b) - time(a))
}
