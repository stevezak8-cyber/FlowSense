import { useState, useEffect } from "react"
import { api } from "@/api/client"
import type { ApiJob, Estimate } from "@/api/types"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import {
  MapPin, Clock, ChevronDown, ChevronUp, Navigation, AlertTriangle,
  Wrench, CheckCircle2, Truck, User, Phone, Loader2, Sparkles, RefreshCw,
} from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { CompletionDialog } from "@/components/jobs/completion-dialog"
import { EstimateBuilder } from "@/components/estimates/estimate-builder"

type ApiStatus = ApiJob["status"]

const statusFlow: Record<string, { next: ApiStatus; label: string; icon: typeof Wrench }> = {
  scheduled: { next: "en_route", label: "Start / En Route", icon: Truck },
  en_route: { next: "in_progress", label: "Arrived - Begin Work", icon: Wrench },
  in_progress: { next: "completed", label: "Mark Complete", icon: CheckCircle2 },
}

const statusConfig: Record<string, { label: string; className: string; icon: typeof Wrench }> = {
  scheduled: { label: "Scheduled", className: "bg-primary/15 text-primary border-primary/30", icon: Clock },
  en_route: { label: "En Route", className: "bg-accent/15 text-accent border-accent/30", icon: Truck },
  in_progress: { label: "In Progress", className: "bg-chart-4/15 text-chart-4 border-chart-4/30", icon: Wrench },
  completed: { label: "Completed", className: "bg-success/15 text-success border-success/30", icon: CheckCircle2 },
  cancelled: { label: "Cancelled", className: "bg-destructive/15 text-destructive border-destructive/30", icon: Clock },
}

const priorityConfig: Record<string, { label: string; className: string }> = {
  low: { label: "Low", className: "text-muted-foreground" },
  normal: { label: "Normal", className: "text-primary" },
  high: { label: "High", className: "text-accent" },
  urgent: { label: "Urgent", className: "text-destructive" },
}

export default function TechnicianJobsPage() {
  const [jobs, setJobs] = useState<ApiJob[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [completingJob, setCompletingJob] = useState<ApiJob | null>(null)
  const [estimateJob, setEstimateJob] = useState<ApiJob | null>(null)
  const [currentEstimate, setCurrentEstimate] = useState<Estimate | null>(null)
  const [generatingEstimate, setGeneratingEstimate] = useState(false)

  function fetchJobs() {
    setLoading(true)
    setError(null)
    api.get<ApiJob[]>("/api/jobs")
      .then(setJobs)
      .catch(() => setError("Could not load your jobs. Check your connection and try again."))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchJobs() }, [])

  const activeJobs = jobs.filter((j) => j.status !== "completed" && j.status !== "cancelled")
  const completedJobs = jobs.filter((j) => j.status === "completed")

  function handleStatusChange(jobId: string, newStatus: ApiStatus) {
    api.patch<ApiJob>(`/api/jobs/${jobId}`, { status: newStatus })
      .then((updated) => {
        setJobs((prev) => prev.map((j) => (j.id === updated.id ? updated : j)))
      })
      .catch((e) => console.error("Failed to update job:", e))
  }

  async function handleCreateEstimate(job: ApiJob) {
    setEstimateJob(job)
    setGeneratingEstimate(true)
    try {
      const est = await api.post<Estimate>("/api/estimates/generate", { jobId: job.id })
      setCurrentEstimate(est)
    } catch {
      toast.error("Failed to generate estimate")
      setEstimateJob(null)
    } finally {
      setGeneratingEstimate(false)
    }
  }

  function handleJobCompleted(updatedJob: ApiJob) {
    setJobs((prev) => prev.map((j) => (j.id === updatedJob.id ? updatedJob : j)))
    setCompletingJob(null)
    setExpandedId(null)
  }

  function JobCard({ job }: { job: ApiJob }) {
    const [regenerating, setRegenerating] = useState(false)

    async function handleRegenerate() {
      setRegenerating(true)
      try {
        const updated = await api.post<ApiJob>(`/api/jobs/${job.id}/generate-pre-arrival`, {})
        setJobs((prev) => prev.map((j) => (j.id === updated.id ? updated : j)))
        toast.success("Pre-arrival briefing regenerated")
      } catch (e) {
        toast.error("Failed to regenerate briefing")
        console.error("Regenerate failed:", e)
      } finally {
        setRegenerating(false)
      }
    }

    const isExpanded = expandedId === job.id
    const status = statusConfig[job.status] ?? statusConfig.scheduled
    const priority = priorityConfig[job.priority] ?? priorityConfig.normal
    const StatusIcon = status.icon
    const nextAction = statusFlow[job.status]
    const scheduled = new Date(job.scheduledAt)

    return (
      <Card className="border-border bg-card overflow-hidden">
        <button onClick={() => setExpandedId(isExpanded ? null : job.id)} className="w-full text-left">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className={cn("flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg", status.className, "border")}>
                <StatusIcon className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-card-foreground truncate">
                    {job.equipmentType
                      ? job.equipmentType.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())
                      : "Service"}
                    {job.symptomSummary ? ` — ${job.symptomSummary}` : ""}
                  </h3>
                  {isExpanded ? <ChevronUp className="h-4 w-4 flex-shrink-0 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 flex-shrink-0 text-muted-foreground" />}
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <span className="font-mono text-[10px] text-muted-foreground">{job.id.slice(0, 8)}</span>
                  <Badge variant="outline" className={cn("rounded-sm px-1.5 py-0 text-[9px] font-mono uppercase border", status.className)}>{status.label}</Badge>
                  {job.priority === "urgent" && <AlertTriangle className="h-3.5 w-3.5 text-destructive" />}
                </div>
                <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1"><User className="h-3 w-3" /><span>{job.customer.name}</span></div>
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    <span>{scheduled.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </button>

        {isExpanded && (
          <div className="border-t border-border px-4 pb-4 pt-3 space-y-4">
            <div className="rounded-lg border border-border bg-secondary/50 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2">
                  <MapPin className="mt-0.5 h-4 w-4 text-primary flex-shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-card-foreground">{job.customer.address}</p>
                    <p className={cn("mt-0.5 text-[10px] font-mono uppercase", priority.className)}>{priority.label} Priority</p>
                  </div>
                </div>
                <Button size="sm" variant="outline" className="h-8 gap-1.5 border-primary/30 text-primary hover:bg-primary/10 text-xs"
                  onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(job.customer.address)}`, "_blank")}>
                  <Navigation className="h-3.5 w-3.5" />Navigate
                </Button>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-secondary/50 p-3">
              <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Customer</span>
              <div className="mt-2 space-y-1.5">
                <div className="flex items-center gap-2 text-xs text-card-foreground">
                  <User className="h-3 w-3 text-muted-foreground" />{job.customer.name}
                </div>
                {job.customer.phone && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Phone className="h-3 w-3" />
                    <a href={`tel:${job.customer.phone}`} className="text-primary hover:underline">{job.customer.phone}</a>
                  </div>
                )}
              </div>
            </div>

            {/* Customer-provided notes (always show if present) */}
            {(job.symptomSummary || job.equipmentNotes) && (
              <div className="rounded-lg border border-border bg-secondary/50 p-3">
                <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Customer Notes</span>
                <div className="mt-1.5 space-y-1">
                  {job.symptomSummary && (
                    <p className="text-xs text-card-foreground leading-relaxed">{job.symptomSummary}</p>
                  )}
                  {job.equipmentNotes && (
                    <p className="text-xs text-muted-foreground leading-relaxed">{job.equipmentNotes}</p>
                  )}
                </div>
              </div>
            )}

            {/* AI Pre-Arrival Briefing */}
            {job.preArrivalNotes ? (
              <>
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5 text-primary" />
                      <span className="text-[10px] font-mono uppercase tracking-wider text-primary">AI Briefing</span>
                      <Badge variant="outline" className="ml-1 rounded-sm px-1 py-0 text-[8px] text-primary/70 border-primary/30">AI-generated</Badge>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 gap-1 px-2 text-[10px] text-muted-foreground hover:text-primary"
                      onClick={handleRegenerate}
                      disabled={regenerating}
                    >
                      {regenerating ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                      Regenerate
                    </Button>
                  </div>
                  <p className="mt-2 text-xs text-card-foreground leading-relaxed">{job.preArrivalNotes}</p>
                </div>

                {job.suggestedParts.length > 0 && (
                  <div className="rounded-lg border border-border bg-secondary/50 p-3">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Suggested Parts</span>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {job.suggestedParts.map((part) => (
                        <Badge key={part} variant="outline" className="rounded-sm text-[10px]">{part}</Badge>
                      ))}
                    </div>
                  </div>
                )}

                {job.suggestedTools.length > 0 && (
                  <div className="rounded-lg border border-border bg-secondary/50 p-3">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Suggested Tools</span>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {job.suggestedTools.map((tool) => (
                        <Badge key={tool} variant="outline" className="rounded-sm text-[10px]">{tool}</Badge>
                      ))}
                    </div>
                  </div>
                )}

                {job.riskFlags.length > 0 && (
                  <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                    <div className="flex items-center gap-1.5">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                      <span className="text-[10px] font-mono uppercase tracking-wider text-amber-600 dark:text-amber-400">Risk Flags</span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {job.riskFlags.map((flag) => (
                        <Badge key={flag} variant="outline" className="rounded-sm text-[10px] border-amber-500/30 text-amber-600 dark:text-amber-400">{flag}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              /* Fallback: no AI data, show generic notes if present */
              !job.symptomSummary && !job.equipmentNotes && (
                <div className="rounded-lg border border-border bg-secondary/50 p-3">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Job Notes</span>
                  <p className="mt-1.5 text-xs text-muted-foreground">No notes available</p>
                </div>
              )
            )}

            {(job.status === "scheduled" || job.status === "en_route" || job.status === "in_progress") && (
              <Button
                variant="outline"
                className="w-full gap-2"
                onClick={() => handleCreateEstimate(job)}
                disabled={generatingEstimate && estimateJob?.id === job.id}
              >
                {generatingEstimate && estimateJob?.id === job.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4 text-indigo-500" />
                )}
                {generatingEstimate && estimateJob?.id === job.id ? "Generating…" : "Create Estimate"}
              </Button>
            )}

            {nextAction && (
              <Button
                className="w-full gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={() =>
                  nextAction.next === "completed"
                    ? setCompletingJob(job)
                    : handleStatusChange(job.id, nextAction.next)
                }
              >
                <nextAction.icon className="h-4 w-4" />{nextAction.label}
              </Button>
            )}
          </div>
        )}
      </Card>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Loading jobs...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
        <AlertTriangle className="h-8 w-8 text-destructive" />
        <p className="text-sm text-muted-foreground">{error}</p>
        <Button size="sm" variant="outline" onClick={fetchJobs}>
          <RefreshCw className="h-4 w-4 mr-2" /> Try again
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-foreground">{"Today's Jobs"}</h1>
        <p className="text-xs text-muted-foreground font-mono">{activeJobs.length} active, {completedJobs.length} completed</p>
      </div>

      {activeJobs.length > 0 && (
        <div className="space-y-3">
          <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Active</span>
          {activeJobs.map((job) => (<JobCard key={job.id} job={job} />))}
        </div>
      )}

      {completedJobs.length > 0 && (
        <div className="space-y-3">
          <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Completed</span>
          {completedJobs.map((job) => (<JobCard key={job.id} job={job} />))}
        </div>
      )}

      {activeJobs.length === 0 && completedJobs.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Wrench className="h-8 w-8 text-muted-foreground/50" />
          <p className="mt-3 text-sm text-muted-foreground">No jobs assigned yet</p>
        </div>
      )}

      {completingJob && (
        <CompletionDialog
          job={completingJob}
          open={!!completingJob}
          onOpenChange={(open) => !open && setCompletingJob(null)}
          onCompleted={handleJobCompleted}
        />
      )}

      <Sheet open={!!currentEstimate} onOpenChange={(v) => { if (!v) { setCurrentEstimate(null); setEstimateJob(null) } }}>
        <SheetContent side="right" className="w-full sm:max-w-md p-0">
          {currentEstimate && estimateJob && (
            <EstimateBuilder
              estimate={currentEstimate}
              jobTitle={
                estimateJob.equipmentType
                  ? estimateJob.equipmentType.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())
                  : "Job"
              }
              jobNotes={estimateJob.symptomSummary}
              onPresent={() => { setCurrentEstimate(null) }}
              onSend={() => { setCurrentEstimate(null); setEstimateJob(null) }}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
