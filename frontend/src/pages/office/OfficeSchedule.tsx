import { useState, useEffect, useCallback, useRef } from "react"
import { ScheduleCalendar, type ScheduleCalendarHandle } from "@/components/schedule/ScheduleCalendar"
import { MiniMonthCalendar } from "@/components/schedule/MiniMonthCalendar"
import { CategoriesPanel } from "@/components/schedule/CategoriesPanel"
import { PriorityPanel, type PriorityFilter } from "@/components/schedule/PriorityPanel"
import { CreateJobDialog } from "@/components/jobs/create-job-dialog"
import { Button } from "@/components/ui/button"
import { api } from "@/api/client"
import type { ApiTechnician, ApiJob } from "@/api/types"
import { Plus } from "lucide-react"

export default function OfficeSchedule() {
  const [techFilter, setTechFilter] = useState<string | null>(null)
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>(null)
  const [technicians, setTechnicians] = useState<ApiTechnician[]>([])
  const [sidebarJobs, setSidebarJobs] = useState<ApiJob[]>([])
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const calendarRef = useRef<ScheduleCalendarHandle>(null)

  useEffect(() => {
    api.get<ApiTechnician[]>("/api/technicians").then(setTechnicians).catch(() => {})
  }, [])

  const fetchSidebarJobs = useCallback(() => {
    api.get<ApiJob[]>("/api/jobs").then(setSidebarJobs).catch(() => {})
  }, [])

  useEffect(() => { fetchSidebarJobs() }, [fetchSidebarJobs, refreshKey])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Schedule</h1>
          <p className="text-sm text-muted-foreground">Manage and dispatch jobs for the week</p>
        </div>
        <Button
          size="sm"
          className="bg-primary text-primary-foreground hover:bg-primary/90"
          onClick={() => setCreateDialogOpen(true)}
        >
          <Plus className="h-4 w-4 mr-1" />
          New Job
        </Button>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <aside className="flex w-full shrink-0 flex-col gap-4 lg:w-[280px]">
          <MiniMonthCalendar
            jobs={sidebarJobs}
            onSelectDate={(date) => calendarRef.current?.gotoDate(date)}
          />
          <CategoriesPanel
            jobs={sidebarJobs}
            technicians={technicians}
            activeTechId={techFilter}
            onToggleTech={setTechFilter}
          />
          <PriorityPanel
            jobs={sidebarJobs}
            activeFilter={priorityFilter}
            onSelectFilter={setPriorityFilter}
          />
        </aside>

        <div className="min-w-0 flex-1" style={{ minHeight: 720 }}>
          <ScheduleCalendar
            ref={calendarRef}
            technicianId={techFilter}
            priorityFilter={priorityFilter}
            refreshKey={refreshKey}
          />
        </div>
      </div>

      <CreateJobDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onCreated={() => {
          setCreateDialogOpen(false)
          setRefreshKey((k) => k + 1)
        }}
      />
    </div>
  )
}
