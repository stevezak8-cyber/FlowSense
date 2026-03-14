import { useMemo } from "react"
import type { ApiTechnician, ApiJob } from "@/api/types"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { ArrowUpRight, Briefcase, Loader2 } from "lucide-react"
import { Link } from "react-router-dom"

type Availability = "on_job" | "available" | "off_duty"

const dotStyles: Record<Availability, string> = {
  on_job: "bg-primary",
  available: "bg-success",
  off_duty: "bg-muted-foreground/30",
}

const badgeStyles: Record<Availability, string> = {
  on_job: "bg-primary/10 text-primary",
  available: "bg-success/10 text-success",
  off_duty: "bg-muted text-muted-foreground",
}

const badgeLabels: Record<Availability, string> = {
  on_job: "On Job",
  available: "Available",
  off_duty: "Off Duty",
}

interface TechStatusProps {
  technicians: ApiTechnician[]
  jobs?: ApiJob[]
  loading?: boolean
}

export function TechStatus({ technicians, jobs, loading }: TechStatusProps) {
  const availabilityMap = useMemo(() => {
    const map = new Map<string, Availability>()
    if (!jobs) return map

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    const activeSet = new Set<string>()
    const scheduledTodaySet = new Set<string>()

    for (const job of jobs) {
      if (!job.technicianId) continue
      if (job.status === "en_route" || job.status === "in_progress") {
        activeSet.add(job.technicianId)
      }
      const scheduled = new Date(job.scheduledAt)
      if (scheduled >= today && scheduled < tomorrow && job.status !== "completed" && job.status !== "cancelled") {
        scheduledTodaySet.add(job.technicianId)
      }
    }

    for (const tech of technicians) {
      if (activeSet.has(tech.id)) {
        map.set(tech.id, "on_job")
      } else if (scheduledTodaySet.has(tech.id)) {
        map.set(tech.id, "available")
      } else {
        map.set(tech.id, "off_duty")
      }
    }

    return map
  }, [technicians, jobs])

  if (loading) {
    return (
      <div className="medops-card">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">Loading...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="medops-card">
      <div className="flex items-center justify-between px-6 py-5">
        <div>
          <h3 className="text-base font-bold text-card-foreground">
            Technician Roster
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {technicians.length} technician{technicians.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Link
          to="/office/technicians"
          className="flex items-center gap-1 text-xs font-medium text-success hover:text-success/80 transition-colors"
        >
          View all
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      <div className="divide-y divide-border/50">
        {technicians.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <Briefcase className="h-6 w-6 text-muted-foreground/40" />
            <p className="mt-2 text-sm text-muted-foreground">No technicians yet</p>
          </div>
        )}
        {technicians.map((tech) => {
          const initials = tech.name
            .split(" ")
            .map((n) => n[0])
            .join("")
            .toUpperCase()
            .slice(0, 2)
          const availability = availabilityMap.get(tech.id) ?? "off_duty"
          return (
            <div
              key={tech.id}
              className="flex items-center gap-3 px-6 py-4 transition-colors hover:bg-secondary/40"
            >
              <div className="relative">
                <Avatar className="h-10 w-10 border-2 border-primary/15">
                  <AvatarFallback className="bg-primary/8 text-xs text-primary font-semibold">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                {/* Status dot on avatar */}
                {jobs && (
                  <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card ${dotStyles[availability]}`} />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-card-foreground">
                    {tech.name}
                  </span>
                  {jobs && (
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium tracking-wide ${badgeStyles[availability]}`}>
                      {badgeLabels[availability]}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground capitalize">
                  {tech.skills.length > 0
                    ? tech.skills.join(", ").replace(/-/g, " ")
                    : "General"}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                {tech.vehicle && (
                  <span className="text-[10px] font-medium uppercase tracking-wider text-primary">
                    {tech.vehicle.name}
                  </span>
                )}
                {tech.epa608Level && (
                  <span className="text-[10px] text-muted-foreground">
                    EPA {tech.epa608Level}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
