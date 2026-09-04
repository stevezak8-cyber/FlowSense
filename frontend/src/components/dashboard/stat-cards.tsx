import type { DashboardStats } from "@/api/types"
import { TrendingUp, TrendingDown } from "lucide-react"

interface WeekDelta {
  current: number
  previous: number
}

interface StatCardsProps {
  stats: DashboardStats | null
  loading?: boolean
  /** Real week-over-week comparisons, computed from job data with the same date-window
   *  definitions the backend uses for the current-value stat. Only supplied for metrics
   *  that have a genuine weekly cadence to compare — see OfficeDashboard.tsx. */
  weekOverWeek?: {
    completedToday?: WeekDelta
    scheduledWeek?: WeekDelta
  }
}

function DeltaBadge({ delta }: { delta: WeekDelta }) {
  const diff = delta.current - delta.previous
  if (diff === 0) {
    return <span className="text-[11px] text-muted-foreground">— vs last week ({delta.previous})</span>
  }
  const up = diff > 0
  const Icon = up ? TrendingUp : TrendingDown
  return (
    <span className={`flex items-center gap-1 text-[11px] font-semibold ${up ? "text-success" : "text-destructive"}`}>
      <Icon className="h-3 w-3" />
      {up ? "+" : ""}
      {diff} vs last week ({delta.previous})
    </span>
  )
}

export function StatCards({ stats, loading, weekOverWeek }: StatCardsProps) {
  if (loading || !stats) {
    return (
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        {[0, 1].map((row) => (
          <div
            key={row}
            className={`grid grid-cols-2 divide-x divide-border lg:grid-cols-4 ${row === 1 ? "border-t border-border" : ""}`}
          >
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="animate-pulse p-5">
                <div className="h-2.5 w-16 rounded bg-muted" />
                <div className="mt-4 h-8 w-12 rounded bg-muted" />
                <div className="mt-2 h-2.5 w-14 rounded bg-muted" />
              </div>
            ))}
          </div>
        ))}
      </div>
    )
  }

  const cards = [
    { label: "Active Jobs", value: stats.activeJobs, change: `${stats.totalJobs} total` },
    {
      label: "Completed Today",
      value: stats.completedToday,
      change: `${stats.completedJobs} all time`,
      delta: weekOverWeek?.completedToday,
    },
    {
      label: "Scheduled (Week)",
      value: stats.scheduledThisWeek,
      change: "This week",
      delta: weekOverWeek?.scheduledWeek,
    },
    { label: "Revenue (MTD)", value: `$${stats.revenueMtd.toLocaleString()}`, change: "Month to date" },
    { label: "Technicians", value: stats.totalTechnicians, change: "On roster" },
    {
      label: "Urgent Jobs",
      value: stats.urgentJobs,
      change: stats.urgentJobs > 0 ? "Needs attention" : "All clear",
      accent: stats.urgentJobs > 0,
    },
    { label: "Customers", value: stats.totalCustomers, change: "In database" },
    {
      label: "Completion Rate",
      value: stats.totalJobs > 0 ? `${Math.round((stats.completedJobs / stats.totalJobs) * 100)}%` : "—",
      change: stats.totalJobs > 0 ? "Of all jobs" : "No jobs yet",
    },
  ]

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      {[cards.slice(0, 4), cards.slice(4, 8)].map((row, rowIndex) => (
        <div
          key={rowIndex}
          className={`grid grid-cols-2 divide-x divide-border lg:grid-cols-4 ${rowIndex === 1 ? "border-t border-border" : ""}`}
        >
          {row.map((stat) => (
            <div key={stat.label} className="p-5">
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                {stat.label}
              </span>
              <div
                className={`mt-3 text-[30px] font-extrabold leading-none tracking-tight ${
                  stat.accent ? "text-destructive" : "text-card-foreground"
                }`}
              >
                {stat.value}
              </div>
              <div className="mt-2 text-[11px] text-muted-foreground">{stat.change}</div>
              {stat.delta && (
                <div className="mt-1">
                  <DeltaBadge delta={stat.delta} />
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
