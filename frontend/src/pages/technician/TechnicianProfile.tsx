import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { api } from "@/api/client"
import type { ApiTechnician, ApiJob } from "@/api/types"
import { Loader2, ArrowUpDown } from "lucide-react"
import { useTheme } from "@/theme/theme-context"

// Exact modernist design system tokens
const LIGHT_T = {
  bg: "#f3f2f2",
  surface: "#eae9e9",
  text: "#201e1d",
  accent: "#ec3013",
  accentLight: "#ae1800",
  n200: "#eae7e7",
  n300: "#d7d3d3",
  n400: "#bab6b6",
  n500: "#9b9797",
  n600: "#7d7979",
  n700: "#605d5d",
}

const DARK_T = {
  bg: "#1a1817",
  surface: "#242120",
  text: "#f3f2f2",
  accent: "#ec3013",
  accentLight: "#ff6b47",
  n200: "#242120",
  n300: "#3a3634",
  n400: "#524d4a",
  n500: "#726c69",
  n600: "#948e8a",
  n700: "#b8b2ae",
}

const T = { ...LIGHT_T }

const CORNER_GLOW_LIGHT = "radial-gradient(ellipse 70% 60% at 0% 0%, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0) 60%), radial-gradient(ellipse 70% 60% at 100% 100%, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 60%)"
const CORNER_GLOW_DARK = "radial-gradient(ellipse 70% 60% at 0% 0%, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 60%), radial-gradient(ellipse 70% 60% at 100% 100%, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0) 60%)"

function glassCard(isDark: boolean): React.CSSProperties {
  return isDark
    ? { backgroundColor: "rgba(50,46,44,0.55)", backgroundImage: CORNER_GLOW_DARK, backgroundRepeat: "no-repeat", backdropFilter: "blur(8px) saturate(130%)", WebkitBackdropFilter: "blur(8px) saturate(130%)", boxShadow: "inset 0 1px 0 0 rgba(255,255,255,0.16), inset 1px 0 0 0 rgba(255,255,255,0.1), inset 0 -1px 0 0 rgba(255,255,255,0.05), inset -1px 0 0 0 rgba(255,255,255,0.04), 0 6px 14px -6px rgba(0,0,0,0.4)" }
    : { backgroundColor: "rgba(255,255,255,0.45)", backgroundImage: CORNER_GLOW_LIGHT, backgroundRepeat: "no-repeat", backdropFilter: "blur(8px) saturate(130%)", WebkitBackdropFilter: "blur(8px) saturate(130%)", boxShadow: "inset 0 1px 0 0 rgba(255,255,255,0.85), inset 1px 0 0 0 rgba(255,255,255,0.55), inset 0 -1px 0 0 rgba(255,255,255,0.3), inset -1px 0 0 0 rgba(255,255,255,0.2), 0 6px 14px -6px rgba(32,30,29,0.18)" }
}

function glassPanel(isDark: boolean): React.CSSProperties {
  return isDark
    ? { backgroundColor: "rgba(32,29,28,0.6)", backgroundImage: CORNER_GLOW_DARK, backgroundRepeat: "no-repeat", backdropFilter: "blur(8px) saturate(130%)", WebkitBackdropFilter: "blur(8px) saturate(130%)", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "inset 0 1px 0 0 rgba(255,255,255,0.18), inset 1px 0 0 0 rgba(255,255,255,0.11), inset 0 -1px 0 0 rgba(255,255,255,0.05), inset -1px 0 0 0 rgba(255,255,255,0.04), 0 20px 40px -20px rgba(0,0,0,0.5)" }
    : { backgroundColor: "rgba(255,255,255,0.55)", backgroundImage: CORNER_GLOW_LIGHT, backgroundRepeat: "no-repeat", backdropFilter: "blur(8px) saturate(130%)", WebkitBackdropFilter: "blur(8px) saturate(130%)", border: "1px solid rgba(255,255,255,0.55)", boxShadow: "inset 0 1px 0 0 rgba(255,255,255,0.7), inset 1px 0 0 0 rgba(255,255,255,0.45), inset 0 -1px 0 0 rgba(255,255,255,0.25), inset -1px 0 0 0 rgba(255,255,255,0.15), 0 20px 40px -20px rgba(0,0,0,0.25)" }
}

const STATUS_LABEL: Record<string, string> = {
  scheduled: "SCHEDULED",
  en_route: "EN ROUTE",
  in_progress: "IN PROGRESS",
  completed: "COMPLETED",
  cancelled: "CANCELLED",
}

const DAYS = ["M", "T", "W", "T", "F", "S", "S"]

function Icon({ name, size = 16, color = T.n700 }: { name: string; size?: number; color?: string }) {
  return (
    <span style={{
      display: "inline-block",
      width: size,
      height: size,
      flexShrink: 0,
      background: color,
      WebkitMask: `url(https://unpkg.com/lucide-static@0.544.0/icons/${name}.svg) center/contain no-repeat`,
      mask: `url(https://unpkg.com/lucide-static@0.544.0/icons/${name}.svg) center/contain no-repeat`,
    }} />
  )
}

export default function TechnicianProfile() {
  const { theme } = useTheme()
  const isDark = theme === "dark"
  Object.assign(T, isDark ? DARK_T : LIGHT_T)
  const card = glassCard(isDark)
  const panel = glassPanel(isDark)
  const navigate = useNavigate()
  const [tech, setTech] = useState<ApiTechnician | null>(null)
  const [jobs, setJobs] = useState<ApiJob[]>([])
  const [loading, setLoading] = useState(true)
  const [availability, setAvailability] = useState<"on_duty" | "break" | "off">("on_duty")
  const [editingEmail, setEditingEmail] = useState(false)
  const [editingPhone, setEditingPhone] = useState(false)
  const [emailVal, setEmailVal] = useState("")
  const [phoneVal, setPhoneVal] = useState("")
  const [saving, setSaving] = useState(false)
  const [jobSearch, setJobSearch] = useState("")
  const [jobFilter, setJobFilter] = useState<"all" | "active" | "done">("all")
  const [jobSort, setJobSort] = useState<"newest" | "oldest">("newest")
  const [jobView, setJobView] = useState<"list" | "grid">("list")

  useEffect(() => {
    api.get<{ role: string; profile: ApiTechnician & { jobs: ApiJob[] } }>("/api/auth/me/profile")
      .then((data) => {
        if (data.profile) {
          setTech(data.profile)
          setJobs(data.profile.jobs ?? [])
          setEmailVal(data.profile.email ?? "")
          setPhoneVal(data.profile.phone ?? "")
        }
      })
      .catch((e) => console.error("Failed to load profile:", e))
      .finally(() => setLoading(false))
  }, [])

  async function saveField(field: "email" | "phone") {
    if (!tech) return
    setSaving(true)
    try {
      const updated = await api.patch<ApiTechnician>(`/api/technicians/${tech.id}`, {
        [field]: field === "email" ? emailVal : phoneVal,
      })
      setTech({ ...tech, ...updated })
      if (field === "email") setEditingEmail(false)
      else setEditingPhone(false)
    } catch (e) {
      console.error("Failed to save:", e)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: "64px 0" }}>
        <Loader2 style={{ color: T.n500 }} className="h-5 w-5 animate-spin" />
      </div>
    )
  }

  if (!tech) return null

  const initials = tech.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)
  const nameParts = tech.name.split(" ")

  // Stats
  const allTime = jobs.length
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  const thisMonth = jobs.filter(j => j.scheduledAt && new Date(j.scheduledAt) >= monthStart).length
  const todayStr = new Date().toDateString()
  const todayCount = jobs.filter(j => j.scheduledAt && new Date(j.scheduledAt).toDateString() === todayStr).length

  // Utilization chart
  const today = new Date()
  const dayOfWeek = today.getDay()
  const weekStart = new Date(today); weekStart.setDate(today.getDate() - ((dayOfWeek + 6) % 7))
  const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 7)
  const weekJobs = jobs.filter(j => j.scheduledAt && new Date(j.scheduledAt) >= weekStart && new Date(j.scheduledAt) < weekEnd)
  const todayIdx = (dayOfWeek + 6) % 7
  const weekNum = Math.ceil((today.getTime() - new Date(today.getFullYear(), 0, 1).getTime()) / (7 * 86400000))
  const utilPct = Math.min(Math.round((weekJobs.length / 5) * 100), 100)

  const dayCounts = DAYS.map((_, i) => {
    const d = new Date(weekStart); d.setDate(weekStart.getDate() + i)
    return jobs.filter(j => j.scheduledAt && new Date(j.scheduledAt).toDateString() === d.toDateString()).length
  })
  const maxCount = Math.max(...dayCounts, 1)

  // Job filtering
  const activeCount = jobs.filter(j => ["scheduled", "en_route", "in_progress"].includes(j.status)).length
  const doneCount = jobs.filter(j => j.status === "completed").length
  const filteredJobs = jobs
    .filter(j => {
      if (jobFilter === "active") return ["scheduled", "en_route", "in_progress"].includes(j.status)
      if (jobFilter === "done") return j.status === "completed"
      return true
    })
    .filter(j => {
      if (!jobSearch) return true
      const q = jobSearch.toLowerCase()
      return (j.customer?.name ?? "").toLowerCase().includes(q) || (j.equipmentType ?? "").toLowerCase().includes(q)
    })
    .sort((a, b) => {
      const ta = a.scheduledAt ? new Date(a.scheduledAt).getTime() : 0
      const tb = b.scheduledAt ? new Date(b.scheduledAt).getTime() : 0
      return jobSort === "newest" ? tb - ta : ta - tb
    })

  function jobTime(scheduledAt: string | null | undefined) {
    if (!scheduledAt) return ""
    const d = new Date(scheduledAt)
    if (d.toDateString() === todayStr) return `TODAY ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase()
  }

  function jobStatusStyle(status: string): { background?: string; color: string; border: string } {
    if (status === "en_route" || status === "in_progress") {
      return { background: T.accent, color: "#fff", border: "none" }
    }
    if (status === "scheduled") {
      return { color: T.text, border: `1px solid ${T.text}` }
    }
    return { color: T.n600, border: `1px solid ${T.n300}` }
  }

  const font = "'Archivo', system-ui, sans-serif"

  return (
    <div style={{ margin: "8px auto", maxWidth: 560, borderRadius: 28, overflow: "hidden", fontFamily: font, ...panel, color: T.text, display: "flex", flexDirection: "column" }}>

      {/* Name + avatar */}
      <div style={{ padding: "20px 16px 16px", display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontFamily: font, fontSize: 10, letterSpacing: "0.16em", color: T.n600, textTransform: "uppercase" }}>
            Technician · ID {tech.id.slice(-4).toUpperCase()}
          </div>
          <div style={{ fontFamily: font, fontWeight: 800, fontSize: 32, lineHeight: 1.02, letterSpacing: "-0.03em", marginTop: 6 }}>
            {nameParts[0]}<br />{nameParts.slice(1).join(" ")}
          </div>
        </div>
        <div style={{
          width: 64, height: 64, background: T.text, color: T.bg,
          borderRadius: 18, display: "flex", alignItems: "flex-end",
          justifyContent: "flex-start", padding: 8, fontFamily: font,
          fontWeight: 600, fontSize: 20, flexShrink: 0,
        }}>
          {initials}
        </div>
      </div>

      {/* Cert + Vehicle */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderTop: `2px solid ${T.text}` }}>
        <div style={{ padding: "12px 16px", borderRight: `1px solid ${T.n300}` }}>
          <div style={{ fontFamily: font, fontSize: 9, letterSpacing: "0.14em", color: T.n600 }}>CERTIFICATION</div>
          <div style={{ fontWeight: 700, fontSize: 14, marginTop: 4 }}>
            {tech.epa608Level ? `EPA 608 ${tech.epa608Level}` : "—"}
          </div>
        </div>
        <div style={{ padding: "12px 16px" }}>
          <div style={{ fontFamily: font, fontSize: 9, letterSpacing: "0.14em", color: T.n600 }}>VEHICLE</div>
          <div style={{ fontWeight: 700, fontSize: 14, marginTop: 4 }}>{tech.vehicle?.name ?? "—"}</div>
        </div>
      </div>

      {/* Skills */}
      <div style={{ borderTop: `1px solid ${T.n300}`, padding: "12px 16px", display: "flex", flexWrap: "wrap", gap: 6 }}>
        {tech.skills.map(s => (
          <span key={s} style={{ border: `1px solid ${T.text}`, borderRadius: 999, padding: "4px 11px", fontSize: 11, fontWeight: 600 }}>
            {s.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
          </span>
        ))}
        <span style={{ border: `1px solid ${T.n400}`, borderRadius: 999, color: T.n600, padding: "4px 11px", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
          + Edit
        </span>
      </div>

      {/* Stats */}
      <div style={{ borderTop: `2px solid ${T.text}`, display: "grid", gridTemplateColumns: "repeat(3,1fr)" }}>
        {[
          { val: todayCount, label: "TODAY", accent: true },
          { val: thisMonth, label: "THIS MONTH", accent: false },
          { val: allTime, label: "ALL TIME", accent: false },
        ].map((s, i) => (
          <div key={s.label} style={{ padding: "14px 16px", borderRight: i < 2 ? `1px solid ${T.n300}` : undefined }}>
            <div style={{ fontFamily: font, fontWeight: 800, fontSize: 30, lineHeight: 1, letterSpacing: "-0.03em", color: s.accent ? T.accent : T.text }}>
              {s.val}
            </div>
            <div style={{ fontFamily: font, fontSize: 9, letterSpacing: "0.12em", color: T.n600, marginTop: 6 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Utilization */}
      <div style={{ borderTop: `1px solid ${T.n300}`, padding: "14px 16px" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <div style={{ fontFamily: font, fontSize: 10, letterSpacing: "0.14em", color: T.n600 }}>UTILIZATION · WK {weekNum}</div>
          <div style={{ fontWeight: 800, fontSize: 14 }}>{utilPct}%</div>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 5, height: 56, marginTop: 12 }}>
          {dayCounts.map((count, i) => {
            const heightPct = count === 0 ? 4 : Math.max(Math.round((count / maxCount) * 96), 12)
            const isToday = i === todayIdx
            return (
              <div key={i} style={{
                flex: 1,
                height: `${heightPct}%`,
                borderRadius: "4px 4px 0 0",
                background: isToday ? T.accent : count === 0 ? T.n200 : T.n300,
              }} />
            )
          })}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontFamily: font, fontSize: 9, color: T.n500 }}>
          {DAYS.map((d, i) => <span key={i}>{d}</span>)}
        </div>
      </div>

      {/* Availability + Contact */}
      <div style={{ borderTop: `2px solid ${T.text}`, padding: "14px 16px 0" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <div style={{ fontWeight: 800, fontSize: 16, letterSpacing: "-0.01em" }}>Availability</div>
          <span style={{ fontFamily: font, fontSize: 10, color: T.n600 }}>MON–FRI 07:00–17:00</span>
        </div>
        <div style={{ display: "flex", marginTop: 12, border: `2px solid ${T.text}`, borderRadius: 14, overflow: "hidden" }}>
          {(["on_duty", "break", "off"] as const).map((s, i) => (
            <button
              key={s}
              onClick={() => setAvailability(s)}
              style={{
                flex: 1, textAlign: "left", padding: "8px 10px",
                fontSize: 12, fontWeight: 700, fontFamily: font,
                background: availability === s ? T.accent : "transparent",
                color: availability === s ? "#fff" : T.text,
                border: "none",
                borderLeft: i > 0 ? `2px solid ${T.text}` : "none",
                cursor: "pointer",
              }}
            >
              {s === "on_duty" ? "On duty" : s === "break" ? "Break" : "Off"}
            </button>
          ))}
        </div>

        {/* Email */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0", marginTop: 12, borderTop: `1px solid ${T.n300}` }}>
          {editingEmail ? (
            <div style={{ display: "flex", flex: 1, alignItems: "center", gap: 8 }}>
              <Icon name="mail" size={14} />
              <input
                value={emailVal}
                onChange={e => setEmailVal(e.target.value)}
                autoFocus
                style={{ flex: 1, fontSize: 13, fontFamily: font, background: "transparent", border: "none", borderBottom: `1px solid ${T.n400}`, outline: "none", color: T.text }}
              />
              <button onClick={() => saveField("email")} disabled={saving}
                style={{ fontSize: 10, fontWeight: 700, color: T.accentLight, fontFamily: font, background: "none", border: "none", cursor: "pointer" }}>
                {saving ? "…" : "SAVE"}
              </button>
              <button onClick={() => setEditingEmail(false)}
                style={{ fontSize: 10, color: T.n500, fontFamily: font, background: "none", border: "none", cursor: "pointer" }}>
                Cancel
              </button>
            </div>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                <Icon name="mail" size={14} />
                {tech.email ?? "—"}
              </div>
              <button onClick={() => setEditingEmail(true)}
                style={{ fontFamily: font, fontSize: 10, color: T.accentLight, background: "none", border: "none", cursor: "pointer" }}>
                EDIT
              </button>
            </>
          )}
        </div>

        {/* Phone */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: 14 }}>
          {editingPhone ? (
            <div style={{ display: "flex", flex: 1, alignItems: "center", gap: 8 }}>
              <Icon name="phone" size={14} />
              <input
                value={phoneVal}
                onChange={e => setPhoneVal(e.target.value)}
                autoFocus
                style={{ flex: 1, fontSize: 13, fontFamily: font, background: "transparent", border: "none", borderBottom: `1px solid ${T.n400}`, outline: "none", color: T.text }}
              />
              <button onClick={() => saveField("phone")} disabled={saving}
                style={{ fontSize: 10, fontWeight: 700, color: T.accentLight, fontFamily: font, background: "none", border: "none", cursor: "pointer" }}>
                {saving ? "…" : "SAVE"}
              </button>
              <button onClick={() => setEditingPhone(false)}
                style={{ fontSize: 10, color: T.n500, fontFamily: font, background: "none", border: "none", cursor: "pointer" }}>
                Cancel
              </button>
            </div>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                <Icon name="phone" size={14} />
                {tech.phone ?? "—"}
              </div>
              <button onClick={() => setEditingPhone(true)}
                style={{ fontFamily: font, fontSize: 10, color: T.accentLight, background: "none", border: "none", cursor: "pointer" }}>
                EDIT
              </button>
            </>
          )}
        </div>
      </div>

      {/* Job history header */}
      <div style={{ borderTop: `2px solid ${T.text}`, padding: "14px 16px" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <div style={{ fontWeight: 800, fontSize: 16, letterSpacing: "-0.01em" }}>Job history</div>
          <div style={{ display: "flex", border: `1px solid ${T.text}`, borderRadius: 8, overflow: "hidden" }}>
            {(["list", "grid"] as const).map((v, i) => (
              <button key={v} onClick={() => setJobView(v)} style={{
                width: 26, height: 22, display: "flex", alignItems: "center", justifyContent: "center",
                background: jobView === v ? T.text : "transparent",
                border: "none", borderLeft: i > 0 ? `1px solid ${T.text}` : "none", cursor: "pointer",
              }}>
                <Icon name={v === "list" ? "list" : "layout-grid"} size={13} color={jobView === v ? T.bg : T.n600} />
              </button>
            ))}
          </div>
        </div>

        {/* Search */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, border: `2px solid ${T.text}`, borderRadius: 14, padding: "9px 12px", marginTop: 12 }}>
          <Icon name="search" size={15} color={T.n600} />
          <input
            value={jobSearch}
            onChange={e => setJobSearch(e.target.value)}
            placeholder="Search customer, equipment…"
            style={{ flex: 1, fontSize: 13, fontFamily: font, background: "transparent", border: "none", outline: "none", color: T.text }}
          />
        </div>

        {/* Filter chips */}
        <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
          {[
            { key: "all" as const, label: "ALL" },
            { key: "active" as const, label: `ACTIVE ${activeCount}` },
            { key: "done" as const, label: `DONE ${doneCount}` },
          ].map(({ key, label }) => (
            <button key={key} onClick={() => setJobFilter(key)} style={{
              background: jobFilter === key ? T.text : "transparent",
              color: jobFilter === key ? T.bg : T.n700,
              border: jobFilter === key ? "none" : `1px solid ${T.n400}`,
              borderRadius: 999, fontFamily: font, fontSize: 10, letterSpacing: "0.08em",
              padding: "4px 10px", cursor: "pointer",
            }}>{label}</button>
          ))}
          <button onClick={() => setJobSort(s => s === "newest" ? "oldest" : "newest")} style={{
            display: "flex", alignItems: "center", gap: 4,
            border: `1px solid ${T.n400}`, borderRadius: 999, fontFamily: font,
            fontSize: 10, letterSpacing: "0.08em", padding: "4px 10px",
            color: T.n700, background: "transparent", cursor: "pointer",
          }}>
            {jobSort === "newest" ? "NEWEST" : "OLDEST"}
            <ArrowUpDown style={{ width: 11, height: 11, color: T.n700 }} />
          </button>
        </div>
      </div>

      {/* Job cards */}
      <div style={jobView === "grid" ? { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, padding: "0 16px 8px" } : { padding: "0 0 8px" }}>
        {filteredJobs.length === 0 && (
          <p style={{ textAlign: "center", fontSize: 12, color: T.n500, padding: "24px 0" }}>No jobs found</p>
        )}
        {filteredJobs.slice(0, 20).map(job => {
          const ss = jobStatusStyle(job.status)
          return (
            <div key={job.id} style={{
              margin: jobView === "list" ? "0 16px 8px" : 0,
              border: `1px solid ${T.n300}`, borderRadius: 16,
              ...card, display: "flex", alignItems: "center",
              justifyContent: "space-between", padding: "12px 14px",
            }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>
                  {(job.equipmentType ?? "Service").replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
                </div>
                <div style={{ fontFamily: font, fontSize: 10, color: T.n600, marginTop: 3 }}>
                  {job.customer?.name?.toUpperCase()}{job.scheduledAt ? ` · ${jobTime(job.scheduledAt)}` : ""}
                </div>
              </div>
              <span style={{
                ...ss,
                borderRadius: 999, fontFamily: font,
                fontSize: 9, letterSpacing: "0.1em", padding: "3px 8px", whiteSpace: "nowrap",
              }}>
                {STATUS_LABEL[job.status] ?? job.status.toUpperCase()}
              </span>
            </div>
          )
        })}
      </div>

      {/* Password & security */}
      <div style={{ padding: "8px 16px 20px" }}>
        <button
          onClick={() => navigate("/technician/profile/password")}
          style={{
            width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
            border: `1px solid ${T.n300}`, borderRadius: 16, ...card,
            padding: 14, fontFamily: font, cursor: "pointer",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Icon name="lock" size={15} color={T.text} />
            <span style={{ fontWeight: 700, fontSize: 14 }}>Password &amp; security</span>
          </div>
          <Icon name="chevron-right" size={16} color={T.n600} />
        </button>
      </div>
    </div>
  )
}
