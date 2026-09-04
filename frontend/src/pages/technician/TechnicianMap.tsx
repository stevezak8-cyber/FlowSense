"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import { api } from "@/api/client"
import type { ApiJob } from "@/api/types"
import { Navigation, AlertTriangle, Loader2, ExternalLink, MapPin } from "lucide-react"
import { MapContainer, TileLayer, Marker, Polyline, useMap } from "react-leaflet"
import L from "leaflet"
import "leaflet/dist/leaflet.css"
import { useTheme } from "@/theme/theme-context"

const font = "'Archivo', sans-serif"

const LIGHT_T = {
  bg: "#f3f2f2",
  text: "#201e1d",
  accent: "#ec3013",
  accentLight: "#ae1800",
  accentTint: "#fde8e4",
  n300: "#d7d3d3",
  n400: "#c4bfbf",
  n500: "#a09b9b",
  n600: "#706c6c",
  n700: "#4a4646",
}

const DARK_T = {
  bg: "#1a1817",
  text: "#f3f2f2",
  accent: "#ec3013",
  accentLight: "#ff6b47",
  accentTint: "#3a1712",
  n300: "#3a3634",
  n400: "#524d4a",
  n500: "#726c69",
  n600: "#948e8a",
  n700: "#b8b2ae",
}

const T = { ...LIGHT_T }

const CORNER_GLOW_LIGHT = "radial-gradient(ellipse 70% 60% at 0% 0%, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0) 60%), radial-gradient(ellipse 70% 60% at 100% 100%, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 60%)"
const CORNER_GLOW_DARK = "radial-gradient(ellipse 70% 60% at 0% 0%, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 60%), radial-gradient(ellipse 70% 60% at 100% 100%, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0) 60%)"

function glassPanel(isDark: boolean): React.CSSProperties {
  return isDark
    ? { backgroundColor: "rgba(32,29,28,0.6)", backgroundImage: CORNER_GLOW_DARK, backgroundRepeat: "no-repeat", backdropFilter: "blur(8px) saturate(130%)", WebkitBackdropFilter: "blur(8px) saturate(130%)", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "inset 0 1px 0 0 rgba(255,255,255,0.18), inset 1px 0 0 0 rgba(255,255,255,0.11), inset 0 -1px 0 0 rgba(255,255,255,0.05), inset -1px 0 0 0 rgba(255,255,255,0.04), 0 20px 40px -20px rgba(0,0,0,0.5)" }
    : { backgroundColor: "rgba(255,255,255,0.55)", backgroundImage: CORNER_GLOW_LIGHT, backgroundRepeat: "no-repeat", backdropFilter: "blur(8px) saturate(130%)", WebkitBackdropFilter: "blur(8px) saturate(130%)", border: "1px solid rgba(255,255,255,0.55)", boxShadow: "inset 0 1px 0 0 rgba(255,255,255,0.7), inset 1px 0 0 0 rgba(255,255,255,0.45), inset 0 -1px 0 0 rgba(255,255,255,0.25), inset -1px 0 0 0 rgba(255,255,255,0.15), 0 20px 40px -20px rgba(0,0,0,0.25)" }
}

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false
  return /iPhone|iPad|iPod/i.test(navigator.userAgent)
}

function openDirections(address: string) {
  const encoded = encodeURIComponent(address)
  if (isIOS()) {
    window.open(`maps://maps.apple.com/?daddr=${encoded}`, "_blank")
  } else {
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${encoded}`, "_blank")
  }
}

function createNumberedIcon(n: number, isActive: boolean) {
  const size = isActive ? 34 : 28
  const bg = isActive ? T.accent : T.text
  return L.divIcon({
    className: "",
    html: `<div style="width:${size}px;height:${size}px;border-radius:10px;background:${bg};color:#fff;display:flex;align-items:center;justify-content:center;font-family:Archivo,sans-serif;font-weight:800;font-size:${isActive ? 15 : 13}px;box-shadow:0 2px 8px rgba(32,30,29,0.28)">${n}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

interface GeocodedJob {
  job: ApiJob
  lat: number
  lng: number
}

async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`,
      { headers: { "User-Agent": "Pneuros-HVAC-App" } }
    )
    const data = await res.json()
    if (data.length > 0) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
  } catch {}
  return null
}

function MapBoundsController({ points, selectedIdx }: { points: GeocodedJob[]; selectedIdx: number }) {
  const map = useMap()
  const prevCount = useRef(0)

  useEffect(() => {
    if (points.length === 0) return
    if (selectedIdx >= 0 && selectedIdx < points.length) {
      map.flyTo([points[selectedIdx].lat, points[selectedIdx].lng], 15, { duration: 0.8 })
    } else if (points.length !== prevCount.current) {
      const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number]))
      map.fitBounds(bounds, { padding: [46, 46] })
    }
    prevCount.current = points.length
  }, [map, points, selectedIdx])

  return null
}

function statusPill(status: string, isDark: boolean): React.CSSProperties {
  switch (status) {
    case "en_route": return { background: T.accent, color: "#fff", border: "none" }
    case "in_progress": return { background: T.accentTint, color: isDark ? "#ff9d80" : "#6b1200", border: "none" }
    case "scheduled": return { background: "transparent", color: T.text, border: `1px solid ${T.text}` }
    default: return { background: "transparent", color: T.n600, border: `1px solid ${T.n300}` }
  }
}

function statusLabel(status: string) {
  const m: Record<string, string> = { scheduled: "SCHEDULED", en_route: "EN ROUTE", in_progress: "IN PROGRESS", completed: "COMPLETED", cancelled: "CANCELLED" }
  return m[status] ?? status.toUpperCase()
}

export default function TechMapPage() {
  const { theme } = useTheme()
  const isDark = theme === "dark"
  Object.assign(T, isDark ? DARK_T : LIGHT_T)
  const panel = glassPanel(isDark)
  const [jobs, setJobs] = useState<ApiJob[]>([])
  const [geocoded, setGeocoded] = useState<GeocodedJob[]>([])
  const [geocodingTotal, setGeocodingTotal] = useState(0)
  const [selectedIdx, setSelectedIdx] = useState(-1)
  const [loading, setLoading] = useState(true)
  const cancelRef = useRef(false)

  useEffect(() => {
    cancelRef.current = false
    api.get<ApiJob[]>("/api/jobs")
      .then((all) => {
        const active = all.filter((j) => j.status !== "completed" && j.status !== "cancelled")
        setJobs(active)
        setGeocodingTotal(active.length)
        if (active.length === 0) setLoading(false)
      })
      .catch(() => setLoading(false))
    return () => { cancelRef.current = true }
  }, [])

  useEffect(() => {
    if (jobs.length === 0) return
    setGeocoded([])
    const geocodeAll = async () => {
      let firstPin = true
      for (const job of jobs) {
        if (cancelRef.current) break
        const coords = await geocodeAddress(job.customer.address)
        if (cancelRef.current) break
        if (coords) {
          setGeocoded((prev) => [...prev, { job, ...coords }])
          if (firstPin) { setLoading(false); firstPin = false }
        }
        await new Promise((r) => setTimeout(r, 1100))
      }
      setLoading(false)
    }
    geocodeAll()
  }, [jobs])

  const routePolyline = useMemo(
    () => geocoded.map((g) => [g.lat, g.lng] as [number, number]),
    [geocoded]
  )

  const selectedJob = selectedIdx >= 0 && selectedIdx < geocoded.length ? geocoded[selectedIdx] : null
  const nextJob = jobs[0]
  const nextEta = nextJob ? new Date(nextJob.scheduledAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"

  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "60vh", gap: 12, fontFamily: font }}>
        <Loader2 style={{ width: 24, height: 24, color: T.n500 }} className="animate-spin" />
        <p style={{ fontSize: 13, color: T.n600 }}>{jobs.length === 0 ? "Loading jobs…" : "Finding your stops…"}</p>
      </div>
    )
  }

  return (
    <div style={{ margin: 8, borderRadius: 28, overflow: "hidden", fontFamily: font, ...panel, color: T.text, display: "flex", flexDirection: "column" }}>

      {/* Title */}
      <div style={{ padding: "20px 16px 16px", display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontSize: 10, letterSpacing: "0.16em", color: T.n600, textTransform: "uppercase" }}>
            {jobs.length} stop{jobs.length !== 1 ? "s" : ""} today · Truck 04
          </div>
          <div style={{ fontWeight: 800, fontSize: 32, lineHeight: 1.02, letterSpacing: "-0.03em", marginTop: 6 }}>Route map</div>
        </div>
        {selectedJob && (
          <button
            onClick={() => openDirections(selectedJob.job.customer.address)}
            style={{ display: "flex", alignItems: "center", gap: 6, border: `2px solid ${T.text}`, borderRadius: 14, padding: "7px 11px", background: "transparent", cursor: "pointer", fontFamily: font, fontWeight: 700, fontSize: 12, color: T.text, marginBottom: 4 }}
          >
            <Navigation style={{ width: 14, height: 14 }} />
            Navigate
          </button>
        )}
      </div>

      {/* Map */}
      <div style={{ borderTop: `2px solid ${T.text}`, borderBottom: `2px solid ${T.text}`, height: 280, position: "relative" }}>
        {geocoded.length > 0 ? (
          <MapContainer
            center={[geocoded[0].lat, geocoded[0].lng]}
            zoom={12}
            scrollWheelZoom={false}
            style={{ height: "100%", width: "100%" }}
            zoomControl={false}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <style>{isDark
              ? `.leaflet-tile-pane { filter: grayscale(1) invert(1) contrast(0.9) brightness(0.85); }`
              : `.leaflet-tile-pane { filter: grayscale(1) contrast(1.05); }`}</style>
            <MapBoundsController points={geocoded} selectedIdx={selectedIdx} />
            {routePolyline.length > 1 && (
              <Polyline
                positions={routePolyline}
                pathOptions={{ color: T.text, weight: 2, dashArray: "7 6", opacity: 0.8 }}
              />
            )}
            {geocoded.map((g, i) => (
              <Marker
                key={g.job.id}
                position={[g.lat, g.lng]}
                icon={createNumberedIcon(i + 1, selectedIdx === i || i === 0)}
                eventHandlers={{ click: () => setSelectedIdx(i) }}
              />
            ))}
          </MapContainer>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 8, color: T.n500 }}>
            <MapPin style={{ width: 24, height: 24, opacity: 0.4 }} />
            <span style={{ fontSize: 12 }}>No job locations to display</span>
            {geocodingTotal > 0 && geocoded.length < geocodingTotal && (
              <span style={{ fontSize: 11, color: T.n600 }}>Locating {geocoded.length}/{geocodingTotal}…</span>
            )}
          </div>
        )}
      </div>

      {/* Stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", borderBottom: `1px solid ${T.n300}` }}>
        <div style={{ padding: "12px 16px", borderRight: `1px solid ${T.n300}` }}>
          <div style={{ fontWeight: 800, fontSize: 22, lineHeight: 1, letterSpacing: "-0.02em" }}>{geocoded.length}</div>
          <div style={{ fontSize: 9, letterSpacing: "0.12em", color: T.n600, marginTop: 5 }}>LOCATED</div>
        </div>
        <div style={{ padding: "12px 16px", borderRight: `1px solid ${T.n300}` }}>
          <div style={{ fontWeight: 800, fontSize: 22, lineHeight: 1, letterSpacing: "-0.02em" }}>{jobs.length}<span style={{ fontSize: 12, fontWeight: 700 }}> stops</span></div>
          <div style={{ fontSize: 9, letterSpacing: "0.12em", color: T.n600, marginTop: 5 }}>TODAY</div>
        </div>
        <div style={{ padding: "12px 16px" }}>
          <div style={{ fontWeight: 800, fontSize: 22, lineHeight: 1, letterSpacing: "-0.02em", color: T.accent }}>{nextEta}</div>
          <div style={{ fontSize: 9, letterSpacing: "0.12em", color: T.n600, marginTop: 5 }}>NEXT ETA</div>
        </div>
      </div>

      {/* Route stops header */}
      <div style={{ padding: "14px 16px 6px", display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <div style={{ fontWeight: 800, fontSize: 16, letterSpacing: "-0.01em" }}>Route stops</div>
        <span style={{ fontSize: 10, letterSpacing: "0.12em", color: T.n600 }}>{geocoded.length} LOCATED</span>
      </div>

      {/* Stop rows */}
      <div style={{ padding: "0 16px" }}>
        {jobs.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "40px 0", color: T.n500 }}>
            <MapPin style={{ width: 24, height: 24, opacity: 0.4 }} />
            <span style={{ fontSize: 12 }}>No active jobs</span>
          </div>
        ) : (
          jobs.map((job, i) => {
            const geocodedIdx = geocoded.findIndex((g) => g.job.id === job.id)
            const isMapped = geocodedIdx >= 0
            const stopNum = isMapped ? geocodedIdx + 1 : i + 1
            const isActive = stopNum === 1
            const scheduled = new Date(job.scheduledAt)
            const equipLabel = job.equipmentType
              ? job.equipmentType.replace(/-/g, " ").replace(/\b\w/g, l => l.toUpperCase())
              : "Service"

            return (
              <button
                key={job.id}
                onClick={() => { if (geocodedIdx >= 0) setSelectedIdx(geocodedIdx) }}
                style={{
                  display: "grid",
                  gridTemplateColumns: "32px 1fr 24px",
                  gap: 12,
                  alignItems: "center",
                  padding: "12px 0",
                  borderTop: `1px solid ${T.n300}`,
                  borderLeft: "none",
                  borderRight: "none",
                  borderBottom: "none",
                  width: "100%",
                  background: "transparent",
                  cursor: isMapped ? "pointer" : "default",
                  textAlign: "left",
                  fontFamily: font,
                  opacity: isMapped ? 1 : 0.6,
                }}
              >
                <div style={{ width: 32, height: 32, borderRadius: 10, background: isActive ? T.accent : T.text, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, flexShrink: 0 }}>
                  {isMapped ? stopNum : <Loader2 style={{ width: 14, height: 14 }} className="animate-spin" />}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {equipLabel}{job.symptomSummary ? ` — ${job.symptomSummary}` : ""}
                    </div>
                    {job.priority === "urgent" && (
                      <AlertTriangle style={{ width: 12, height: 12, color: T.accent, flexShrink: 0 }} />
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 3 }}>
                    <MapPin style={{ width: 11, height: 11, color: T.n500, flexShrink: 0 }} />
                    <span style={{ fontSize: 11, color: T.n700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{job.customer.address}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
                    <span style={{ fontSize: 10, color: T.n600 }}>{job.customer.name}</span>
                    <span style={{ fontSize: 10, color: T.n600 }}>{scheduled.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                    <span style={{ ...statusPill(job.status, isDark), borderRadius: 999, fontSize: 9, letterSpacing: "0.1em", padding: "2px 7px", fontWeight: 700 }}>
                      {statusLabel(job.status)}
                    </span>
                  </div>
                </div>
                <div
                  onClick={(e) => { e.stopPropagation(); openDirections(job.customer.address) }}
                  style={{ width: 18, height: 18, background: isActive ? T.accent : T.text, WebkitMask: "url(https://unpkg.com/lucide-static@0.544.0/icons/navigation.svg) center/contain no-repeat", mask: "url(https://unpkg.com/lucide-static@0.544.0/icons/navigation.svg) center/contain no-repeat", cursor: "pointer", flexShrink: 0 }}
                />
              </button>
            )
          })
        )}
      </div>

      {/* Open in maps CTA */}
      {(selectedJob ?? geocoded[0]) && (
        <div style={{ padding: 16 }}>
          <button
            onClick={() => openDirections((selectedJob ?? geocoded[0]).job.customer.address)}
            style={{ display: "flex", alignItems: "center", gap: 8, background: T.accent, color: "#fff", border: "none", borderRadius: 14, padding: "13px 16px", width: "100%", cursor: "pointer", fontFamily: font, fontWeight: 700, fontSize: 13 }}
          >
            <ExternalLink style={{ width: 16, height: 16 }} />
            {isIOS() ? "Open stop 1 in Apple Maps" : "Open stop 1 in Google Maps"}
          </button>
        </div>
      )}
    </div>
  )
}
