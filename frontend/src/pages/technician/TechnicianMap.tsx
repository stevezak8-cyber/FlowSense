"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import { api } from "@/api/client"
import type { ApiJob } from "@/api/types"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { MapPin, Navigation, Clock, User, ExternalLink, AlertTriangle, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet"
import L from "leaflet"
import "leaflet/dist/leaflet.css"

// ── Helpers ──────────────────────────────────────────────────────────

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

// ── Custom numbered markers ──────────────────────────────────────────

function createNumberedIcon(n: number, isSelected: boolean) {
  return L.divIcon({
    className: "custom-pin",
    html: `<div style="
      width:${isSelected ? 36 : 28}px;
      height:${isSelected ? 36 : 28}px;
      border-radius:50%;
      background:${isSelected ? "oklch(0.72 0.15 192)" : "oklch(0.25 0.015 250)"};
      border:2px solid ${isSelected ? "oklch(0.85 0.10 192)" : "oklch(0.50 0.01 250)"};
      color:${isSelected ? "#0d1117" : "#e6edf3"};
      display:flex;align-items:center;justify-content:center;
      font-weight:700;font-size:${isSelected ? 14 : 12}px;font-family:monospace;
      box-shadow:0 2px 8px rgba(0,0,0,0.4);
      transition:all 0.2s;
    ">${n}</div>`,
    iconSize: [isSelected ? 36 : 28, isSelected ? 36 : 28],
    iconAnchor: [isSelected ? 18 : 14, isSelected ? 18 : 14],
    popupAnchor: [0, isSelected ? -20 : -16],
  })
}

// ── Geocoding ────────────────────────────────────────────────────────

interface GeocodedJob {
  job: ApiJob
  lat: number
  lng: number
}

async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`,
      { headers: { "User-Agent": "FlowSense-HVAC-App" } }
    )
    const data = await res.json()
    if (data.length > 0) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
    }
  } catch (e) {
    console.error("Geocode failed for:", address, e)
  }
  return null
}

// ── Map view controller ──────────────────────────────────────────────

function MapBoundsController({ points, selectedIdx }: { points: GeocodedJob[]; selectedIdx: number }) {
  const map = useMap()
  const prevCount = useRef(0)

  useEffect(() => {
    if (points.length === 0) return
    if (selectedIdx >= 0 && selectedIdx < points.length) {
      map.flyTo([points[selectedIdx].lat, points[selectedIdx].lng], 15, { duration: 0.8 })
    } else if (points.length !== prevCount.current) {
      // Fit bounds whenever new pins are added
      const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number]))
      map.fitBounds(bounds, { padding: [40, 40] })
    }
    prevCount.current = points.length
  }, [map, points, selectedIdx])

  return null
}

// ── Status styles ────────────────────────────────────────────────────

const statusColors: Record<string, string> = {
  scheduled: "bg-primary",
  en_route: "bg-accent",
  in_progress: "bg-accent",
  completed: "bg-success",
  cancelled: "bg-muted",
}

const statusLabels: Record<string, string> = {
  scheduled: "Scheduled",
  en_route: "En Route",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
}

// ── Map overlay spinner (shows while tiles load and geocoding runs) ──

function MapLoadingOverlay({ geocodedCount, totalCount }: { geocodedCount: number; totalCount: number }) {
  const allDone = geocodedCount >= totalCount && totalCount > 0
  if (allDone) return null

  return (
    <div
      className="pointer-events-none absolute inset-0 z-[1000] flex flex-col items-center justify-center gap-2"
      style={{ background: "rgba(13,17,23,0.55)", backdropFilter: "blur(2px)" }}
    >
      <Loader2 className="h-5 w-5 animate-spin text-white/80" />
      <span className="text-xs font-mono text-white/70">
        {geocodedCount === 0
          ? "Finding locations…"
          : `Located ${geocodedCount} of ${totalCount}`}
      </span>
    </div>
  )
}

// ── Main Page ────────────────────────────────────────────────────────

export default function TechMapPage() {
  const [jobs, setJobs] = useState<ApiJob[]>([])
  const [geocoded, setGeocoded] = useState<GeocodedJob[]>([])
  const [geocodingTotal, setGeocodingTotal] = useState(0)
  const [selectedIdx, setSelectedIdx] = useState(-1)
  // Start as true — we're always "loading" until jobs + geocoding resolve
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
      .catch((e) => {
        console.error("Failed to fetch jobs:", e)
        setLoading(false)
      })
    return () => { cancelRef.current = true }
  }, [])

  // Geocode incrementally — stream pins onto map as each address resolves
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
          setGeocoded((prev) => {
            const next = [...prev, { job, ...coords }]
            return next
          })
          if (firstPin) {
            // As soon as the first pin arrives, hide the full-page spinner
            setLoading(false)
            firstPin = false
          }
        }
        // Respect Nominatim rate limit (1 req/sec)
        await new Promise((r) => setTimeout(r, 1100))
      }
      // If nothing geocoded, stop loading anyway
      setLoading(false)
    }

    geocodeAll()
  }, [jobs])

  const routePolyline = useMemo(
    () => geocoded.map((g) => [g.lat, g.lng] as [number, number]),
    [geocoded]
  )

  const selectedJob = selectedIdx >= 0 && selectedIdx < geocoded.length ? geocoded[selectedIdx] : null

  // ── Full-page loading (before any jobs or first pin) ──────────────
  if (loading) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-3">
        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
        <div className="text-center">
          <p className="text-sm font-medium text-foreground">
            {jobs.length === 0 ? "Loading jobs…" : "Finding your stops…"}
          </p>
          {jobs.length > 0 && (
            <p className="mt-1 text-xs text-muted-foreground font-mono">
              Located {geocoded.length} of {geocodingTotal}
            </p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Route Map</h1>
        <p className="text-xs text-muted-foreground font-mono">
          {jobs.length} stop{jobs.length !== 1 ? "s" : ""} today
          {geocoded.length < geocodingTotal && geocodingTotal > 0 && (
            <span className="ml-1 text-primary/70">
              · locating {geocoded.length}/{geocodingTotal}
            </span>
          )}
        </p>
      </div>

      {/* Leaflet Map */}
      <div className="relative h-64 overflow-hidden rounded-xl border border-border">
        {geocoded.length > 0 ? (
          <>
            <MapContainer
              center={[geocoded[0].lat, geocoded[0].lng]}
              zoom={12}
              scrollWheelZoom={true}
              style={{ height: "100%", width: "100%" }}
              className="z-0"
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              />
              <MapBoundsController points={geocoded} selectedIdx={selectedIdx} />

              {routePolyline.length > 1 && (
                <Polyline
                  positions={routePolyline}
                  pathOptions={{
                    color: "oklch(0.72 0.15 192)",
                    weight: 3,
                    dashArray: "8, 6",
                    opacity: 0.7,
                  }}
                />
              )}

              {geocoded.map((g, i) => (
                <Marker
                  key={g.job.id}
                  position={[g.lat, g.lng]}
                  icon={createNumberedIcon(i + 1, selectedIdx === i)}
                  eventHandlers={{ click: () => setSelectedIdx(i) }}
                >
                  <Popup>
                    <div style={{ color: "#0d1117", fontFamily: "system-ui", fontSize: 13 }}>
                      <strong>
                        {g.job.equipmentType
                          ? g.job.equipmentType.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())
                          : "Service"}
                      </strong>
                      <br />
                      <span style={{ fontSize: 11, color: "#57606a" }}>{g.job.customer.name}</span>
                      <br />
                      <span style={{ fontSize: 11, color: "#57606a" }}>{g.job.customer.address}</span>
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>

            {/* Overlay spinner while remaining addresses are still geocoding */}
            <MapLoadingOverlay geocodedCount={geocoded.length} totalCount={geocodingTotal} />
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 bg-secondary">
            <MapPin className="h-6 w-6 text-muted-foreground/40" />
            <span className="text-xs text-muted-foreground">No job locations to display</span>
          </div>
        )}
      </div>

      {/* Job stop cards */}
      <div className="space-y-3">
        <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
          Route Stops
        </span>
        {jobs.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <MapPin className="h-6 w-6 text-muted-foreground/50" />
            <p className="mt-2 text-sm text-muted-foreground">No active jobs</p>
          </div>
        )}
        {jobs.map((job) => {
          const geocodedIdx = geocoded.findIndex((g) => g.job.id === job.id)
          const isSelected = selectedIdx === geocodedIdx && geocodedIdx >= 0
          const scheduled = new Date(job.scheduledAt)
          const isMapped = geocodedIdx >= 0
          return (
            <Card
              key={job.id}
              className={cn(
                "border-border bg-card transition-all",
                isMapped ? "cursor-pointer hover:border-primary/30" : "opacity-60",
                isSelected && "border-primary/50 ring-1 ring-primary/20"
              )}
              onClick={() => { if (geocodedIdx >= 0) setSelectedIdx(geocodedIdx) }}
            >
              <CardContent className="p-3">
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                      isMapped
                        ? cn(statusColors[job.status] ?? "bg-secondary", "text-primary-foreground")
                        : "bg-secondary text-muted-foreground"
                    )}
                  >
                    {isMapped ? (
                      geocodedIdx + 1
                    ) : (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-card-foreground truncate">
                        {job.equipmentType
                          ? job.equipmentType.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())
                          : "Service"}
                        {job.symptomSummary ? ` — ${job.symptomSummary}` : ""}
                      </span>
                      {job.priority === "urgent" && (
                        <AlertTriangle className="h-3 w-3 flex-shrink-0 text-destructive" />
                      )}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                      <MapPin className="h-3 w-3" />
                      <span className="truncate">{job.customer.address}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-3">
                      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <User className="h-2.5 w-2.5" />
                        {job.customer.name}
                      </div>
                      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <Clock className="h-2.5 w-2.5" />
                        {scheduled.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </div>
                      <span className={cn(
                        "text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded",
                        statusColors[job.status] ?? "bg-secondary",
                        "text-primary-foreground"
                      )}>
                        {statusLabels[job.status] ?? job.status}
                      </span>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0 text-primary hover:bg-primary/10"
                    onClick={(e) => {
                      e.stopPropagation()
                      openDirections(job.customer.address)
                    }}
                  >
                    <Navigation className="h-4 w-4" />
                    <span className="sr-only">Navigate to {job.customer.address}</span>
                  </Button>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {selectedJob && (
        <Button
          className="w-full gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
          onClick={() => openDirections(selectedJob.job.customer.address)}
        >
          <ExternalLink className="h-4 w-4" />
          {isIOS() ? "Open in Apple Maps" : "Open in Google Maps"}
        </Button>
      )}
    </div>
  )
}
