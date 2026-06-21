import { useState, useEffect } from "react"
import { ScheduleCalendar } from "@/components/schedule/ScheduleCalendar"
import { CreateJobDialog } from "@/components/jobs/create-job-dialog"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { api } from "@/api/client"
import type { ApiTechnician } from "@/api/types"
import { Plus } from "lucide-react"

export default function OfficeSchedule() {
  const [techFilter, setTechFilter] = useState<string | null>(null)
  const [technicians, setTechnicians] = useState<ApiTechnician[]>([])
  const [createDialogOpen, setCreateDialogOpen] = useState(false)

  useEffect(() => {
    api.get<ApiTechnician[]>("/api/technicians").then(setTechnicians).catch(() => {})
  }, [])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Schedule</h1>
          <p className="text-sm text-muted-foreground">Manage and dispatch jobs for the week</p>
        </div>
        <div className="flex items-center gap-3">
          <Select
            value={techFilter ?? "all"}
            onValueChange={(v) => setTechFilter(v === "all" ? null : v)}
          >
            <SelectTrigger className="w-48 h-9">
              <SelectValue placeholder="All Technicians" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Technicians</SelectItem>
              {technicians.map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={() => setCreateDialogOpen(true)}
          >
            <Plus className="h-4 w-4 mr-1" />
            New Job
          </Button>
        </div>
      </div>

      <ScheduleCalendar technicianId={techFilter} />

      <CreateJobDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onCreated={() => {
          setCreateDialogOpen(false)
          window.location.reload()
        }}
      />
    </div>
  )
}
