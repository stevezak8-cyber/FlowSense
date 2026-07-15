import {
  Wrench,
  CheckCircle2,
  CalendarClock,
  DollarSign,
  Users,
  AlertTriangle,
  Zap,
} from "lucide-react"
import type { DashboardStats } from "@/api/types"

interface StatCardsProps {
  stats: DashboardStats | null
  loading?: boolean
}

export function StatCards({ stats, loading }: StatCardsProps) {
  if (loading || !stats) {
    return (
      <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="medops-card p-6 animate-pulse"
          >
            <div className="flex items-center justify-between">
              <div className="h-3 w-20 rounded bg-muted" />
              <div className="h-9 w-9 rounded-xl bg-muted" />
            </div>
            <div className="mt-4 h-8 w-14 rounded bg-muted" />
            <div className="mt-2 h-3 w-16 rounded bg-muted" />
          </div>
        ))}
      </div>
    )
  }

  const cards = [
    {
      label: "Active Jobs",
      value: stats.activeJobs,
      icon: Wrench,
      change: `${stats.totalJobs} total`,
      color: "text-primary",
      bg: "bg-primary/8",
    },
    {
      label: "Completed Today",
      value: stats.completedToday,
      icon: CheckCircle2,
      change: `${stats.completedJobs} all time`,
      color: "text-success",
      bg: "bg-success/8",
    },
    {
      label: "Scheduled (Week)",
      value: stats.scheduledThisWeek,
      icon: CalendarClock,
      change: "This week",
      color: "text-chart-5",
      bg: "bg-chart-5/8",
    },
    {
      label: "Revenue (MTD)",
      value: `$${stats.revenueMtd.toLocaleString()}`,
      icon: DollarSign,
      change: "Month to date",
      color: "text-success",
      bg: "bg-success/8",
    },
    {
      label: "Technicians",
      value: stats.totalTechnicians,
      icon: Users,
      change: "On roster",
      color: "text-primary",
      bg: "bg-primary/8",
    },
    {
      label: "Urgent Jobs",
      value: stats.urgentJobs,
      icon: AlertTriangle,
      change: stats.urgentJobs > 0 ? "Needs attention" : "All clear",
      color: "text-destructive",
      bg: "bg-destructive/8",
    },
    {
      label: "Customers",
      value: stats.totalCustomers,
      icon: Users,
      change: "In database",
      color: "text-primary",
      bg: "bg-primary/8",
    },
    {
      label: "Completion Rate",
      value: stats.totalJobs > 0 ? `${Math.round((stats.completedJobs / stats.totalJobs) * 100)}%` : "—",
      icon: Zap,
      change: stats.totalJobs > 0 ? "Of all jobs" : "No jobs yet",
      color: "text-chart-5",
      bg: "bg-chart-5/8",
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
      {cards.map((stat) => (
        <div
          key={stat.label}
          className="medops-card group p-6 transition-all hover:shadow-md"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {stat.label}
            </span>
            <div className={`rounded-xl p-2 ${stat.bg}`}>
              <stat.icon className={`h-4 w-4 ${stat.color}`} />
            </div>
          </div>
          <div className="mt-4 text-[28px] font-bold tracking-tight text-card-foreground leading-none">
            {stat.value}
          </div>
          <div className="mt-2 text-xs text-muted-foreground">{stat.change}</div>
        </div>
      ))}
    </div>
  )
}
