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
import { Button } from "@/components/ui/button"
import { Wrench } from "lucide-react"

export default function OfficeDashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [chartData, setChartData] = useState<ChartDataPoint[]>([])
  const [jobs, setJobs] = useState<ApiJob[]>([])
  const [technicians, setTechnicians] = useState<ApiTechnician[]>([])
  const [loading, setLoading] = useState(true)
  const [jobDialogOpen, setJobDialogOpen] = useState(false)

  const fetchAll = useCallback(() => {
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
      .catch((e) => console.error("Failed to load dashboard:", e))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

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
