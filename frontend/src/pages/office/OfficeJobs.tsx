"use client"

import { useState, useEffect, useCallback } from "react"
import { api } from "@/api/client"
import type { ApiJob } from "@/api/types"
import { JobsTable } from "@/components/jobs/jobs-table"
import { CreateJobDialog } from "@/components/jobs/create-job-dialog"
import { ScheduleCalendar } from "@/components/schedule/ScheduleCalendar"
import { PageError } from "@/components/page-error"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Wrench, Clock, CheckCircle2, AlertTriangle, Plus, UserX } from "lucide-react"
import { toast } from "sonner"

export default function OfficeJobsPage() {
  const [jobs, setJobs] = useState<ApiJob[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [view, setView] = useState<"list" | "calendar">("list")

  const fetchJobs = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.get<ApiJob[]>("/api/jobs")
      setJobs(data)
    } catch (e: unknown) {
      setError((e as Error).message ?? "Failed to load jobs")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchJobs() }, [fetchJobs])

  async function handleDelete(id: string) {
    try {
      await api.delete(`/api/jobs/${id}`)
      setJobs((prev) => prev.filter((j) => j.id !== id))
      toast.success("Job deleted")
    } catch (e: unknown) {
      const msg = (e as { message?: string })?.message ?? ""
      if (msg.includes("linked invoices")) {
        toast.error("This job has a linked invoice and cannot be deleted.")
      } else {
        toast.error("Failed to delete job. Please try again.")
      }
    }
  }

  const scheduled = jobs.filter((j) => j.status === "scheduled").length
  const inProgress = jobs.filter((j) => j.status === "in_progress").length
  const completed = jobs.filter((j) => j.status === "completed").length
  const urgent = jobs.filter((j) => j.priority === "urgent").length
  const unassigned = jobs.filter((j) => j.status === "pending" && !j.technicianId)

  if (error) return <PageError message={error} onRetry={fetchJobs} />

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Job Management</h1>
          <p className="mt-1 text-sm text-muted-foreground">Create, assign, and track all service jobs</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-muted rounded-lg p-1">
            <button
              type="button"
              onClick={() => setView("list")}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                view === "list" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground"
              }`}
            >
              List
            </button>
            <button
              type="button"
              onClick={() => setView("calendar")}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                view === "calendar" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground"
              }`}
            >
              Calendar
            </button>
          </div>
          <Button
            onClick={() => setDialogOpen(true)}
            className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            New Job
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-border bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Scheduled</CardTitle>
            <Clock className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-card-foreground">{scheduled}</div></CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-mono uppercase tracking-wider text-muted-foreground">In Progress</CardTitle>
            <Wrench className="h-4 w-4 text-accent" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-card-foreground">{inProgress}</div></CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Completed</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-card-foreground">{completed}</div></CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Urgent</CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-card-foreground">{urgent}</div></CardContent>
        </Card>
      </div>

      {/* Unassigned queue — shown when there are pending jobs needing a technician */}
      {unassigned.length > 0 && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold text-amber-600 dark:text-amber-400">
              <UserX className="h-4 w-4" />
              Needs Assignment ({unassigned.length})
              <span className="ml-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-mono text-amber-600 dark:text-amber-400">
                Action required
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {unassigned.map((job) => (
              <div key={job.id} className="flex items-center justify-between rounded-lg border border-amber-500/20 bg-card px-4 py-2.5">
                <div>
                  <p className="text-sm font-medium text-card-foreground">
                    {job.equipmentType
                      ? job.equipmentType.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())
                      : "Service call"
                    }
                    {job.priority === "urgent" && (
                      <span className="ml-2 rounded bg-destructive/15 px-1.5 py-0.5 text-[10px] font-mono font-semibold uppercase text-destructive">
                        Urgent
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {job.customer.name} · {new Date(job.scheduledAt).toLocaleString([], {
                      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
                    })}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-amber-500/40 text-amber-600 hover:bg-amber-500/10 dark:text-amber-400"
                  onClick={() => setDialogOpen(true)}
                >
                  Assign
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {view === "list" ? (
        <JobsTable jobs={jobs} loading={loading} onDelete={handleDelete} />
      ) : (
        <ScheduleCalendar />
      )}

      <CreateJobDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={() => { setDialogOpen(false); fetchJobs() }}
      />
    </div>
  )
}
