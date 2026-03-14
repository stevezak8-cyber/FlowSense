"use client"

import { useState, useEffect, useCallback } from "react"
import { api } from "@/api/client"
import type { ApiJob } from "@/api/types"
import { JobsTable } from "@/components/jobs/jobs-table"
import { CreateJobDialog } from "@/components/jobs/create-job-dialog"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Wrench, Clock, CheckCircle2, AlertTriangle, Plus } from "lucide-react"

export default function OfficeJobsPage() {
  const [jobs, setJobs] = useState<ApiJob[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)

  const fetchJobs = useCallback(async () => {
    try {
      const data = await api.get<ApiJob[]>("/api/jobs")
      setJobs(data)
    } catch (e) {
      console.error("Failed to fetch jobs:", e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchJobs() }, [fetchJobs])

  const scheduled = jobs.filter((j) => j.status === "scheduled").length
  const inProgress = jobs.filter((j) => j.status === "in_progress").length
  const completed = jobs.filter((j) => j.status === "completed").length
  const urgent = jobs.filter((j) => j.priority === "urgent").length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Job Management</h1>
          <p className="mt-1 text-sm text-muted-foreground">Create, assign, and track all service jobs</p>
        </div>
        <Button
          onClick={() => setDialogOpen(true)}
          className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          New Job
        </Button>
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

      <JobsTable jobs={jobs} loading={loading} />

      <CreateJobDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={() => { setDialogOpen(false); fetchJobs() }}
      />
    </div>
  )
}
