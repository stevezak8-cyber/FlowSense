import { useEffect, useState, useCallback, useRef } from "react"
import FullCalendar from "@fullcalendar/react"
import timeGridPlugin from "@fullcalendar/timegrid"
import interactionPlugin from "@fullcalendar/interaction"
import type { EventInput, EventDropArg } from "@fullcalendar/core"
import { api } from "@/api/client"
import type { ApiJob } from "@/api/types"
import { CalendarEventCard } from "./CalendarEventCard"
import { UnassignedStrip } from "./UnassignedStrip"
import { DispatchSuggestions } from "@/components/jobs/dispatch-suggestions"
import { PageError } from "@/components/page-error"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"

const NON_EDITABLE_STATUSES = new Set(["completed", "cancelled"])

export function jobsToEvents(jobs: ApiJob[]): EventInput[] {
  return jobs.map((job) => {
    const start = new Date(job.scheduledAt)
    const end = new Date(start.getTime() + 2 * 60 * 60 * 1000)
    return {
      id: job.id,
      start: job.scheduledAt,
      end: end.toISOString(),
      editable: !NON_EDITABLE_STATUSES.has(job.status),
      extendedProps: { job },
    }
  })
}

interface ReassignState {
  jobId: string
  scheduledAt: string
  job: ApiJob
}

interface ScheduleCalendarProps {
  technicianId?: string | null
  onCreateJob?: () => void
}

export function ScheduleCalendar({ technicianId }: ScheduleCalendarProps) {
  const [jobs, setJobs] = useState<ApiJob[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reassign, setReassign] = useState<ReassignState | null>(null)
  const calendarRef = useRef<FullCalendar | null>(null)

  const fetchJobs = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.get<ApiJob[]>("/api/jobs")
      setJobs(data)
    } catch {
      setError("Failed to load jobs")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchJobs() }, [fetchJobs])

  const filteredJobs = technicianId
    ? jobs.filter((j) => j.technicianId === technicianId)
    : jobs

  async function handleEventDrop({ event, revert }: EventDropArg) {
    const job = event.extendedProps.job as ApiJob
    const newStart = event.start?.toISOString()
    if (!newStart) { revert(); return }

    try {
      await api.patch(`/api/jobs/${job.id}`, { scheduledAt: newStart })
      setJobs((prev) =>
        prev.map((j) => j.id === job.id ? { ...j, scheduledAt: newStart } : j)
      )
      setReassign({ jobId: job.id, scheduledAt: newStart, job: { ...job, scheduledAt: newStart } })
    } catch {
      revert()
      toast.error("Failed to reschedule job")
    }
  }

  async function handleStripDrop(jobId: string, scheduledAt: string) {
    try {
      await api.patch(`/api/jobs/${jobId}`, { scheduledAt })
      const job = jobs.find((j) => j.id === jobId)
      if (job) {
        setJobs((prev) =>
          prev.map((j) => j.id === jobId ? { ...j, scheduledAt } : j)
        )
        setReassign({ jobId, scheduledAt, job: { ...job, scheduledAt } })
      }
    } catch {
      toast.error("Failed to schedule job")
    }
  }

  function handleReassignSelect(newTechId: string | null) {
    if (newTechId) {
      setJobs((prev) =>
        prev.map((j) => j.id === reassign?.jobId ? { ...j, technicianId: newTechId } : j)
      )
    }
    setReassign(null)
  }

  if (error) return <PageError message={error} onRetry={fetchJobs} />

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {loading && (
        <div style={{ display: "flex", justifyContent: "center", padding: "48px" }}>
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {!loading && (
        <FullCalendar
          ref={calendarRef}
          plugins={[timeGridPlugin, interactionPlugin]}
          initialView="timeGridWeek"
          headerToolbar={{
            left: "prev,next today",
            center: "title",
            right: "timeGridWeek,timeGridDay",
          }}
          events={jobsToEvents(filteredJobs)}
          editable
          droppable
          drop={(info) => {
            const droppedJobId = info.draggedEl.getAttribute("data-job-id")
            if (droppedJobId && info.date) handleStripDrop(droppedJobId, info.date.toISOString())
          }}
          eventDrop={handleEventDrop}
          eventContent={(info) => (
            <CalendarEventCard job={info.event.extendedProps.job as ApiJob} />
          )}
          eventClick={(info) => {
            const job = info.event.extendedProps.job as ApiJob
            window.location.href = `/office/jobs?job=${job.id}`
          }}
          height="auto"
          slotMinTime="07:00:00"
          slotMaxTime="20:00:00"
          allDaySlot={false}
          nowIndicator
        />
      )}

      {!loading && filteredJobs.length === 0 && (
        <div style={{ textAlign: "center", padding: "48px", color: "#64748b" }}>
          No jobs scheduled for this week
        </div>
      )}

      <UnassignedStrip jobs={filteredJobs} />

      {reassign && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50,
          }}
          onClick={() => setReassign(null)}
        >
          <div
            style={{ background: "white", borderRadius: "12px", padding: "24px", width: "400px", maxWidth: "90vw" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: "0 0 16px", fontWeight: 700 }}>Reassign Technician</h3>
            <DispatchSuggestions
              mode="reassign"
              jobId={reassign.jobId}
              equipmentType={reassign.job.equipmentType}
              customerAddress={reassign.job.customer.address}
              scheduledAt={reassign.scheduledAt}
              customerId={reassign.job.customerId}
              priority={reassign.job.priority}
              selectedTechId={reassign.job.technicianId}
              onSelect={handleReassignSelect}
              onSkip={() => setReassign(null)}
              onError={() => setReassign(null)}
            />
          </div>
        </div>
      )}
    </div>
  )
}
