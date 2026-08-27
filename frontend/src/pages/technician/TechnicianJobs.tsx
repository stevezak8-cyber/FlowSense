import { useState, useEffect } from "react"
import { api } from "@/api/client"
import type { ApiJob, Estimate, Equipment } from "@/api/types"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import {
  MapPin, Clock, ChevronRight, Navigation, AlertTriangle,
  Wrench, CheckCircle2, Truck, User, Phone, Loader2, Sparkles, RefreshCw,
  Zap, TrendingUp, Calendar, Search,
} from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { CompletionDialog } from "@/components/jobs/completion-dialog"
import { EstimateBuilder } from "@/components/estimates/estimate-builder"
import { AiChatPanel } from "@/components/jobs/AiChatPanel"
import { ComplianceForm } from "@/components/compliance/ComplianceForm"
import { JobPhotos } from "@/components/jobs/JobPhotos"

type ApiStatus = ApiJob["status"]
type TabType = "priority" | "active" | "completed" | "cancelled"

const statusFlow: Record<string, { next: ApiStatus; label: string; icon: typeof Wrench }> = {
  scheduled: { next: "en_route", label: "Start / En Route", icon: Truck },
  en_route: { next: "in_progress", label: "Arrived — Begin Work", icon: Wrench },
  in_progress: { next: "completed", label: "Mark Complete", icon: CheckCircle2 },
}

const statusConfig: Record<string, { label: string; pill: string; icon: typeof Clock }> = {
  scheduled: { label: "Scheduled", pill: "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300", icon: Clock },
  en_route: { label: "En Route", pill: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300", icon: Truck },
  in_progress: { label: "In Progress", pill: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300", icon: Wrench },
  completed: { label: "Completed", pill: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300", icon: CheckCircle2 },
  cancelled: { label: "Cancelled", pill: "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400", icon: Clock },
}

const priorityDot: Record<string, string> = {
  low: "bg-slate-400",
  normal: "bg-violet-500",
  high: "bg-amber-500",
  urgent: "bg-rose-500",
}

function initials(name: string) {
  return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()
}

function avatarColor(name: string) {
  const colors = [
    "bg-violet-500", "bg-blue-500", "bg-emerald-500",
    "bg-amber-500", "bg-rose-500", "bg-indigo-500",
  ]
  let hash = 0
  for (const c of name) hash = (hash * 31 + c.charCodeAt(0)) & 0xffff
  return colors[hash % colors.length]
}

export default function TechnicianJobsPage() {
  const [jobs, setJobs] = useState<ApiJob[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<TabType>("priority")
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
      .catch(() => setError("Could not load jobs."))
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

  const priorityJobs = jobs.filter((j) => j.priority === "high" || j.priority === "urgent")
  const activeJobs = jobs.filter((j) => j.status !== "completed" && j.status !== "cancelled")
  const completedJobs = jobs.filter((j) => j.status === "completed")
  const cancelledJobs = jobs.filter((j) => j.status === "cancelled")
  const totalJobs = activeJobs.length + completedJobs.length
  const progressPct = totalJobs > 0 ? Math.round((completedJobs.length / totalJobs) * 100) : 0

  const hour = new Date().getHours()
  const firstName = "Jordan"
  const greeting = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening"

  const tabJobs: Record<TabType, ApiJob[]> = {
    priority: priorityJobs.length > 0 ? priorityJobs : activeJobs,
    active: activeJobs,
    completed: completedJobs,
    cancelled: cancelledJobs,
  }

  const tabs: { key: TabType; label: string; count: number }[] = [
    { key: "priority", label: "Priority", count: priorityJobs.length },
    { key: "active", label: "Active", count: activeJobs.length },
    { key: "completed", label: "Completed", count: completedJobs.length },
    { key: "cancelled", label: "Cancelled", count: cancelledJobs.length },
  ]

  function handleStatusChange(jobId: string, newStatus: ApiStatus) {
    api.patch<ApiJob>(`/api/jobs/${jobId}`, { status: newStatus })
      .then((updated) => setJobs((prev) => prev.map((j) => (j.id === updated.id ? updated : j))))
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

  // Job detail drawer
  function JobDetailDrawer({ job }: { job: ApiJob }) {
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

    const status = statusConfig[job.status] ?? statusConfig.scheduled
    const nextAction = statusFlow[job.status]
    const eq = jobEquipment[job.id]

    return (
      <div className="flex flex-col h-full bg-background overflow-y-auto">
        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b border-border/60">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold mb-2", status.pill)}>
                <status.icon className="h-3 w-3" />{status.label}
              </div>
              <h2 className="text-lg font-bold text-foreground">
                {job.equipmentType?.replace(/-/g, " ").replace(/\b\w/g, l => l.toUpperCase()) ?? "Service Call"}
              </h2>
              {job.symptomSummary && <p className="text-sm text-muted-foreground mt-0.5">{job.symptomSummary}</p>}
            </div>
            <button onClick={() => setExpandedId(null)} className="text-muted-foreground hover:text-foreground p-1">✕</button>
          </div>
        </div>

        <div className="flex-1 px-5 py-4 space-y-4">
          {/* Location */}
          <div className="flex items-center justify-between rounded-xl bg-muted/60 px-3 py-3">
            <div className="flex items-center gap-2 text-sm">
              <MapPin className="h-4 w-4 text-violet-500 flex-shrink-0" />
              <span className="text-xs font-medium">{job.customer.address}</span>
            </div>
            <Button size="sm" variant="outline"
              className="h-7 gap-1 rounded-full border-violet-200 text-violet-600 hover:bg-violet-50 dark:border-violet-500/30 dark:text-violet-400 text-xs px-3"
              onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(job.customer.address)}`, "_blank")}>
              <Navigation className="h-3 w-3" />Navigate
            </Button>
          </div>

          {/* Customer */}
          <div className="rounded-xl bg-muted/60 px-3 py-3 space-y-1.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Customer</p>
            <div className="flex items-center gap-2 text-sm font-medium"><User className="h-3.5 w-3.5 text-muted-foreground" />{job.customer.name}</div>
            {job.customer.phone && (
              <div className="flex items-center gap-2 text-sm">
                <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                <a href={`tel:${job.customer.phone}`} className="text-violet-600 dark:text-violet-400 hover:underline font-medium">{job.customer.phone}</a>
              </div>
            )}
          </div>

          {/* Notes */}
          {job.symptomSummary && (
            <div className="rounded-xl bg-muted/60 px-3 py-3 space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Notes</p>
              <p className="text-sm text-foreground leading-relaxed">{job.symptomSummary}</p>
            </div>
          )}

          {/* Equipment */}
          {eq && (
            <div className="rounded-xl bg-muted/60 px-3 py-3 space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Equipment</p>
              <p className="text-sm font-medium">{[eq.make, eq.model].filter(Boolean).join(" ") || eq.equipmentType}</p>
              {eq.serialNumber && <p className="text-xs text-muted-foreground">S/N: {eq.serialNumber}</p>}
            </div>
          )}

          {/* AI Briefing */}
          {job.preArrivalNotes && (
            <div className="rounded-xl border border-violet-200/60 bg-violet-50/60 dark:border-violet-500/20 dark:bg-violet-500/5 px-3 py-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-violet-600 dark:text-violet-400">AI Briefing</span>
                </div>
                <Button size="sm" variant="ghost" className="h-6 gap-1 px-2 text-[10px] text-muted-foreground"
                  onClick={handleRegenerate} disabled={regenerating}>
                  {regenerating ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}Regenerate
                </Button>
              </div>
              <p className="text-xs text-foreground leading-relaxed">{job.preArrivalNotes}</p>
              {job.suggestedParts.length > 0 && (
                <div className="mt-2.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Parts</p>
                  <div className="flex flex-wrap gap-1.5">
                    {job.suggestedParts.map(p => <span key={p} className="rounded-full bg-card border border-border px-2.5 py-0.5 text-[10px] font-medium">{p}</span>)}
                  </div>
                </div>
              )}
              {job.riskFlags.length > 0 && (
                <div className="mt-2.5 rounded-lg border border-amber-200 bg-amber-50/80 dark:border-amber-500/20 dark:bg-amber-500/5 px-2.5 py-2">
                  <div className="flex items-center gap-1 mb-1">
                    <AlertTriangle className="h-3 w-3 text-amber-500" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">Risk Flags</span>
                  </div>
                  {job.riskFlags.map(f => <p key={f} className="text-xs text-amber-700 dark:text-amber-400">{f}</p>)}
                </div>
              )}
            </div>
          )}

          {/* Photos */}
          <div className="rounded-xl border border-border/60 bg-card px-3 py-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Photos</p>
            <JobPhotos jobId={job.id} photos={job.photos ?? []} canUpload={true}
              onPhotosChange={(photos) => setJobs((prev) => prev.map((j) => (j.id === job.id ? { ...j, photos } : j)))} />
          </div>

          {(job.status === "in_progress" || job.status === "completed") && (
            <ComplianceForm jobId={job.id} equipmentType={job.equipmentType ?? null} onLogged={() => {}} />
          )}
        </div>

        {/* Actions */}
        <div className="px-5 pb-6 pt-2 space-y-2 border-t border-border/60">
          {(job.status === "scheduled" || job.status === "en_route" || job.status === "in_progress") && (
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" className="gap-1.5 rounded-xl border-violet-200 text-violet-600 hover:bg-violet-50 dark:border-violet-500/30 dark:text-violet-400"
                onClick={() => { setAskAiJob(job); setExpandedId(null) }}>
                <Sparkles className="h-3.5 w-3.5" />Ask AI
              </Button>
              <Button variant="outline" className="gap-1.5 rounded-xl"
                onClick={() => handleCreateEstimate(job)} disabled={generatingEstimate && estimateJob?.id === job.id}>
                {generatingEstimate && estimateJob?.id === job.id
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Zap className="h-3.5 w-3.5 text-violet-500" />}
                Estimate
              </Button>
            </div>
          )}
          {nextAction && (
            <Button className="w-full gap-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white"
              onClick={() => nextAction.next === "completed" ? setCompletingJob(job) : handleStatusChange(job.id, nextAction.next)}>
              <nextAction.icon className="h-4 w-4" />{nextAction.label}
            </Button>
          )}
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <AlertTriangle className="h-8 w-8 text-destructive" />
        <p className="text-sm text-muted-foreground">{error}</p>
        <Button size="sm" variant="outline" onClick={fetchJobs}><RefreshCw className="h-4 w-4 mr-2" />Retry</Button>
      </div>
    )
  }

  const visibleJobs = tabJobs[activeTab]

  return (
    <div className="space-y-5">
      {/* Greeting */}
      <div>
        <p className="text-sm text-muted-foreground">
          {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        </p>
        <h1 className="text-2xl font-bold text-foreground mt-0.5">
          Good {greeting}, {firstName} 👋
        </h1>
      </div>

      {/* Stat cards — LoopAI style */}
      <div className="grid grid-cols-3 gap-3">
        {/* Total jobs */}
        <div className="rounded-2xl bg-card shadow-[0_2px_12px_rgba(0,0,0,0.06)] dark:shadow-none dark:border dark:border-border p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-muted-foreground">Jobs</p>
            <span className="inline-flex items-center gap-0.5 rounded-full bg-violet-100 dark:bg-violet-500/20 px-1.5 py-0.5 text-[10px] font-bold text-violet-700 dark:text-violet-300">
              <TrendingUp className="h-2.5 w-2.5" />{totalJobs}
            </span>
          </div>
          <p className="text-3xl font-extrabold text-foreground leading-none">{totalJobs}</p>
          <p className="text-[10px] text-muted-foreground mt-1">Today's schedule</p>
        </div>

        {/* Active */}
        <div className="rounded-2xl bg-card shadow-[0_2px_12px_rgba(0,0,0,0.06)] dark:shadow-none dark:border dark:border-border p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-muted-foreground">Active</p>
            {activeJobs.length > 0 && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-100 dark:bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                <TrendingUp className="h-2.5 w-2.5" />{activeJobs.length}
              </span>
            )}
          </div>
          <p className="text-3xl font-extrabold text-violet-600 dark:text-violet-400 leading-none">{activeJobs.length}</p>
          <p className="text-[10px] text-muted-foreground mt-1">In progress</p>
        </div>

        {/* Done */}
        <div className="rounded-2xl bg-card shadow-[0_2px_12px_rgba(0,0,0,0.06)] dark:shadow-none dark:border dark:border-border p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-muted-foreground">Done</p>
            {completedJobs.length > 0 && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-100 dark:bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                +{completedJobs.length}
              </span>
            )}
          </div>
          <p className="text-3xl font-extrabold text-emerald-600 dark:text-emerald-400 leading-none">{completedJobs.length}</p>
          <p className="text-[10px] text-muted-foreground mt-1">{progressPct}% complete</p>
        </div>
      </div>

      {/* Progress bar */}
      {totalJobs > 0 && (
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Day progress</span>
            <span className="font-semibold text-foreground">{progressPct}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-emerald-500 transition-all duration-700" style={{ width: `${progressPct}%` }} />
          </div>
        </div>
      )}

      {/* Manage Jobs — LoopAI style */}
      <div className="rounded-2xl bg-card shadow-[0_2px_16px_rgba(0,0,0,0.06)] dark:shadow-none dark:border dark:border-border overflow-hidden">
        {/* Section header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-3">
          <h2 className="text-sm font-bold text-foreground">Manage Jobs</h2>
          <button className="text-muted-foreground hover:text-foreground">
            <Search className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs — like LoopAI */}
        <div className="px-4 pb-2">
          <div className="flex gap-1 overflow-x-auto no-scrollbar">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  "flex-shrink-0 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all",
                  activeTab === tab.key
                    ? "bg-violet-600 text-white shadow-sm"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                )}
              >
                {tab.label}
                {tab.count > 0 && (
                  <span className={cn(
                    "rounded-full px-1.5 py-0.5 text-[9px] font-bold leading-none",
                    activeTab === tab.key ? "bg-white/20 text-white" : "bg-background text-foreground"
                  )}>{tab.count}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Column headers */}
        <div className="grid grid-cols-[auto_1fr_auto] gap-2 px-4 py-2 border-t border-border/60">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Customer</span>
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Task</span>
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Status</span>
        </div>

        {/* Job rows */}
        <div className="divide-y divide-border/60">
          {visibleJobs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <Wrench className="h-7 w-7 text-muted-foreground/30" />
              <p className="mt-2 text-xs text-muted-foreground">No jobs in this category</p>
            </div>
          ) : (
            visibleJobs.map((job) => {
              const status = statusConfig[job.status] ?? statusConfig.scheduled
              const dot = priorityDot[job.priority] ?? priorityDot.normal
              const equipmentLabel = job.equipmentType
                ? job.equipmentType.replace(/-/g, " ").replace(/\b\w/g, l => l.toUpperCase())
                : "Service Call"
              const scheduled = new Date(job.scheduledAt)
              const color = avatarColor(job.customer.name)

              return (
                <button
                  key={job.id}
                  onClick={() => setExpandedId(job.id)}
                  className="w-full grid grid-cols-[auto_1fr_auto] gap-3 items-center px-4 py-3 hover:bg-muted/40 transition-colors text-left"
                >
                  {/* Avatar */}
                  <div className={cn("h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0", color)}>
                    <span className="text-[10px] font-bold text-white">{initials(job.customer.name)}</span>
                  </div>

                  {/* Task info */}
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-foreground truncate">{job.customer.name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className={cn("h-1.5 w-1.5 rounded-full flex-shrink-0", dot)} />
                      <p className="text-[10px] text-muted-foreground truncate">{equipmentLabel}</p>
                      <span className="text-[10px] text-muted-foreground flex-shrink-0">·</span>
                      <div className="flex items-center gap-0.5 text-[10px] text-muted-foreground flex-shrink-0">
                        <Calendar className="h-2.5 w-2.5" />
                        {scheduled.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </div>
                    </div>
                  </div>

                  {/* Status pill + arrow */}
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", status.pill)}>
                      {status.label}
                    </span>
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                </button>
              )
            })
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border/60 px-4 py-3">
          <button className="text-xs font-semibold text-violet-600 dark:text-violet-400 hover:underline">
            See all jobs →
          </button>
        </div>
      </div>

      {/* AI panel — LoopAI style */}
      <div className="rounded-2xl bg-gradient-to-br from-violet-50 to-indigo-50 dark:from-violet-500/10 dark:to-indigo-500/10 border border-violet-100 dark:border-violet-500/20 shadow-[0_2px_16px_rgba(0,0,0,0.06)] p-4">
        <p className="text-xs text-violet-600 dark:text-violet-400 font-medium">Hi, {firstName} 👋</p>
        <p className="text-base font-bold text-foreground mt-0.5 mb-3">How can I help you?</p>
        <div className="grid grid-cols-2 gap-2">
          {[
            { icon: Sparkles, label: "Ask about a job", color: "text-violet-600 bg-violet-100 dark:bg-violet-500/20 dark:text-violet-300" },
            { icon: Zap, label: "Generate estimate", color: "text-amber-600 bg-amber-100 dark:bg-amber-500/20 dark:text-amber-300" },
            { icon: Wrench, label: "Troubleshoot issue", color: "text-emerald-600 bg-emerald-100 dark:bg-emerald-500/20 dark:text-emerald-300" },
            { icon: TrendingUp, label: "Day summary", color: "text-blue-600 bg-blue-100 dark:bg-blue-500/20 dark:text-blue-300" },
          ].map(({ icon: Icon, label, color }) => (
            <button
              key={label}
              onClick={() => {
                if (activeJobs[0]) setAskAiJob(activeJobs[0])
              }}
              className="flex flex-col items-start gap-2 rounded-xl bg-card border border-border/60 shadow-sm px-3 py-3 hover:border-violet-300 dark:hover:border-violet-500/40 transition-colors"
            >
              <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center", color)}>
                <Icon className="h-4 w-4" />
              </div>
              <span className="text-xs font-semibold text-foreground leading-tight">{label}</span>
            </button>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-card border border-border/60 px-3 py-2.5">
          <Sparkles className="h-3.5 w-3.5 text-violet-500 flex-shrink-0" />
          <span className="text-xs text-muted-foreground flex-1">Ask something...</span>
        </div>
      </div>

      {/* Job detail sheet */}
      <Sheet open={!!expandedId} onOpenChange={(open) => !open && setExpandedId(null)}>
        <SheetContent side="bottom" className="h-[90vh] p-0 rounded-t-3xl">
          {expandedId && (() => {
            const job = jobs.find(j => j.id === expandedId)
            return job ? <JobDetailDrawer job={job} /> : null
          })()}
        </SheetContent>
      </Sheet>

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
              jobTitle={estimateJob.equipmentType?.replace(/-/g, " ").replace(/\b\w/g, l => l.toUpperCase()) ?? "Job"}
              jobNotes={estimateJob.symptomSummary}
              onPresent={() => setCurrentEstimate(null)}
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
