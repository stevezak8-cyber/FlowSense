import { useState, useEffect } from "react"
import { api } from "@/api/client"
import type { ApiJob, Estimate, Equipment } from "@/api/types"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import {
  MapPin, Navigation, AlertTriangle,
  Wrench, CheckCircle2, Truck, User, Phone, Loader2, Sparkles, RefreshCw,
  Zap, TrendingUp, ChevronRight,
} from "lucide-react"
import { toast } from "sonner"
import { CompletionDialog } from "@/components/jobs/completion-dialog"
import { EstimateBuilder } from "@/components/estimates/estimate-builder"
import { AiChatPanel } from "@/components/jobs/AiChatPanel"
import { ComplianceForm } from "@/components/compliance/ComplianceForm"
import { JobPhotos } from "@/components/jobs/JobPhotos"

type ApiStatus = ApiJob["status"]
type TabType = "priority" | "active" | "completed" | "cancelled"

const font = "'Archivo', sans-serif"

const T = {
  bg: "#f3f2f2",
  text: "#201e1d",
  accent: "#ec3013",
  accentLight: "#ae1800",
  n300: "#d7d3d3",
  n400: "#c4bfbf",
  n500: "#a09b9b",
  n600: "#706c6c",
}

const statusFlow: Record<string, { next: ApiStatus; label: string; icon: typeof Wrench }> = {
  scheduled: { next: "en_route", label: "Start / En Route", icon: Truck },
  en_route: { next: "in_progress", label: "Arrived — Begin Work", icon: Wrench },
  in_progress: { next: "completed", label: "Mark Complete", icon: CheckCircle2 },
}

function initials(name: string) {
  return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()
}

function statusPillStyle(status: string): React.CSSProperties {
  switch (status) {
    case "en_route":
      return { background: T.accent, color: "#fff", border: "none" }
    case "in_progress":
      return { background: "#fce8e4", color: "#6b1200", border: "none" }
    case "scheduled":
      return { background: "transparent", color: T.text, border: `1px solid ${T.text}` }
    case "completed":
    case "cancelled":
    default:
      return { background: "transparent", color: T.n600, border: `1px solid ${T.n300}` }
  }
}

function statusLabel(status: string) {
  const map: Record<string, string> = {
    scheduled: "SCHEDULED",
    en_route: "EN ROUTE",
    in_progress: "IN PROGRESS",
    completed: "COMPLETED",
    cancelled: "CANCELLED",
  }
  return map[status] ?? status.toUpperCase()
}

function dotColor(status: string) {
  if (status === "en_route" || status === "in_progress") return T.accent
  if (status === "completed" || status === "cancelled") return T.n400
  return T.n500
}

function avatarBg(status: string) {
  return status === "completed" || status === "cancelled" ? T.n400 : T.text
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
    function onSwMessage(e: MessageEvent) {
      if (e.data?.type === "SYNC_COMPLETE") fetchJobs()
    }
    navigator.serviceWorker?.addEventListener("message", onSwMessage)
    return () => navigator.serviceWorker?.removeEventListener("message", onSwMessage)
  }, [])

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
  const greeting = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening"
  const dateLabel = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })

  const tabJobs: Record<TabType, ApiJob[]> = {
    priority: priorityJobs.length > 0 ? priorityJobs : activeJobs,
    active: activeJobs,
    completed: completedJobs,
    cancelled: cancelledJobs,
  }

  const tabs: { key: TabType; label: string; count: number }[] = [
    { key: "priority", label: "PRIORITY", count: priorityJobs.length },
    { key: "active", label: "ACTIVE", count: activeJobs.length },
    { key: "completed", label: "COMPLETED", count: completedJobs.length },
    { key: "cancelled", label: "CANCELLED", count: cancelledJobs.length },
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

    const nextAction = statusFlow[job.status]
    const eq = jobEquipment[job.id]

    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "rgba(255,255,255,0.45)", backdropFilter: "blur(8px) saturate(130%)", WebkitBackdropFilter: "blur(8px) saturate(130%)", boxShadow: "inset 0 1px 0 0 rgba(255,255,255,0.75), inset 1px 0 0 0 rgba(255,255,255,0.488), 0 6px 14px -6px rgba(32,30,29,0.18)", overflowY: "auto", fontFamily: font, color: T.text }}>
        <div style={{ padding: "20px 20px 16px", borderBottom: `2px solid ${T.text}` }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
            <div>
              <div style={{ ...statusPillStyle(job.status), display: "inline-flex", alignItems: "center", borderRadius: 999, padding: "3px 10px", fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 8 }}>
                {statusLabel(job.status)}
              </div>
              <h2 style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.01em", margin: 0 }}>
                {job.equipmentType?.replace(/-/g, " ").replace(/\b\w/g, l => l.toUpperCase()) ?? "Service Call"}
              </h2>
              {job.symptomSummary && <p style={{ fontSize: 13, color: T.n600, marginTop: 4 }}>{job.symptomSummary}</p>}
            </div>
            <button onClick={() => setExpandedId(null)} style={{ background: "none", border: "none", color: T.n600, cursor: "pointer", fontSize: 18, padding: 4 }}>✕</button>
          </div>
        </div>

        <div style={{ flex: 1, padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(255,255,255,0.45)", backdropFilter: "blur(8px) saturate(130%)", WebkitBackdropFilter: "blur(8px) saturate(130%)", boxShadow: "inset 0 1px 0 0 rgba(255,255,255,0.75), inset 1px 0 0 0 rgba(255,255,255,0.488), 0 6px 14px -6px rgba(32,30,29,0.18)", border: `1px solid ${T.n300}`, borderRadius: 12, padding: "10px 12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
              <MapPin style={{ width: 14, height: 14, color: T.accent, flexShrink: 0 }} />
              <span>{job.customer.address}</span>
            </div>
            <Button size="sm" variant="outline"
              style={{ height: 28, gap: 4, borderRadius: 999, border: `1px solid ${T.n300}`, fontSize: 11, padding: "0 10px" }}
              onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(job.customer.address)}`, "_blank")}>
              <Navigation style={{ width: 12, height: 12 }} />Navigate
            </Button>
          </div>

          <div style={{ background: "rgba(255,255,255,0.45)", backdropFilter: "blur(8px) saturate(130%)", WebkitBackdropFilter: "blur(8px) saturate(130%)", boxShadow: "inset 0 1px 0 0 rgba(255,255,255,0.75), inset 1px 0 0 0 rgba(255,255,255,0.488), 0 6px 14px -6px rgba(32,30,29,0.18)", border: `1px solid ${T.n300}`, borderRadius: 12, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
            <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", color: T.n600 }}>CUSTOMER</p>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600 }}><User style={{ width: 14, height: 14, color: T.n500 }} />{job.customer.name}</div>
            {job.customer.phone && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                <Phone style={{ width: 14, height: 14, color: T.n500 }} />
                <a href={`tel:${job.customer.phone}`} style={{ color: T.accentLight, fontWeight: 600 }}>{job.customer.phone}</a>
              </div>
            )}
          </div>

          {job.symptomSummary && (
            <div style={{ background: "rgba(255,255,255,0.45)", backdropFilter: "blur(8px) saturate(130%)", WebkitBackdropFilter: "blur(8px) saturate(130%)", boxShadow: "inset 0 1px 0 0 rgba(255,255,255,0.75), inset 1px 0 0 0 rgba(255,255,255,0.488), 0 6px 14px -6px rgba(32,30,29,0.18)", border: `1px solid ${T.n300}`, borderRadius: 12, padding: "10px 12px" }}>
              <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", color: T.n600, marginBottom: 6 }}>NOTES</p>
              <p style={{ fontSize: 13, lineHeight: 1.5 }}>{job.symptomSummary}</p>
            </div>
          )}

          {eq && (
            <div style={{ background: "rgba(255,255,255,0.45)", backdropFilter: "blur(8px) saturate(130%)", WebkitBackdropFilter: "blur(8px) saturate(130%)", boxShadow: "inset 0 1px 0 0 rgba(255,255,255,0.75), inset 1px 0 0 0 rgba(255,255,255,0.488), 0 6px 14px -6px rgba(32,30,29,0.18)", border: `1px solid ${T.n300}`, borderRadius: 12, padding: "10px 12px" }}>
              <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", color: T.n600, marginBottom: 6 }}>EQUIPMENT</p>
              <p style={{ fontSize: 13, fontWeight: 600 }}>{[eq.make, eq.model].filter(Boolean).join(" ") || eq.equipmentType}</p>
              {eq.serialNumber && <p style={{ fontSize: 11, color: T.n600 }}>S/N: {eq.serialNumber}</p>}
            </div>
          )}

          {job.preArrivalNotes && (
            <div style={{ background: "rgba(255,255,255,0.45)", backdropFilter: "blur(8px) saturate(130%)", WebkitBackdropFilter: "blur(8px) saturate(130%)", boxShadow: "inset 0 1px 0 0 rgba(255,255,255,0.75), inset 1px 0 0 0 rgba(255,255,255,0.488), 0 6px 14px -6px rgba(32,30,29,0.18)", border: `1px solid ${T.accent}`, borderRadius: 12, padding: "10px 12px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Sparkles style={{ width: 13, height: 13, color: T.accent }} />
                  <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", color: T.accent }}>AI BRIEFING</span>
                </div>
                <Button size="sm" variant="ghost" style={{ height: 24, gap: 4, padding: "0 8px", fontSize: 10, color: T.n600 }}
                  onClick={handleRegenerate} disabled={regenerating}>
                  {regenerating ? <Loader2 style={{ width: 12, height: 12 }} className="animate-spin" /> : <RefreshCw style={{ width: 12, height: 12 }} />}Regenerate
                </Button>
              </div>
              <p style={{ fontSize: 12, lineHeight: 1.5 }}>{job.preArrivalNotes}</p>
              {job.suggestedParts.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", color: T.n600, marginBottom: 6 }}>PARTS</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {job.suggestedParts.map(p => <span key={p} style={{ border: `1px solid ${T.n300}`, borderRadius: 999, padding: "2px 8px", fontSize: 10, fontWeight: 600 }}>{p}</span>)}
                  </div>
                </div>
              )}
              {job.riskFlags.length > 0 && (
                <div style={{ marginTop: 10, border: `1px solid #f5c842`, background: "#fffbeb", borderRadius: 8, padding: "8px 10px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                    <AlertTriangle style={{ width: 12, height: 12, color: "#d97706" }} />
                    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", color: "#92400e" }}>RISK FLAGS</span>
                  </div>
                  {job.riskFlags.map(f => <p key={f} style={{ fontSize: 12, color: "#92400e" }}>{f}</p>)}
                </div>
              )}
            </div>
          )}

          <div style={{ background: "rgba(255,255,255,0.45)", backdropFilter: "blur(8px) saturate(130%)", WebkitBackdropFilter: "blur(8px) saturate(130%)", boxShadow: "inset 0 1px 0 0 rgba(255,255,255,0.75), inset 1px 0 0 0 rgba(255,255,255,0.488), 0 6px 14px -6px rgba(32,30,29,0.18)", border: `1px solid ${T.n300}`, borderRadius: 12, padding: "10px 12px" }}>
            <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", color: T.n600, marginBottom: 8 }}>PHOTOS</p>
            <JobPhotos jobId={job.id} photos={job.photos ?? []} canUpload={true}
              onPhotosChange={(photos) => setJobs((prev) => prev.map((j) => (j.id === job.id ? { ...j, photos } : j)))} />
          </div>

          {(job.status === "in_progress" || job.status === "completed") && (
            <ComplianceForm jobId={job.id} equipmentType={job.equipmentType ?? null} onLogged={() => {}} />
          )}
        </div>

        <div style={{ padding: "12px 20px 24px", borderTop: `2px solid ${T.text}`, display: "flex", flexDirection: "column", gap: 8 }}>
          {(job.status === "scheduled" || job.status === "en_route" || job.status === "in_progress") && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <button
                onClick={() => { setAskAiJob(job); setExpandedId(null) }}
                style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, border: `2px solid ${T.text}`, borderRadius: 12, padding: "10px", background: "transparent", cursor: "pointer", fontFamily: font, fontWeight: 700, fontSize: 13, color: T.text }}
              >
                <Sparkles style={{ width: 14, height: 14 }} />Ask AI
              </button>
              <button
                onClick={() => handleCreateEstimate(job)}
                disabled={generatingEstimate && estimateJob?.id === job.id}
                style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, border: `2px solid ${T.text}`, borderRadius: 12, padding: "10px", background: "transparent", cursor: "pointer", fontFamily: font, fontWeight: 700, fontSize: 13, color: T.text }}
              >
                {generatingEstimate && estimateJob?.id === job.id
                  ? <Loader2 style={{ width: 14, height: 14 }} className="animate-spin" />
                  : <Zap style={{ width: 14, height: 14 }} />}
                Estimate
              </button>
            </div>
          )}
          {nextAction && (
            <button
              onClick={() => nextAction.next === "completed" ? setCompletingJob(job) : handleStatusChange(job.id, nextAction.next)}
              style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: T.accent, color: "#fff", border: "none", borderRadius: 12, padding: "12px", cursor: "pointer", fontFamily: font, fontWeight: 800, fontSize: 14, letterSpacing: "-0.01em" }}
            >
              <nextAction.icon style={{ width: 16, height: 16 }} />{nextAction.label}
            </button>
          )}
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh", fontFamily: font }}>
        <Loader2 style={{ width: 24, height: 24, color: T.n500 }} className="animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "64px 16px", textAlign: "center", fontFamily: font }}>
        <AlertTriangle style={{ width: 32, height: 32, color: T.accent }} />
        <p style={{ fontSize: 13, color: T.n600 }}>{error}</p>
        <button onClick={fetchJobs} style={{ display: "flex", alignItems: "center", gap: 8, border: `2px solid ${T.text}`, borderRadius: 8, padding: "8px 14px", background: "transparent", cursor: "pointer", fontFamily: font, fontWeight: 700, fontSize: 12 }}>
          <RefreshCw style={{ width: 14, height: 14 }} />Retry
        </button>
      </div>
    )
  }

  const visibleJobs = tabJobs[activeTab]

  return (
    <div style={{ margin: 8, borderRadius: 28, overflow: "hidden", fontFamily: font, background: "rgba(255,255,255,0.55)", backdropFilter: "blur(8px) saturate(130%)", WebkitBackdropFilter: "blur(8px) saturate(130%)", border: "1px solid rgba(255,255,255,0.55)", boxShadow: "inset 0 1px 0 0 rgba(255,255,255,0.6), inset 1px 0 0 0 rgba(255,255,255,0.39), 0 20px 40px -20px rgba(0,0,0,0.25)", color: T.text, display: "flex", flexDirection: "column" }}>

      {/* Greeting */}
      <div style={{ padding: "20px 16px 16px" }}>
        <div style={{ fontSize: 10, letterSpacing: "0.16em", color: T.n600, textTransform: "uppercase" }}>{dateLabel}</div>
        <div style={{ fontWeight: 800, fontSize: 30, lineHeight: 1.05, letterSpacing: "-0.03em", marginTop: 6 }}>
          Good {greeting},<br />Jordan
        </div>
      </div>

      {/* Stats row */}
      <div style={{ borderTop: `2px solid ${T.text}`, display: "grid", gridTemplateColumns: "repeat(3, 1fr)" }}>
        <div style={{ padding: "14px 16px", borderRight: `1px solid ${T.n300}` }}>
          <div style={{ fontWeight: 800, fontSize: 30, lineHeight: 1, letterSpacing: "-0.03em" }}>{totalJobs}</div>
          <div style={{ fontSize: 9, letterSpacing: "0.12em", color: T.n600, marginTop: 6 }}>JOBS · TODAY</div>
        </div>
        <div style={{ padding: "14px 16px", borderRight: `1px solid ${T.n300}` }}>
          <div style={{ fontWeight: 800, fontSize: 30, lineHeight: 1, letterSpacing: "-0.03em", color: T.accent }}>{activeJobs.length}</div>
          <div style={{ fontSize: 9, letterSpacing: "0.12em", color: T.n600, marginTop: 6 }}>ACTIVE</div>
        </div>
        <div style={{ padding: "14px 16px" }}>
          <div style={{ fontWeight: 800, fontSize: 30, lineHeight: 1, letterSpacing: "-0.03em" }}>{completedJobs.length}</div>
          <div style={{ fontSize: 9, letterSpacing: "0.12em", color: T.n600, marginTop: 6 }}>DONE</div>
        </div>
      </div>

      {/* Day progress */}
      <div style={{ borderTop: `1px solid ${T.n300}`, padding: "14px 16px" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <div style={{ fontSize: 10, letterSpacing: "0.14em", color: T.n600 }}>DAY PROGRESS</div>
          <div style={{ fontWeight: 800, fontSize: 14 }}>{progressPct}%</div>
        </div>
        <div style={{ height: 8, borderRadius: 999, background: T.n300, marginTop: 10, overflow: "hidden" }}>
          <div style={{ width: `${progressPct}%`, height: "100%", borderRadius: 999, background: T.accent, transition: "width 0.7s" }} />
        </div>
      </div>

      {/* Manage jobs */}
      <div style={{ borderTop: `2px solid ${T.text}`, padding: "14px 16px 0" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontWeight: 800, fontSize: 16, letterSpacing: "-0.01em" }}>Manage jobs</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, border: `1px solid ${T.text}`, borderRadius: 10, padding: "5px 9px", cursor: "pointer" }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={T.text} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em" }}>SEARCH</span>
          </div>
        </div>

        {/* Filter chips */}
        <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                background: activeTab === tab.key ? T.text : "transparent",
                color: activeTab === tab.key ? T.bg : T.n600,
                border: `1px solid ${activeTab === tab.key ? T.text : T.n400}`,
                borderRadius: 999,
                fontSize: 10,
                letterSpacing: "0.08em",
                padding: "4px 10px",
                cursor: "pointer",
                fontFamily: font,
                fontWeight: 600,
              }}
            >
              {tab.label} {tab.count}
            </button>
          ))}
        </div>

        {/* Column headers */}
        <div style={{ display: "grid", gridTemplateColumns: "32px 1fr auto", gap: 10, marginTop: 14, padding: "8px 0", borderTop: `1px solid ${T.n300}`, fontSize: 9, letterSpacing: "0.12em", color: T.n600 }}>
          <span></span><span>CUSTOMER · TASK</span><span>STATUS</span>
        </div>
      </div>

      {/* Job rows */}
      <div style={{ padding: "0 16px" }}>
        {visibleJobs.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 0", textAlign: "center" }}>
            <Wrench style={{ width: 28, height: 28, color: T.n400 }} />
            <p style={{ marginTop: 8, fontSize: 12, color: T.n600 }}>No jobs in this category</p>
          </div>
        ) : (
          visibleJobs.map((job) => {
            const equipmentLabel = job.equipmentType
              ? job.equipmentType.replace(/-/g, " ").replace(/\b\w/g, l => l.toUpperCase())
              : "Service Call"
            const scheduled = new Date(job.scheduledAt)

            return (
              <button
                key={job.id}
                onClick={() => setExpandedId(job.id)}
                style={{ display: "grid", gridTemplateColumns: "32px 1fr auto", gap: 10, alignItems: "center", padding: "12px 0", borderTop: `1px solid ${T.n300}`, borderLeft: "none", borderRight: "none", borderBottom: "none", width: "100%", background: "transparent", cursor: "pointer", textAlign: "left", fontFamily: font }}
              >
                <div style={{ width: 32, height: 32, borderRadius: 10, background: avatarBg(job.status), color: T.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, flexShrink: 0 }}>
                  {initials(job.customer.name)}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{job.customer.name}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
                    <span style={{ width: 6, height: 6, borderRadius: 999, background: dotColor(job.status), flexShrink: 0, display: "inline-block" }} />
                    <span style={{ fontSize: 10, color: T.n600 }}>{equipmentLabel} · {scheduled.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                  <span style={{ ...statusPillStyle(job.status), borderRadius: 999, fontSize: 9, letterSpacing: "0.1em", padding: "3px 8px", whiteSpace: "nowrap", fontWeight: 700 }}>
                    {statusLabel(job.status)}
                  </span>
                  <ChevronRight style={{ width: 14, height: 14, color: T.n500 }} />
                </div>
              </button>
            )
          })
        )}

        <div style={{ borderTop: `1px solid ${T.n300}`, padding: "12px 0 16px" }}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: T.accentLight }}>SEE ALL JOBS →</span>
        </div>
      </div>

      {/* AI Assistant */}
      <div style={{ borderTop: `2px solid ${T.text}`, padding: 16 }}>
        <div style={{ fontSize: 10, letterSpacing: "0.14em", color: T.n600 }}>ASSISTANT</div>
        <div style={{ fontWeight: 800, fontSize: 18, letterSpacing: "-0.01em", marginTop: 6 }}>How can I help you?</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 12 }}>
          {[
            { icon: Sparkles, label: "Ask about a job", iconColor: T.accent },
            { icon: Zap, label: "Generate estimate", iconColor: T.text },
            { icon: Wrench, label: "Troubleshoot issue", iconColor: T.text },
            { icon: TrendingUp, label: "Day summary", iconColor: T.text },
          ].map(({ icon: Icon, label, iconColor }) => (
            <button
              key={label}
              onClick={() => { if (activeJobs[0]) setAskAiJob(activeJobs[0]) }}
              style={{ border: `1px solid ${T.n300}`, borderRadius: 16, background: "rgba(255,255,255,0.45)", backdropFilter: "blur(8px) saturate(130%)", WebkitBackdropFilter: "blur(8px) saturate(130%)", boxShadow: "inset 0 1px 0 0 rgba(255,255,255,0.75), inset 1px 0 0 0 rgba(255,255,255,0.488), 0 6px 14px -6px rgba(32,30,29,0.18)", padding: 12, cursor: "pointer", textAlign: "left", fontFamily: font }}
            >
              <Icon style={{ width: 16, height: 16, color: iconColor }} />
              <div style={{ fontWeight: 700, fontSize: 12, marginTop: 10, color: T.text }}>{label}</div>
            </button>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, border: `2px solid ${T.text}`, borderRadius: 14, padding: "9px 12px", marginTop: 12 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={T.n600} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          <span style={{ fontSize: 13, color: T.n500 }}>Ask something…</span>
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
