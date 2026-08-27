import { useState, useEffect } from "react"
import { api } from "@/api/client"
import type { ApiTechnician, ApiJob } from "@/api/types"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
import { ChangePasswordCard } from "@/components/change-password-card"

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
  const [tech, setTech] = useState<ApiTechnician | null>(null)
  const [jobs, setJobs] = useState<ApiJob[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editForm, setEditForm] = useState({ name: "", phone: "", email: "", epa608Level: "", skills: "" })

  useEffect(() => {
    api.get<{ role: string; profile: ApiTechnician & { jobs: ApiJob[] } }>("/api/auth/me/profile")
      .then((data) => {
        if (data.profile) {
          setTech(data.profile)
          setJobs(data.profile.jobs ?? [])
        }
      })
      .catch((e) => console.error("Failed to load profile:", e))
      .finally(() => setLoading(false))
  }, [])

  async function handleSave() {
    if (!tech) return
    setSaving(true)
    try {
      const updated = await api.patch<ApiTechnician>(`/api/technicians/${tech.id}`, {
        name: editForm.name,
        phone: editForm.phone || undefined,
        email: editForm.email || undefined,
        epa608Level: editForm.epa608Level || undefined,
        skills: editForm.skills.split(",").map((s) => s.trim()).filter(Boolean),
      })
      setTech({ ...tech, ...updated })
      setEditing(false)
    } catch (e) {
      console.error("Failed to save:", e)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Loading profile...</span>
      </div>
    )
  }

  if (!tech) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Wrench className="h-8 w-8 text-muted-foreground/50" />
        <p className="mt-3 text-sm text-muted-foreground">No technician profile found</p>
      </div>
    )
  }

  const myJobs = jobs
  const completedCount = myJobs.filter((j) => j.status === "completed").length
  const thisMonth = new Date()
  const monthStart = new Date(thisMonth.getFullYear(), thisMonth.getMonth(), 1)
  const completedThisMonth = myJobs.filter(
    (j) => j.status === "completed" && j.completedAt && new Date(j.completedAt) >= monthStart
  ).length
  const activeJobs = myJobs.filter(
    (j) => ["scheduled", "en_route", "in_progress"].includes(j.status)
  ).length

  const initials = tech.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)

  return (
    <div className="mx-auto max-w-lg space-y-5">
      {/* Profile Header */}
      <Card className="overflow-hidden border-border bg-card shadow-sm">
        <div className="h-20 bg-gradient-to-r from-primary/80 via-primary to-accent" />
        <CardContent className="p-5 pt-0">
          <div className="-mt-10 flex items-end gap-4">
            <Avatar className="h-20 w-20 border-4 border-card shadow-md">
              <AvatarFallback className="bg-primary text-xl font-bold text-primary-foreground">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 pb-1">
              <h2 className="text-xl font-bold tracking-tight text-card-foreground">{tech.name}</h2>
              <p className="text-sm text-muted-foreground">
                {tech.epa608Level ? `EPA 608 · Type ${tech.epa608Level}` : "Technician"}
              </p>
            </div>
          </div>
          {tech.skills.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {tech.skills.map((skill) => (
                <Badge key={skill} variant="outline" className="rounded-full border-primary/25 bg-primary/10 px-2.5 py-0.5 text-xs font-medium capitalize text-primary">
                  {skill.replace(/-/g, " ")}
                </Badge>
              ))}
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            className="mt-4 w-full"
            onClick={() => {
              setEditing(true)
              setEditForm({
                name: tech.name,
                phone: tech.phone ?? "",
                email: tech.email ?? "",
                epa608Level: tech.epa608Level ?? "",
                skills: tech.skills.join(", "),
              })
            }}
          >
            Edit Profile
          </Button>
        </CardContent>
      </Card>

      {/* Edit Form */}
      {editing && (
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Edit Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 p-5">
            <div className="space-y-1">
              <label className="text-xs font-mono text-muted-foreground">Name</label>
              <Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className="h-9 bg-secondary border-border text-sm" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-mono text-muted-foreground">Phone</label>
              <Input value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} className="h-9 bg-secondary border-border text-sm" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-mono text-muted-foreground">Email</label>
              <Input value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} className="h-9 bg-secondary border-border text-sm" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-mono text-muted-foreground">EPA 608 Level</label>
              <Input value={editForm.epa608Level} onChange={(e) => setEditForm({ ...editForm, epa608Level: e.target.value })} className="h-9 bg-secondary border-border text-sm" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-mono text-muted-foreground">Skills (comma-separated)</label>
              <Input value={editForm.skills} onChange={(e) => setEditForm({ ...editForm, skills: e.target.value })} placeholder="furnace, ac, heat-pump" className="h-9 bg-secondary border-border text-sm" />
            </div>
            <div className="flex gap-2 pt-2">
              <Button onClick={handleSave} disabled={saving} size="sm">
                {saving ? "Saving..." : "Save"}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="border-border bg-card shadow-sm">
          <CardContent className="flex flex-col items-center gap-1 p-4">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-success/15 text-success">
              <CheckCircle2 className="h-4.5 w-4.5" />
            </span>
            <div className="mt-1 text-2xl font-bold tabular-nums text-card-foreground">{completedCount}</div>
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Completed</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card shadow-sm">
          <CardContent className="flex flex-col items-center gap-1 p-4">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <TrendingUp className="h-4.5 w-4.5" />
            </span>
            <div className="mt-1 text-2xl font-bold tabular-nums text-card-foreground">{completedThisMonth}</div>
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">This Month</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card shadow-sm">
          <CardContent className="flex flex-col items-center gap-1 p-4">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/15 text-accent">
              <Wrench className="h-4.5 w-4.5" />
            </span>
            <div className="mt-1 text-2xl font-bold tabular-nums text-card-foreground">{activeJobs}</div>
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Active</p>
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

      <ChangePasswordCard />
    </div>
  )
}
