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
import { PageError } from "@/components/page-error"
import { Button } from "@/components/ui/button"
import { Link } from "react-router-dom"
import { Loader2, Wrench, UserX, TrendingUp, TrendingDown } from "lucide-react"
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts"

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
    <div className="space-y-7">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Office Dashboard
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Operations overview for FlowSense HVAC services
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" className="rounded-xl" onClick={() => setJobDialogOpen(true)}>
            <Wrench className="h-4 w-4" />
            New Job
          </Button>
          <AddCustomerDialog onCreated={() => {}} />
          <AddTechnicianDialog onCreated={(tech) => setTechnicians((prev) => [tech, ...prev])} />
        </div>
      </div>

      <StatCards stats={stats} loading={loading} />

      <MaintenanceDueWidget />

      <RecurringDraftsWidget />

      {/* Unassigned jobs alert */}
      {(() => {
        const unassigned = jobs.filter((j) => j.status === "pending" && !j.technicianId)
        if (!unassigned.length) return null
        return (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/8 px-4 py-3">
            <div className="flex items-center gap-2.5">
              <UserX className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
                {unassigned.length} job{unassigned.length !== 1 ? "s" : ""} need{unassigned.length === 1 ? "s" : ""} a technician assigned
              </p>
            </div>
            <Link
              to="/office/jobs"
              className="shrink-0 rounded-lg bg-amber-500/20 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-500/30 transition-colors dark:text-amber-300"
            >
              Review jobs →
            </Link>
          </div>
        )
      })()}

      <div className="grid gap-7 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <JobChart data={chartData} loading={loading} />
        </div>
        <div className="lg:col-span-2">
          <TechStatus technicians={technicians} jobs={jobs} loading={loading} />
        </div>
      </div>

      <RecentJobs jobs={jobs} loading={loading} />

      {/* ── Revenue & Job Trends ── */}
      <div className="rounded-xl border bg-card p-5">
        <h2 className="mb-4 text-base font-semibold">Revenue & Job Trends (Last 6 Months)</h2>
        {analyticsLoading ? (
          <div className="h-40 bg-muted rounded animate-pulse" />
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <p className="mb-2 text-sm text-muted-foreground">Revenue</p>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={analyticsData?.revenueTrend ?? []}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v) => [typeof v === "number" ? `$${v.toFixed(2)}` : v, "Revenue"]} />
                  <Line type="monotone" dataKey="revenue" stroke="#0d9488" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div>
              <p className="mb-2 text-sm text-muted-foreground">Jobs Completed</p>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={analyticsData?.jobTrend ?? []}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip formatter={(v) => [v, "Jobs"]} />
                  <Line type="monotone" dataKey="jobs" stroke="#6366f1" strokeWidth={2} dot={false} />
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
            <div className="mt-4 flex items-center gap-3 rounded-lg border bg-muted/40 px-4 py-3">
              {forecastUp ? (
                <TrendingUp className="h-4 w-4 text-green-600 dark:text-green-400" />
              ) : (
                <TrendingDown className="h-4 w-4 text-red-500 dark:text-red-400" />
              )}
              <div>
                <p className="text-sm font-medium">
                  Next Month Forecast ({analyticsData.forecast.month})
                </p>
                <p className="text-xs text-muted-foreground">
                  ${projectedRevenue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} projected revenue
                  {" "}
                  <span className={forecastUp ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"}>
                    ({forecastUp ? "▲" : "▼"} vs this month)
                  </span>
                </p>
              </div>
            </div>
          )
        })()}
      </div>

      {/* ── Equipment Type Breakdown ── */}
      <div className="rounded-xl border bg-card p-5">
        <h2 className="mb-4 text-base font-semibold">Top Equipment Types</h2>
        {analyticsLoading ? (
          <div className="h-40 bg-muted rounded animate-pulse" />
        ) : (analyticsData?.equipmentBreakdown.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">No completed jobs in the last 6 months.</p>
        ) : (
          <ResponsiveContainer width="100%" height={180}>
            <BarChart
              data={analyticsData?.equipmentBreakdown ?? []}
              layout="vertical"
              margin={{ left: 16 }}
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
              <YAxis type="category" dataKey="type" tick={{ fontSize: 11 }} width={90} />
              <Tooltip formatter={(v) => [v, "Jobs"]} />
              <Bar dataKey="count" fill="#0d9488" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── AI Insights ── */}
      <div className="rounded-xl border bg-card p-5">
        <h2 className="mb-3 flex items-center gap-2 text-base font-semibold">
          <span>✦</span> AI Insights
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

      {/* ── At-Risk Customers ── */}
      <div className="rounded-xl border bg-card p-5">
        <h2 className="mb-4 text-base font-semibold">At-Risk Customers</h2>
        {analyticsLoading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-8 bg-muted rounded animate-pulse" />
            ))}
          </div>
        ) : (analyticsData?.atRisk.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">No at-risk customers identified.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="pb-2 pr-4 font-medium">Customer</th>
                  <th className="pb-2 pr-4 font-medium">Address</th>
                  <th className="pb-2 font-medium">Flags / AI Reason</th>
                </tr>
              </thead>
              <tbody>
                {analyticsData?.atRisk.map((c) => (
                  <tr key={c.customerId} className="border-b last:border-0">
                    <td className="py-2.5 pr-4 font-medium">{c.name}</td>
                    <td className="py-2.5 pr-4 text-muted-foreground">{c.address}</td>
                    <td className="py-2.5">
                      <div className="flex flex-wrap gap-1 mb-1">
                        {c.flags.includes("overdue_service") && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                            overdue service
                          </span>
                        )}
                        {c.flags.includes("warranty_expiring") && (
                          <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-800 dark:bg-orange-900/40 dark:text-orange-300">
                            warranty expiring
                          </span>
                        )}
                        {c.flags.includes("no_recent_job") && (
                          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
                            no recent job
                          </span>
                        )}
                      </div>
                      {c.aiReason && (
                        <p className="text-xs text-muted-foreground">{c.aiReason}</p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <CreateJobDialog
        open={jobDialogOpen}
        onOpenChange={setJobDialogOpen}
        onCreated={() => { setJobDialogOpen(false); fetchAll() }}
      />
    </div>
  )
}
