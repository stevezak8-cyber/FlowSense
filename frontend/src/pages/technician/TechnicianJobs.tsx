import { useState, useEffect } from "react"
import { api } from "@/api/client"
import type { ApiJob, Estimate, Equipment } from "@/api/types"
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
import { AiChatPanel } from "@/components/jobs/AiChatPanel"
import { ComplianceForm } from "@/components/compliance/ComplianceForm"
import { JobPhotos } from "@/components/jobs/JobPhotos"

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
  const [askAiJob, setAskAiJob] = useState<ApiJob | null>(null)
  const [currentEstimate, setCurrentEstimate] = useState<Estimate | null>(null)
  const [generatingEstimate, setGeneratingEstimate] = useState(false)
  const [jobEquipment, setJobEquipment] = useState<Record<string, Equipment | null>>({})

  function fetchJobs() {
    setLoading(true)
    setError(null)
    api.get<ApiJob[]>("/api/jobs")
      .then(setJobs)
      .catch(() => setError("Could not load your jobs. Check your connection and try again."))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchJobs() }, [])

  useEffect(() => {
    if (!expandedId) return
    const job = jobs.find((j) => j.id === expandedId)
    if (job?.equipmentId && !(job.id in jobEquipment)) {
      api.get<Equipment>(`/api/equipment/${job.equipmentId}`)
        .then((eq) => setJobEquipment((prev) => ({ ...prev, [job.id]: eq })))
        .catch(() => setJobEquipment((prev) => ({ ...prev, [job.id]: null })))
    }
  }, [expandedId, jobs])

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

    const accentBar = {
      scheduled: "bg-primary",
      en_route: "bg-accent",
      in_progress: "bg-chart-4",
      completed: "bg-success",
      cancelled: "bg-destructive",
    }[job.status] ?? "bg-primary"

    return (
      <Card className={cn(
        "relative overflow-hidden border-border bg-card shadow-sm transition-all hover:shadow-md",
        isExpanded ? "ring-1 ring-primary/20" : "",
        job.status === "completed" && "opacity-90"
      )}>
        <span className={cn("absolute inset-y-0 left-0 w-1", accentBar)} aria-hidden="true" />
        <button onClick={() => setExpandedId(isExpanded ? null : job.id)} className="w-full text-left">
          <CardContent className="p-4 pl-5">
            <div className="flex items-start gap-3">
              <div className={cn("flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border", status.className)}>
                <StatusIcon className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold leading-snug text-card-foreground line-clamp-2">
                    {job.equipmentType
                      ? job.equipmentType.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())
                      : "Service"}
                    {job.symptomSummary ? ` — ${job.symptomSummary}` : ""}
                  </h3>
                  <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </span>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline" className={cn("rounded-full px-2 py-0 text-[10px] font-semibold uppercase tracking-wide", status.className)}>{status.label}</Badge>
                  {job.priority === "urgent" && (
                    <Badge variant="outline" className="gap-1 rounded-full border-destructive/30 bg-destructive/10 px-2 py-0 text-[10px] font-semibold uppercase text-destructive">
                      <AlertTriangle className="h-3 w-3" /> Urgent
                    </Badge>
                  )}
                </div>
                <div className="mt-2.5 flex items-center gap-4 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1.5"><User className="h-3.5 w-3.5" /><span className="font-medium text-foreground/80">{job.customer.name}</span></div>
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    <span className="tabular-nums">{scheduled.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
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

            {/* Equipment context block */}
            {job.equipmentId && jobEquipment[job.id] && (() => {
              const eq = jobEquipment[job.id]!
              const expired = eq.warrantyExpiry ? new Date(eq.warrantyExpiry) < new Date() : false
              return (
                <div className="mx-3 mb-3 rounded-lg border border-border bg-muted p-3 text-xs space-y-1">
                  <div className="font-semibold text-foreground text-xs uppercase tracking-wide mb-1">Equipment</div>
                  <div className="font-medium">{[eq.make, eq.model].filter(Boolean).join(" ") || eq.equipmentType} — {eq.equipmentType}</div>
                  {eq.serialNumber && <div className="text-muted-foreground">S/N: {eq.serialNumber}</div>}
                  <div className="flex gap-3 text-muted-foreground flex-wrap">
                    {eq.installDate && <span>Installed {new Date(eq.installDate).toLocaleDateString("en-US", { month: "short", year: "numeric" })}</span>}
                    {eq.warrantyExpiry && (
                      <span className={expired ? "text-destructive font-medium" : ""}>
                        Warranty {expired ? "EXPIRED" : `exp. ${new Date(eq.warrantyExpiry).toLocaleDateString("en-US", { month: "short", year: "numeric" })}`}
                      </span>
                    )}
                  </div>
                  {eq.lastServicedAt && (
                    <div className="text-muted-foreground">
                      Last serviced {new Date(eq.lastServicedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </div>
                  )}
                </div>
              )
            })()}

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

            {/* Photos */}
            <div className="rounded-lg border border-border bg-card p-4">
              <h3 className="mb-3 text-sm font-semibold text-card-foreground">Photos</h3>
              <JobPhotos
                jobId={job.id}
                photos={job.photos ?? []}
                canUpload={true}
                onPhotosChange={(updatedPhotos) =>
                  setJobs((prev) =>
                    prev.map((j) => (j.id === job.id ? { ...j, photos: updatedPhotos } : j))
                  )
                }
              />
            </div>

            {(job.status === "in_progress" || job.status === "completed") && (
              <ComplianceForm
                jobId={job.id}
                equipmentType={job.equipmentType ?? null}
                onLogged={() => {/* no-op — ComplianceForm manages its own "logged" state */}}
              />
            )}

            {(job.status === "scheduled" || job.status === "en_route" || job.status === "in_progress") && (
              <Button
                size="sm"
                variant="outline"
                className="w-full gap-1 border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/10"
                onClick={() => setAskAiJob(job)}
              >
                <span className="text-xs">✦</span> Ask AI
              </Button>
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

  const today = new Date().toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="space-y-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{today}</p>
          <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-foreground">{"Today's Jobs"}</h1>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 to-primary/5 p-4">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <Wrench className="h-4 w-4" />
              </span>
              <span className="text-3xl font-bold tabular-nums text-foreground">{activeJobs.length}</span>
            </div>
            <p className="mt-2 text-xs font-medium text-muted-foreground">Active jobs</p>
          </div>
          <div className="rounded-2xl border border-success/20 bg-gradient-to-br from-success/10 to-success/5 p-4">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-success/15 text-success">
                <CheckCircle2 className="h-4 w-4" />
              </span>
              <span className="text-3xl font-bold tabular-nums text-foreground">{completedJobs.length}</span>
            </div>
            <p className="mt-2 text-xs font-medium text-muted-foreground">Completed today</p>
          </div>
        </div>
      </div>

      {activeJobs.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            <span className="text-xs font-semibold uppercase tracking-wider text-foreground">Active</span>
            <span className="text-xs text-muted-foreground">({activeJobs.length})</span>
          </div>
          {activeJobs.map((job) => (<JobCard key={job.id} job={job} />))}
        </div>
      )}

      {completedJobs.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-success" />
            <span className="text-xs font-semibold uppercase tracking-wider text-foreground">Completed</span>
            <span className="text-xs text-muted-foreground">({completedJobs.length})</span>
          </div>
          {completedJobs.map((job) => (<JobCard key={job.id} job={job} />))}
        </div>
      )}

      {activeJobs.length === 0 && completedJobs.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-16 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
            <Wrench className="h-7 w-7 text-muted-foreground/60" />
          </span>
          <p className="mt-4 text-sm font-medium text-foreground">No jobs assigned yet</p>
          <p className="mt-1 text-xs text-muted-foreground">New jobs will appear here when dispatched.</p>
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

      {askAiJob && (
        <AiChatPanel
          jobId={askAiJob.id}
          jobContext={{ equipmentType: askAiJob.equipmentType }}
          onClose={() => setAskAiJob(null)}
        />
      )}
    </div>
  )
}
