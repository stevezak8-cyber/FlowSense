"use client"

import { useState, useEffect, useMemo } from "react"
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

/** Detect iOS (iPhone/iPad) for Apple Maps deep link */
function isIOS(): boolean {
  if (typeof navigator === "undefined") return false
  return /iPhone|iPad|iPod/i.test(navigator.userAgent)
}

/** Open directions: Apple Maps on iOS, Google Maps elsewhere */
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

// ── Geocoding (Nominatim – free, no key) ─────────────────────────────

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

  useEffect(() => {
    if (points.length === 0) return
    if (selectedIdx >= 0 && selectedIdx < points.length) {
      const p = points[selectedIdx]
      map.flyTo([p.lat, p.lng], 15, { duration: 0.8 })
    } else if (points.length > 0) {
      const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number]))
      map.fitBounds(bounds, { padding: [40, 40] })
    }
  }, [map, points, selectedIdx])

  return null
}

// ── Status colors ────────────────────────────────────────────────────

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

// ── Main Page ────────────────────────────────────────────────────────

export default function TechMapPage() {
  const [jobs, setJobs] = useState<ApiJob[]>([])
  const [geocoded, setGeocoded] = useState<GeocodedJob[]>([])
  const [selectedIdx, setSelectedIdx] = useState(-1)
  const [loading, setLoading] = useState(true)
  const [geocoding, setGeocoding] = useState(false)

  // Fetch jobs from API
  useEffect(() => {
    api.get<ApiJob[]>("/api/jobs")
      .then((all) => {
        const active = all.filter((j) => j.status !== "completed" && j.status !== "cancelled")
        setJobs(active)
      })
      .catch((e) => console.error("Failed to fetch jobs:", e))
      .finally(() => setLoading(false))
  }, [])

  // Geocode job addresses
  useEffect(() => {
    if (jobs.length === 0) return
    setGeocoding(true)
    const geocodeAll = async () => {
      const results: GeocodedJob[] = []
      for (const job of jobs) {
        const fullAddress = `${job.customer.address}`
        const coords = await geocodeAddress(fullAddress)
        if (coords) {
          results.push({ job, ...coords })
        }
        // Small delay to respect Nominatim rate limits (1 req/sec)
        await new Promise((r) => setTimeout(r, 1100))
      }
      setGeocoded(results)
      if (results.length > 0) setSelectedIdx(0)
      setGeocoding(false)
    }
    geocodeAll()
  }, [jobs])

  const routePolyline = useMemo(
    () => geocoded.map((g) => [g.lat, g.lng] as [number, number]),
    [geocoded]
  )

  const defaultCenter: [number, number] = [39.8283, -98.5795] // US center
  const selectedJob = selectedIdx >= 0 ? geocoded[selectedIdx] : null

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Loading jobs...</span>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Route Map</h1>
        <p className="text-xs text-muted-foreground font-mono">
          {jobs.length} stop{jobs.length !== 1 ? "s" : ""} today
          {geocoding && " · Mapping addresses..."}
        </p>
      </div>

      {/* Leaflet Map */}
      <div className="relative h-64 overflow-hidden rounded-xl border border-border">
        {geocoded.length > 0 ? (
          <MapContainer
            center={geocoded[0] ? [geocoded[0].lat, geocoded[0].lng] : defaultCenter}
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

            {/* Route polyline */}
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

            {/* Job pins */}
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
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 bg-secondary">
            {geocoding ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                <span className="text-xs text-muted-foreground font-mono">Mapping addresses...</span>
              </>
            ) : (
              <>
                <MapPin className="h-6 w-6 text-muted-foreground/40" />
                <span className="text-xs text-muted-foreground">No job locations to display</span>
              </>
            )}
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
        {jobs.map((job, i) => {
          const geocodedIdx = geocoded.findIndex((g) => g.job.id === job.id)
          const isSelected = selectedIdx === geocodedIdx && geocodedIdx >= 0
          const scheduled = new Date(job.scheduledAt)
          return (
            <Card
              key={job.id}
              className={cn(
                "border-border bg-card cursor-pointer transition-all",
                isSelected && "border-primary/50 ring-1 ring-primary/20"
              )}
              onClick={() => { if (geocodedIdx >= 0) setSelectedIdx(geocodedIdx) }}
            >
              <CardContent className="p-3">
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-primary-foreground",
                      statusColors[job.status] ?? "bg-secondary"
                    )}
                  >
                    {geocodedIdx >= 0 ? geocodedIdx + 1 : i + 1}
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

      {/* Full navigation button */}
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
