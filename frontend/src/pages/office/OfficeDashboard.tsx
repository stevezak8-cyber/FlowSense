"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { api } from "@/api/client"
import type { DashboardStats, ChartDataPoint, ApiJob, ApiTechnician, AnalyticsData } from "@/api/types"
import { StatCards } from "@/components/dashboard/stat-cards"
import { RecentJobs } from "@/components/dashboard/recent-jobs"
import { TechStatus } from "@/components/dashboard/tech-status"
import { JobChart } from "@/components/dashboard/job-chart"
import { CreateJobDialog } from "@/components/jobs/create-job-dialog"
import { AddTechnicianDialog } from "@/components/technicians/add-technician-dialog"
import { AddCustomerDialog } from "@/components/customers/add-customer-dialog"
import { MaintenanceDueWidget } from "@/components/equipment/MaintenanceDueWidget"
import { RecurringDraftsWidget } from "@/components/recurring-jobs/RecurringDraftsWidget"
import { WeatherWidget } from "@/components/dashboard/WeatherWidget"
import { NewsWidget } from "@/components/dashboard/NewsWidget"
import { PageError } from "@/components/page-error"
import { Button } from "@/components/ui/button"
import { Link } from "react-router-dom"
import {
  Loader2,
  Wrench,
  UserX,
  TrendingUp,
  TrendingDown,
  Sparkles,
  Activity,
  CheckCircle2,
  XCircle,
  MapPin,
  CalendarClock,
} from "lucide-react"
import { useTheme } from "@/theme/theme-context"
import {
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts"

const donutColors = ["#ec3013", "#d97706", "#78716c", "#a16207", "#57534e"]

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

const activityConfig: Record<string, { icon: typeof CheckCircle2; color: string; message: (j: ApiJob) => string }> = {
  completed: { icon: CheckCircle2, color: "text-success", message: (j) => `Job completed for ${j.customer.name}` },
  cancelled: { icon: XCircle, color: "text-destructive", message: (j) => `${j.customer.name}'s job was cancelled` },
  in_progress: { icon: Wrench, color: "text-primary", message: (j) => `${j.technician?.name ?? "A technician"} started work for ${j.customer.name}` },
  en_route: { icon: MapPin, color: "text-accent", message: (j) => `${j.technician?.name ?? "A technician"} is en route to ${j.customer.name}` },
  scheduled: { icon: CalendarClock, color: "text-chart-5", message: (j) => `Job scheduled for ${j.customer.name}` },
}

// Mirrors the exact date-window definitions backend/src/routes/dashboard.ts uses for
// `completedToday` and `scheduledThisWeek`, shifted back one day/week, so the "previous"
// counts are genuinely comparable to the "current" values already in `stats`.
function computeWeekOverWeek(jobs: ApiJob[]) {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000)
  const weekStart = new Date(todayStart)
  weekStart.setDate(weekStart.getDate() - weekStart.getDay()) // Sunday

  const lastWeekTodayStart = new Date(todayStart.getTime() - 7 * 24 * 60 * 60 * 1000)
  const lastWeekTodayEnd = new Date(todayEnd.getTime() - 7 * 24 * 60 * 60 * 1000)
  const lastWeekStart = new Date(weekStart.getTime() - 7 * 24 * 60 * 60 * 1000)
  const lastWeekEnd = weekStart

  let completedSameDayLastWeek = 0
  let scheduledLastWeek = 0
  for (const job of jobs) {
    if (job.status === "completed" && job.completedAt) {
      const c = new Date(job.completedAt)
      if (c >= lastWeekTodayStart && c < lastWeekTodayEnd) completedSameDayLastWeek++
    }
    const s = new Date(job.scheduledAt)
    if (s >= lastWeekStart && s < lastWeekEnd) scheduledLastWeek++
  }

  return { completedSameDayLastWeek, scheduledLastWeek }
}

const flagStyles: Record<string, string> = {
  overdue_service: "border-amber-500/40 text-amber-700 dark:text-amber-400",
  warranty_expiring: "border-primary/40 text-primary",
  no_recent_job: "border-chart-5/40 text-chart-5",
}

const flagLabels: Record<string, string> = {
  overdue_service: "overdue service",
  warranty_expiring: "warranty expiring",
  no_recent_job: "no recent job",
}

export default function OfficeDashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [chartData, setChartData] = useState<ChartDataPoint[]>([])
  const [jobs, setJobs] = useState<ApiJob[]>([])
  const [technicians, setTechnicians] = useState<ApiTechnician[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [jobDialogOpen, setJobDialogOpen] = useState(false)
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(true)
  const [narrative, setNarrative] = useState<string | null | undefined>(undefined)
  const fetchIdRef = useRef(0)
  const { theme } = useTheme()
  const isDark = theme === "dark"

  const chartColors = isDark
    ? { grid: "rgba(243,242,242,0.07)", tick: "rgba(243,242,242,0.45)", primary: "#ec3013", secondary: "#7d7979" }
    : { grid: "rgba(32,30,29,0.06)", tick: "rgba(32,30,29,0.45)", primary: "#ec3013", secondary: "#9b9797" }

  const { completedSameDayLastWeek, scheduledLastWeek } = computeWeekOverWeek(jobs)

  const recentActivity = [...jobs]
    .filter((j) => j.status in activityConfig)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 5)

  const fetchAll = useCallback(() => {
    setLoading(true)
    setAnalyticsLoading(true)
    setError(null)
    setNarrative(undefined)
    const fetchId = ++fetchIdRef.current
    Promise.all([
      api.get<DashboardStats>("/api/dashboard/stats"),
      api.get<ChartDataPoint[]>("/api/dashboard/chart"),
      api.get<ApiJob[]>("/api/jobs"),
      api.get<ApiTechnician[]>("/api/technicians"),
      api.get<AnalyticsData>("/api/dashboard/analytics/data"),
    ])
      .then(([s, c, j, t, a]) => {
        setStats(s)
        setChartData(c)
        setJobs(j)
        setTechnicians(t)
        setAnalyticsData(a)
      })
      .catch((e: unknown) => setError((e as Error).message ?? "Failed to load dashboard"))
      .finally(() => {
        setLoading(false)
        setAnalyticsLoading(false)
      })

    api
      .get<{ narrative: string | null }>("/api/dashboard/analytics/insights")
      .then((r) => { if (fetchIdRef.current === fetchId) setNarrative(r.narrative) })
      .catch(() => { if (fetchIdRef.current === fetchId) setNarrative(null) })
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  if (loading) return (
    <div className="flex items-center gap-2 py-16 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" /> Loading dashboard…
    </div>
  )
  if (error) return <PageError message={error} onRetry={fetchAll} />

  return (
    <div className="flex flex-col gap-8" style={{ fontFamily: "'Archivo', system-ui, sans-serif" }}>
      <header className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 sm:p-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Operations center</p>
          <h1 className="mt-2 text-[28px] font-extrabold tracking-tight text-foreground">
            Office Dashboard
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Live service, staffing, and customer health at a glance
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" className="rounded-full" onClick={() => setJobDialogOpen(true)}>
            <Wrench data-icon="inline-start" />
            New Job
          </Button>
          <AddCustomerDialog onCreated={() => {}} />
          <AddTechnicianDialog onCreated={(tech) => setTechnicians((prev) => [tech, ...prev])} />
        </div>
      </header>

      <StatCards
        stats={stats}
        loading={loading}
        weekOverWeek={{
          completedToday: stats ? { current: stats.completedToday, previous: completedSameDayLastWeek } : undefined,
          scheduledWeek: stats ? { current: stats.scheduledThisWeek, previous: scheduledLastWeek } : undefined,
        }}
      />

      <section aria-labelledby="plan-ahead-heading" className="flex flex-col gap-4">
        <div>
          <h2 id="plan-ahead-heading" className="text-lg font-bold tracking-tight text-foreground">Plan ahead</h2>
          <p className="mt-1 text-sm text-muted-foreground">Local conditions and industry updates for the days ahead.</p>
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <WeatherWidget city={stats?.city} />
          <NewsWidget />
        </div>
      </section>

      <section aria-labelledby="work-attention-heading" className="flex flex-col gap-4">
        <div>
          <h2 id="work-attention-heading" className="text-lg font-bold tracking-tight text-foreground">Work needing attention</h2>
          <p className="mt-1 text-sm text-muted-foreground">Resolve service commitments before they become missed opportunities.</p>
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          <MaintenanceDueWidget />
          <RecurringDraftsWidget />
        </div>
        {(() => {
          const unassigned = jobs.filter((j) => j.status === "pending" && !j.technicianId)
          if (!unassigned.length) return null
          return (
            <div className="flex flex-col gap-3 rounded-2xl border border-amber-500/50 bg-amber-500/8 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2.5">
                <UserX className="size-4 shrink-0 text-amber-600" />
                <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">
                  {unassigned.length} job{unassigned.length !== 1 ? "s" : ""} need{unassigned.length === 1 ? "s" : ""} a technician assigned
                </p>
              </div>
              <Link
                to="/office/jobs"
                className="shrink-0 rounded-full border border-amber-500/40 px-3 py-1.5 text-center text-xs font-semibold text-amber-700 transition-colors hover:bg-amber-500/15 dark:text-amber-300"
              >
                Review jobs →
              </Link>
            </div>
          )
        })()}
      </section>

      <section aria-labelledby="field-operations-heading" className="flex flex-col gap-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="field-operations-heading" className="text-lg font-bold tracking-tight text-foreground">Today’s field operations</h2>
            <p className="text-sm text-muted-foreground">Track job volume, staffing capacity, and the latest service activity.</p>
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <JobChart data={chartData} loading={loading} />
          </div>
          <div className="lg:col-span-2">
            <TechStatus technicians={technicians} jobs={jobs} loading={loading} />
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <RecentJobs jobs={jobs} loading={loading} />
          </div>
          <div className="lg:col-span-2 overflow-hidden rounded-2xl border border-border bg-card">
            <div className="border-b border-border px-6 py-4">
              <h3 className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                <Activity className="h-3.5 w-3.5 text-primary" /> Recent Activity
              </h3>
            </div>
            {recentActivity.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">No recent activity.</p>
            ) : (
              <div className="divide-y divide-border">
                {recentActivity.map((job) => {
                  const cfg = activityConfig[job.status]
                  const Icon = cfg.icon
                  return (
                    <div key={job.id} className="flex items-start gap-3 px-6 py-3.5">
                      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${cfg.color}`} />
                      <div className="min-w-0">
                        <p className="text-sm text-card-foreground leading-snug">{cfg.message(job)}</p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">{timeAgo(job.updatedAt)}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </section>

      <section aria-labelledby="business-outlook-heading" className="flex flex-col gap-4">
        <div>
          <h2 id="business-outlook-heading" className="text-lg font-bold tracking-tight text-foreground">Business outlook</h2>
          <p className="mt-1 text-sm text-muted-foreground">Six-month performance trends and the next revenue opportunity.</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-6">
        <h2 className="mb-5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Revenue &amp; Job Trends — Last 6 Months
        </h2>
        {analyticsLoading ? (
          <div className="h-40 bg-muted rounded animate-pulse" />
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-semibold text-card-foreground">Revenue</p>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={analyticsData?.revenueTrend ?? []}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} vertical={false} />
                  <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: chartColors.tick, fontSize: 11 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: chartColors.tick, fontSize: 11 }} tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v) => [typeof v === "number" ? `$${v.toFixed(2)}` : v, "Revenue"]} />
                  <Line type="monotone" dataKey="revenue" stroke={chartColors.primary} strokeWidth={2.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold text-card-foreground">Jobs Completed</p>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={analyticsData?.jobTrend ?? []}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} vertical={false} />
                  <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: chartColors.tick, fontSize: 11 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: chartColors.tick, fontSize: 11 }} allowDecimals={false} />
                  <Tooltip formatter={(v) => [v, "Jobs"]} />
                  <Line type="monotone" dataKey="jobs" stroke={chartColors.secondary} strokeWidth={2.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Forecast */}
        {!analyticsLoading && analyticsData && (() => {
          const trend = analyticsData.revenueTrend
          const currentMonthRevenue = trend.length > 0 ? trend[trend.length - 1].revenue : 0
          const projectedRevenue = analyticsData.forecast.projectedRevenue
          const forecastUp = projectedRevenue >= currentMonthRevenue
          return (
            <div className="mt-5 flex items-center gap-3 rounded-xl border border-border bg-secondary/50 px-4 py-3">
              {forecastUp ? (
                <TrendingUp className="h-4 w-4 text-success" />
              ) : (
                <TrendingDown className="h-4 w-4 text-destructive" />
              )}
              <div>
                <p className="text-sm font-semibold text-card-foreground">
                  Next Month Forecast ({analyticsData.forecast.month})
                </p>
                <p className="text-xs text-muted-foreground">
                  ${projectedRevenue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} projected revenue
                  {" "}
                  <span className={forecastUp ? "text-success" : "text-destructive"}>
                    ({forecastUp ? "▲" : "▼"} vs this month)
                  </span>
                </p>
              </div>
            </div>
          )
        })()}
        </div>

        <div className="rounded-2xl border border-border bg-card p-6">
        <h2 className="mb-5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Top Equipment Types
        </h2>
        {analyticsLoading ? (
          <div className="h-40 bg-muted rounded animate-pulse" />
        ) : (analyticsData?.equipmentBreakdown.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">No completed jobs in the last 6 months.</p>
        ) : (
          <div className="flex flex-col items-center gap-6 sm:flex-row">
            <ResponsiveContainer width="100%" height={200} className="sm:max-w-[200px]">
              <PieChart>
                <Pie
                  data={analyticsData?.equipmentBreakdown ?? []}
                  dataKey="count"
                  nameKey="type"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={2}
                  stroke="none"
                >
                  {(analyticsData?.equipmentBreakdown ?? []).map((_, i) => (
                    <Cell key={i} fill={donutColors[i % donutColors.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => [v, "Jobs"]} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-1 flex-col gap-2.5">
              {(analyticsData?.equipmentBreakdown ?? []).map((eq, i) => (
                <div key={eq.type} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-card-foreground">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: donutColors[i % donutColors.length] }} />
                    {eq.type}
                  </span>
                  <span className="font-semibold text-card-foreground">{eq.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        </div>
      </section>

      <section aria-labelledby="customer-health-heading" className="flex flex-col gap-4">
        <div>
          <h2 id="customer-health-heading" className="text-lg font-bold tracking-tight text-foreground">Customer health</h2>
          <p className="mt-1 text-sm text-muted-foreground">Use service signals to protect relationships and future revenue.</p>
        </div>
        <div className="grid gap-4 xl:grid-cols-5">
          <div className="rounded-2xl border border-border bg-card p-6 xl:col-span-2">
        <h2 className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 text-primary" /> AI Insights
        </h2>
        {narrative === undefined ? (
          <div className="space-y-2">
            <div className="h-4 w-3/4 bg-muted rounded animate-pulse" />
            <div className="h-4 w-1/2 bg-muted rounded animate-pulse" />
          </div>
        ) : narrative === null ? (
          <p className="text-sm text-muted-foreground">
            AI insights not available — configure your Anthropic API key in Settings.
          </p>
        ) : (
          <p className="text-sm text-foreground leading-relaxed">{narrative}</p>
        )}
          </div>

          <div className="overflow-hidden rounded-2xl border border-border bg-card xl:col-span-3">
        <h2 className="border-b border-border px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          At-Risk Customers
        </h2>
        {analyticsLoading ? (
          <div className="space-y-2 p-6">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-8 bg-muted rounded animate-pulse" />
            ))}
          </div>
        ) : (analyticsData?.atRisk.length ?? 0) === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">No at-risk customers identified.</p>
        ) : (
          <div className="divide-y divide-border">
            {analyticsData?.atRisk.map((c) => (
              <div key={c.customerId} className="flex flex-col gap-2 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-card-foreground">{c.name}</p>
                  <p className="text-xs text-muted-foreground">{c.address}</p>
                </div>
                <div className="flex flex-1 flex-col items-start gap-1.5 sm:items-end">
                  <div className="flex flex-wrap gap-1.5">
                    {c.flags.map((flag) => (
                      <span
                        key={flag}
                        className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${flagStyles[flag] ?? "border-border text-muted-foreground"}`}
                      >
                        {flagLabels[flag] ?? flag}
                      </span>
                    ))}
                  </div>
                  {c.aiReason && (
                    <p className="text-xs text-muted-foreground sm:text-right">{c.aiReason}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
          </div>
        </div>
      </section>

      <CreateJobDialog
        open={jobDialogOpen}
        onOpenChange={setJobDialogOpen}
        onCreated={() => { setJobDialogOpen(false); fetchAll() }}
      />
    </div>
  )
}
