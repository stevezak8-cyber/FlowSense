"use client"

import { useState, useEffect, useCallback } from "react"
import { api } from "@/api/client"
import type { DashboardStats, ChartDataPoint, ApiJob, ApiTechnician } from "@/api/types"
import { StatCards } from "@/components/dashboard/stat-cards"
import { RecentJobs } from "@/components/dashboard/recent-jobs"
import { TechStatus } from "@/components/dashboard/tech-status"
import { JobChart } from "@/components/dashboard/job-chart"
import { CreateJobDialog } from "@/components/jobs/create-job-dialog"
import { AddTechnicianDialog } from "@/components/technicians/add-technician-dialog"
import { AddCustomerDialog } from "@/components/customers/add-customer-dialog"
import { PageError } from "@/components/page-error"
import { Button } from "@/components/ui/button"
import { Link } from "react-router-dom"
import { Loader2, Wrench, UserX } from "lucide-react"

export default function OfficeDashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [chartData, setChartData] = useState<ChartDataPoint[]>([])
  const [jobs, setJobs] = useState<ApiJob[]>([])
  const [technicians, setTechnicians] = useState<ApiTechnician[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [jobDialogOpen, setJobDialogOpen] = useState(false)

  const fetchAll = useCallback(() => {
    setLoading(true)
    setError(null)
    Promise.all([
      api.get<DashboardStats>("/api/dashboard/stats"),
      api.get<ChartDataPoint[]>("/api/dashboard/chart"),
      api.get<ApiJob[]>("/api/jobs"),
      api.get<ApiTechnician[]>("/api/technicians"),
    ])
      .then(([s, c, j, t]) => {
        setStats(s)
        setChartData(c)
        setJobs(j)
        setTechnicians(t)
      })
      .catch((e: unknown) => setError((e as Error).message ?? "Failed to load dashboard"))
      .finally(() => setLoading(false))
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

      <CreateJobDialog
        open={jobDialogOpen}
        onOpenChange={setJobDialogOpen}
        onCreated={() => { setJobDialogOpen(false); fetchAll() }}
      />
    </div>
  )
}
