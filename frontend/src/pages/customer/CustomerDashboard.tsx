"use client"

import { useState, useEffect } from "react"
import { api } from "@/api/client"
import type { ApiJob, ApiInvoice } from "@/api/types"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Link } from "react-router-dom"
import {
  Wrench,
  Clock,
  CheckCircle2,
  MapPin,
  User,
  FileText,
  ArrowRight,
  CalendarPlus,
  Loader2,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { ChangePasswordCard } from "@/components/change-password-card"
import { ConfirmDialog } from "@/components/confirm-dialog"

const statusSteps = ["scheduled", "in_progress", "completed"]
const statusLabels: Record<string, string> = {
  scheduled: "Scheduled",
  en_route: "En Route",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
}

export default function CustomerDashboard() {
  const [jobs, setJobs] = useState<ApiJob[]>([])
  const [invoices, setInvoices] = useState<ApiInvoice[]>([])
  const [loading, setLoading] = useState(true)
  const [cancelling, setCancelling] = useState<string | null>(null)
  const [cancelError, setCancelError] = useState<string | null>(null)
  const [pendingCancelId, setPendingCancelId] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      api.get<ApiJob[]>("/api/jobs"),
      api.get<ApiInvoice[]>("/api/invoices"),
    ])
      .then(([j, inv]) => {
        setJobs(j)
        setInvoices(inv)
      })
      .catch((e) => console.error("Failed to load dashboard:", e))
      .finally(() => setLoading(false))
  }, [])

  async function handleCancel(jobId: string) {
    setCancelling(jobId)
    setCancelError(null)
    try {
      await api.patch(`/api/jobs/${jobId}`, { status: "cancelled" })
      setJobs((prev) => prev.map((j) => j.id === jobId ? { ...j, status: "cancelled" } : j))
    } catch {
      setCancelError("Could not cancel the booking. Please call us directly.")
    } finally {
      setCancelling(null)
    }
  }

  const activeJobs = jobs.filter(
    (j) => j.status !== "completed" && j.status !== "cancelled"
  )
  const completedJobs = jobs.filter((j) => j.status === "completed")
  const pendingInvoices = invoices.filter((i) => i.status === "pending")

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Loading dashboard...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">
          Welcome back
        </h1>
        <p className="text-sm text-muted-foreground">
          {"Here's an overview of your HVAC services"}
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="border-border bg-card">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15">
              <Wrench className="h-5 w-5 text-primary" />
            </div>
            <div>
              <div className="text-2xl font-bold text-card-foreground">{activeJobs.length}</div>
              <p className="text-xs text-muted-foreground">Active Jobs</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/15">
              <FileText className="h-5 w-5 text-accent" />
            </div>
            <div>
              <div className="text-2xl font-bold text-card-foreground">{pendingInvoices.length}</div>
              <p className="text-xs text-muted-foreground">Pending Invoices</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/15">
              <CheckCircle2 className="h-5 w-5 text-success" />
            </div>
            <div>
              <div className="text-2xl font-bold text-card-foreground">{completedJobs.length}</div>
              <p className="text-xs text-muted-foreground">Completed</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Active Job Tracker */}
      {activeJobs.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-foreground">Active Job Tracking</h2>
          {activeJobs.map((job) => {
            const currentStep = statusSteps.indexOf(job.status === "en_route" ? "in_progress" : job.status)
            const progressPercent = ((Math.max(currentStep, 0) + 1) / statusSteps.length) * 100

            return (
              <Card key={job.id} className="border-border bg-card overflow-hidden">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-card-foreground">
                        {job.equipmentType
                          ? job.equipmentType.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())
                          : "Service"}
                        {job.symptomSummary ? ` — ${job.symptomSummary}` : ""}
                      </h3>
                      <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{job.id.slice(0, 8)}</p>
                    </div>
                    <Badge
                      variant="outline"
                      className={cn(
                        "rounded-sm px-2 py-0.5 text-[10px] font-mono uppercase border",
                        job.status === "in_progress" || job.status === "en_route"
                          ? "bg-accent/15 text-accent border-accent/30"
                          : "bg-primary/15 text-primary border-primary/30"
                      )}
                    >
                      {statusLabels[job.status]}
                    </Badge>
                  </div>

                  {/* Progress Bar */}
                  <div className="mt-4 space-y-2">
                    <Progress value={progressPercent} className="h-2 bg-secondary [&>div]:bg-primary" />
                    <div className="flex justify-between text-[10px] font-mono text-muted-foreground">
                      {statusSteps.map((step, i) => (
                        <span key={step} className={cn(i <= currentStep ? "text-primary" : "")}>
                          {statusLabels[step]}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Technician Info */}
                  {job.technician && (
                    <div className="mt-4 rounded-lg border border-border bg-secondary/50 p-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/15">
                          <User className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-card-foreground">{job.technician.name}</p>
                          <p className="text-[10px] text-muted-foreground">Assigned Technician</p>
                        </div>
                      </div>
                      <div className="mt-2 flex items-center gap-4 text-[11px] text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {new Date(job.scheduledAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Address + Cancel */}
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3" />
                      {job.customer.address}
                    </div>
                    {job.status === "scheduled" && (
                      <button
                        type="button"
                        onClick={() => setPendingCancelId(job.id)}
                        disabled={cancelling === job.id}
                        className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
                      >
                        {cancelling === job.id
                          ? <Loader2 className="h-3 w-3 animate-spin" />
                          : <X className="h-3 w-3" />
                        }
                        Cancel booking
                      </button>
                    )}
                  </div>
                  {cancelError && cancelling !== job.id && (
                    <p className="mt-2 text-[11px] text-destructive">{cancelError}</p>
                  )}
                  <ConfirmDialog
                    open={pendingCancelId === job.id}
                    onOpenChange={(open) => { if (!open) setPendingCancelId(null) }}
                    title="Cancel this booking?"
                    description="Are you sure you want to cancel this service booking? You can always rebook through your dashboard."
                    confirmLabel="Cancel Booking"
                    cancelLabel="Keep Booking"
                    onConfirm={() => {
                      setPendingCancelId(null)
                      handleCancel(job.id)
                    }}
                  />
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Quick Actions */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Link to="/customer/book">
          <Card className="border-border bg-card cursor-pointer transition-all hover:border-primary/40 group">
            <CardContent className="flex items-center justify-between p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15">
                  <CalendarPlus className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-card-foreground">Book a Service</p>
                  <p className="text-xs text-muted-foreground">Schedule a new appointment</p>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
            </CardContent>
          </Card>
        </Link>
        <Link to="/customer/invoices">
          <Card className="border-border bg-card cursor-pointer transition-all hover:border-accent/40 group">
            <CardContent className="flex items-center justify-between p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/15">
                  <FileText className="h-5 w-5 text-accent" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-card-foreground">View Invoices</p>
                  <p className="text-xs text-muted-foreground">
                    {pendingInvoices.length > 0
                      ? `${pendingInvoices.length} pending payment`
                      : "All paid up"}
                  </p>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
            </CardContent>
          </Card>
        </Link>
      </div>

      <ChangePasswordCard />
    </div>
  )
}
