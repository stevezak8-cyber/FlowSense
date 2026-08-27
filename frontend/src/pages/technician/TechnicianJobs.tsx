import { useState, useEffect } from "react"
import { api } from "@/api/client"
import type { ApiJob, Estimate, Equipment } from "@/api/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import {
  MapPin, Clock, ChevronDown, ChevronUp, Navigation, AlertTriangle,
  Wrench, CheckCircle2, Truck, User, Phone, Loader2, Sparkles, RefreshCw,
  Zap, TrendingUp, Calendar,
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

const statusConfig: Record<string, { label: string; dot: string; badge: string; icon: typeof Wrench }> = {
  scheduled: { label: "Scheduled", dot: "bg-violet-500", badge: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-500/10 dark:text-violet-400 dark:border-violet-500/20", icon: Clock },
  en_route: { label: "En Route", dot: "bg-amber-500", badge: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20", icon: Truck },
  in_progress: { label: "In Progress", dot: "bg-blue-500 animate-pulse", badge: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20", icon: Wrench },
  completed: { label: "Completed", dot: "bg-emerald-500", badge: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20", icon: CheckCircle2 },
  cancelled: { label: "Cancelled", dot: "bg-muted-foreground", badge: "bg-muted text-muted-foreground border-border", icon: Clock },
}

const priorityStripe: Record<string, string> = {
  low: "bg-slate-300 dark:bg-slate-600",
  normal: "bg-violet-400",
  high: "bg-amber-400",
  urgent: "bg-rose-500",
}

export default function TechnicianJobsPage() {
  const [jobs, setJobs] = useState<ApiJob[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<"active" | "completed">("active")
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
  const totalJobs = activeJobs.length + completedJobs.length
  const progressPct = totalJobs > 0 ? Math.round((completedJobs.length / totalJobs) * 100) : 0

  const hour = new Date().getHours()
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"

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
      } catch {
        toast.error("Failed to regenerate briefing")
      } finally {
        setRegenerating(false)
      }
    }

    const isExpanded = expandedId === job.id
    const status = statusConfig[job.status] ?? statusConfig.scheduled
    const StatusIcon = status.icon
    const nextAction = statusFlow[job.status]
    const scheduled = new Date(job.scheduledAt)
    const stripe = priorityStripe[job.priority] ?? priorityStripe.normal
    const equipmentLabel = job.equipmentType
      ? job.equipmentType.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())
      : "Service Call"

    return (
      <div className="rounded-2xl bg-card shadow-sm border border-border/60 overflow-hidden">
        {/* Priority stripe */}
        <div className={cn("h-1 w-full", stripe)} />

        <button onClick={() => setExpandedId(isExpanded ? null : job.id)} className="w-full text-left px-4 pt-3 pb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className={cn("inline-block h-2 w-2 rounded-full flex-shrink-0", status.dot)} />
                <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold", status.badge)}>
                  <StatusIcon className="h-2.5 w-2.5" />{status.label}
                </span>
                {(job.priority === "high" || job.priority === "urgent") && (
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-rose-50 border border-rose-200 px-2 py-0.5 text-[10px] font-semibold text-rose-600 dark:bg-rose-500/10 dark:border-rose-500/20 dark:text-rose-400">
                    <AlertTriangle className="h-2.5 w-2.5" />
                    {job.priority === "urgent" ? "Urgent" : "High"}
                  </span>
                )}
              </div>
              <h3 className="text-sm font-bold text-foreground leading-snug">{equipmentLabel}</h3>
              {job.symptomSummary && (
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed line-clamp-1">{job.symptomSummary}</p>
              )}
              <div className="mt-2.5 flex items-center gap-3 text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <User className="h-3 w-3" />
                  <span className="font-medium text-foreground/80">{job.customer.name}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  <span>{scheduled.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                </div>
              </div>
            </div>
            <div className="flex-shrink-0 mt-1">
              {isExpanded
                ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                : <ChevronDown className="h-4 w-4 text-muted-foreground" />
              }
            </div>
          </div>
        </button>

        {isExpanded && (
          <div className="border-t border-border/60 px-4 pb-4 pt-3 space-y-3">
            {/* Location row */}
            <div className="flex items-center justify-between rounded-xl bg-muted/50 px-3 py-2.5">
              <div className="flex items-center gap-2 text-sm">
                <MapPin className="h-4 w-4 text-violet-500 flex-shrink-0" />
                <span className="text-foreground font-medium text-xs">{job.customer.address}</span>
              </div>
              <Button size="sm" variant="outline"
                className="h-7 gap-1 rounded-full border-violet-200 text-violet-600 hover:bg-violet-50 dark:border-violet-500/30 dark:text-violet-400 dark:hover:bg-violet-500/10 text-xs px-3"
                onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(job.customer.address)}`, "_blank")}>
                <Navigation className="h-3 w-3" />Navigate
              </Button>
            </div>

            {/* Customer */}
            <div className="rounded-xl bg-muted/50 px-3 py-2.5 space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Customer</p>
              <div className="flex items-center gap-2 text-xs font-medium text-foreground">
                <User className="h-3.5 w-3.5 text-muted-foreground" />{job.customer.name}
              </div>
              {job.customer.phone && (
                <div className="flex items-center gap-2 text-xs">
                  <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                  <a href={`tel:${job.customer.phone}`} className="text-violet-600 dark:text-violet-400 hover:underline font-medium">{job.customer.phone}</a>
                </div>
              )}
            </div>

            {/* Notes */}
            {(job.symptomSummary || job.equipmentNotes) && (
              <div className="rounded-xl bg-muted/50 px-3 py-2.5 space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Customer Notes</p>
                {job.symptomSummary && <p className="text-xs text-foreground leading-relaxed">{job.symptomSummary}</p>}
                {job.equipmentNotes && <p className="text-xs text-muted-foreground leading-relaxed">{job.equipmentNotes}</p>}
              </div>
            )}

            {/* Equipment */}
            {job.equipmentId && jobEquipment[job.id] && (() => {
              const eq = jobEquipment[job.id]!
              const expired = eq.warrantyExpiry ? new Date(eq.warrantyExpiry) < new Date() : false
              return (
                <div className="rounded-xl bg-muted/50 px-3 py-2.5 space-y-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Equipment</p>
                  <p className="text-xs font-medium text-foreground">{[eq.make, eq.model].filter(Boolean).join(" ") || eq.equipmentType} — {eq.equipmentType}</p>
                  {eq.serialNumber && <p className="text-xs text-muted-foreground">S/N: {eq.serialNumber}</p>}
                  <div className="flex gap-3 text-xs text-muted-foreground flex-wrap">
                    {eq.installDate && <span>Installed {new Date(eq.installDate).toLocaleDateString("en-US", { month: "short", year: "numeric" })}</span>}
                    {eq.warrantyExpiry && (
                      <span className={expired ? "text-rose-500 font-medium" : ""}>
                        Warranty {expired ? "EXPIRED" : `exp. ${new Date(eq.warrantyExpiry).toLocaleDateString("en-US", { month: "short", year: "numeric" })}`}
                      </span>
                    )}
                  </div>
                </div>
              )
            })()}

            {/* AI Briefing */}
            {job.preArrivalNotes && (
              <>
                <div className="rounded-xl border border-violet-200/60 bg-violet-50/60 dark:border-violet-500/20 dark:bg-violet-500/5 px-3 py-2.5">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-violet-600 dark:text-violet-400">AI Briefing</span>
                    </div>
                    <Button size="sm" variant="ghost" className="h-6 gap-1 px-2 text-[10px] text-muted-foreground hover:text-violet-600"
                      onClick={handleRegenerate} disabled={regenerating}>
                      {regenerating ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                      Regenerate
                    </Button>
                  </div>
                  <p className="text-xs text-foreground leading-relaxed">{job.preArrivalNotes}</p>
                </div>

                {job.suggestedParts.length > 0 && (
                  <div className="rounded-xl bg-muted/50 px-3 py-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Suggested Parts</p>
                    <div className="flex flex-wrap gap-1.5">
                      {job.suggestedParts.map((part) => (
                        <span key={part} className="rounded-full bg-card border border-border px-2.5 py-0.5 text-[10px] font-medium text-foreground">{part}</span>
                      ))}
                    </div>
                  </div>
                )}

                {job.suggestedTools.length > 0 && (
                  <div className="rounded-xl bg-muted/50 px-3 py-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Suggested Tools</p>
                    <div className="flex flex-wrap gap-1.5">
                      {job.suggestedTools.map((tool) => (
                        <span key={tool} className="rounded-full bg-card border border-border px-2.5 py-0.5 text-[10px] font-medium text-foreground">{tool}</span>
                      ))}
                    </div>
                  </div>
                )}

                {job.riskFlags.length > 0 && (
                  <div className="rounded-xl border border-amber-200/60 bg-amber-50/60 dark:border-amber-500/20 dark:bg-amber-500/5 px-3 py-2.5">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">Risk Flags</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {job.riskFlags.map((flag) => (
                        <span key={flag} className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[10px] font-medium text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400">{flag}</span>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Photos */}
            <div className="rounded-xl border border-border/60 bg-card px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Photos</p>
              <JobPhotos
                jobId={job.id}
                photos={job.photos ?? []}
                canUpload={true}
                onPhotosChange={(updatedPhotos) =>
                  setJobs((prev) => prev.map((j) => (j.id === job.id ? { ...j, photos: updatedPhotos } : j)))
                }
              />
            </div>

            {(job.status === "in_progress" || job.status === "completed") && (
              <ComplianceForm jobId={job.id} equipmentType={job.equipmentType ?? null} onLogged={() => {}} />
            )}

            {/* Action buttons */}
            <div className="space-y-2 pt-1">
              {(job.status === "scheduled" || job.status === "en_route" || job.status === "in_progress") && (
                <Button size="sm" variant="outline"
                  className="w-full gap-1.5 rounded-xl border-violet-200 text-violet-600 hover:bg-violet-50 dark:border-violet-500/30 dark:text-violet-400 dark:hover:bg-violet-500/10"
                  onClick={() => setAskAiJob(job)}>
                  <Sparkles className="h-3.5 w-3.5" /> Ask AI
                </Button>
              )}

              {(job.status === "scheduled" || job.status === "en_route" || job.status === "in_progress") && (
                <Button variant="outline" className="w-full gap-2 rounded-xl"
                  onClick={() => handleCreateEstimate(job)}
                  disabled={generatingEstimate && estimateJob?.id === job.id}>
                  {generatingEstimate && estimateJob?.id === job.id
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <Zap className="h-4 w-4 text-violet-500" />}
                  {generatingEstimate && estimateJob?.id === job.id ? "Generating…" : "Create Estimate"}
                </Button>
              )}

              {nextAction && (
                <Button className="w-full gap-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white"
                  onClick={() => nextAction.next === "completed" ? setCompletingJob(job) : handleStatusChange(job.id, nextAction.next)}>
                  <nextAction.icon className="h-4 w-4" />{nextAction.label}
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
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

  const visibleJobs = activeTab === "active" ? activeJobs : completedJobs

  return (
    <div className="space-y-4">
      {/* Greeting header */}
      <div className="pt-1">
        <p className="text-xs text-muted-foreground">
          {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        </p>
        <h1 className="text-2xl font-bold text-foreground mt-0.5">{greeting} 👋</h1>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-2.5">
        <div className="rounded-2xl bg-card border border-border/60 shadow-sm p-3 text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <p className="text-2xl font-extrabold text-foreground">{totalJobs}</p>
          <p className="text-[10px] text-muted-foreground font-medium mt-0.5">Total</p>
        </div>
        <div className="rounded-2xl bg-violet-50 border border-violet-100 dark:bg-violet-500/10 dark:border-violet-500/20 shadow-sm p-3 text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <TrendingUp className="h-3.5 w-3.5 text-violet-500" />
          </div>
          <p className="text-2xl font-extrabold text-violet-700 dark:text-violet-400">{activeJobs.length}</p>
          <p className="text-[10px] text-violet-600 dark:text-violet-400 font-medium mt-0.5">Active</p>
        </div>
        <div className="rounded-2xl bg-emerald-50 border border-emerald-100 dark:bg-emerald-500/10 dark:border-emerald-500/20 shadow-sm p-3 text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
          </div>
          <p className="text-2xl font-extrabold text-emerald-700 dark:text-emerald-400">{completedJobs.length}</p>
          <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium mt-0.5">Done</p>
        </div>
      </div>

      {/* Progress bar */}
      {totalJobs > 0 && (
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Day progress</span>
            <span className="font-semibold text-foreground">{progressPct}%</span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-emerald-500 transition-all duration-700" style={{ width: `${progressPct}%` }} />
          </div>
        </div>
      )}

      {/* Tab switcher */}
      <div className="flex rounded-xl bg-muted p-1 gap-1">
        <button
          onClick={() => setActiveTab("active")}
          className={cn(
            "flex-1 rounded-lg py-1.5 text-xs font-semibold transition-all",
            activeTab === "active"
              ? "bg-card shadow-sm text-foreground"
              : "text-muted-foreground"
          )}
        >
          Active {activeJobs.length > 0 && <span className="ml-1 rounded-full bg-violet-500 text-white px-1.5 py-0.5 text-[9px]">{activeJobs.length}</span>}
        </button>
        <button
          onClick={() => setActiveTab("completed")}
          className={cn(
            "flex-1 rounded-lg py-1.5 text-xs font-semibold transition-all",
            activeTab === "completed"
              ? "bg-card shadow-sm text-foreground"
              : "text-muted-foreground"
          )}
        >
          Completed {completedJobs.length > 0 && <span className="ml-1 rounded-full bg-emerald-500 text-white px-1.5 py-0.5 text-[9px]">{completedJobs.length}</span>}
        </button>
      </div>

      {/* Job list */}
      <div className="space-y-3">
        {visibleJobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Wrench className="h-8 w-8 text-muted-foreground/30" />
            <p className="mt-3 text-sm text-muted-foreground">
              {activeTab === "active" ? "No active jobs" : "No completed jobs yet"}
            </p>
          </div>
        ) : (
          visibleJobs.map((job) => <JobCard key={job.id} job={job} />)
        )}
      </div>

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
