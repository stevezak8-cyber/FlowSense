import { useState, useEffect } from "react"
import { api } from "@/api/client"
import type { ApiTechnician, ApiJob } from "@/api/types"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  Award,
  Wrench,
  Mail,
  Phone,
  CheckCircle2,
  TrendingUp,
  Truck,
  Loader2,
} from "lucide-react"

const statusLabels: Record<string, string> = {
  scheduled: "Scheduled",
  en_route: "En Route",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
}

const statusStyles: Record<string, string> = {
  completed: "bg-success/15 text-success border-success/30",
  in_progress: "bg-accent/15 text-accent border-accent/30",
  en_route: "bg-chart-4/15 text-chart-4 border-chart-4/30",
  scheduled: "bg-primary/15 text-primary border-primary/30",
  cancelled: "bg-destructive/15 text-destructive border-destructive/30",
}

export default function TechnicianProfile() {
  const [technicians, setTechnicians] = useState<ApiTechnician[]>([])
  const [jobs, setJobs] = useState<ApiJob[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.get<ApiTechnician[]>("/api/technicians"),
      api.get<ApiJob[]>("/api/jobs"),
    ])
      .then(([techs, j]) => {
        setTechnicians(techs)
        setJobs(j)
      })
      .catch((e) => console.error("Failed to load profile:", e))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Loading profile...</span>
      </div>
    )
  }

  // Use first technician as the "current" technician
  const tech = technicians[0]
  if (!tech) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Wrench className="h-8 w-8 text-muted-foreground/50" />
        <p className="mt-3 text-sm text-muted-foreground">No technician profile found</p>
      </div>
    )
  }

  const myJobs = jobs.filter((j) => j.technicianId === tech.id)
  const activeJobs = myJobs.filter(
    (j) => j.status === "in_progress" || j.status === "scheduled" || j.status === "en_route"
  ).length
  const completedCount = myJobs.filter((j) => j.status === "completed").length
  const initials = tech.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Profile</h1>
        <p className="text-xs text-muted-foreground font-mono">Technician Details</p>
      </div>

      {/* Profile Header */}
      <Card className="border-border bg-card">
        <CardContent className="p-5">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16 border-2 border-primary/30">
              <AvatarFallback className="bg-primary/15 text-primary text-lg font-mono">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div>
              <h2 className="text-lg font-semibold text-card-foreground">{tech.name}</h2>
              <p className="text-xs text-muted-foreground font-mono">
                {tech.epa608Level ? `EPA 608 ${tech.epa608Level}` : "Technician"}
              </p>
              {tech.skills.length > 0 && (
                <p className="mt-1 text-sm text-primary capitalize">
                  {tech.skills.join(", ").replace(/-/g, " ")}
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="border-border bg-card">
          <CardContent className="p-3 text-center">
            <CheckCircle2 className="mx-auto h-5 w-5 text-success" />
            <div className="mt-1.5 text-xl font-bold text-card-foreground">{completedCount}</div>
            <p className="text-[10px] font-mono text-muted-foreground uppercase">Completed</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="p-3 text-center">
            <TrendingUp className="mx-auto h-5 w-5 text-primary" />
            <div className="mt-1.5 text-xl font-bold text-card-foreground">{activeJobs}</div>
            <p className="text-[10px] font-mono text-muted-foreground uppercase">Active</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="p-3 text-center">
            <Wrench className="mx-auto h-5 w-5 text-accent" />
            <div className="mt-1.5 text-xl font-bold text-card-foreground">{myJobs.length}</div>
            <p className="text-[10px] font-mono text-muted-foreground uppercase">Total Jobs</p>
          </CardContent>
        </Card>
      </div>

      {/* Contact */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Contact Info</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {tech.email && (
            <div className="flex items-center gap-3 text-sm text-card-foreground">
              <Mail className="h-4 w-4 text-muted-foreground" />
              {tech.email}
            </div>
          )}
          {tech.phone && (
            <div className="flex items-center gap-3 text-sm text-card-foreground">
              <Phone className="h-4 w-4 text-muted-foreground" />
              {tech.phone}
            </div>
          )}
          {tech.vehicle && (
            <div className="flex items-center gap-3 text-sm text-card-foreground">
              <Truck className="h-4 w-4 text-muted-foreground" />
              {tech.vehicle.name}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Certification */}
      {tech.epa608Level && (
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Certification</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge
              variant="outline"
              className="gap-1.5 rounded-md border-primary/30 bg-primary/10 px-2.5 py-1 text-xs text-primary"
            >
              <Award className="h-3 w-3" />
              EPA 608 — {tech.epa608Level}
            </Badge>
          </CardContent>
        </Card>
      )}

      {/* Recent Jobs */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Recent Job History</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {myJobs.length === 0 && (
            <p className="text-xs text-muted-foreground py-4 text-center">No jobs yet</p>
          )}
          {myJobs.slice(0, 10).map((job) => (
            <div
              key={job.id}
              className="flex items-center justify-between rounded-md border border-border bg-secondary/50 px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
                <div>
                  <p className="text-xs font-medium text-card-foreground">
                    {job.equipmentType
                      ? job.equipmentType.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())
                      : "Service"}
                  </p>
                  <p className="text-[10px] font-mono text-muted-foreground">
                    {job.customer.name}
                  </p>
                </div>
              </div>
              <Badge
                variant="outline"
                className={`rounded-sm px-1.5 py-0 text-[9px] font-mono uppercase border ${statusStyles[job.status] ?? statusStyles.scheduled}`}
              >
                {statusLabels[job.status] ?? job.status}
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
