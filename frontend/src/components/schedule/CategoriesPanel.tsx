import type { ApiJob, ApiTechnician } from "@/api/types"

const CHART_VARS = ["--chart-1", "--chart-2", "--chart-3", "--chart-4", "--chart-5"]

function thisWeekJobs(jobs: ApiJob[]): ApiJob[] {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const weekStart = new Date(todayStart)
  weekStart.setDate(weekStart.getDate() - weekStart.getDay()) // Sunday
  const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000)
  return jobs.filter((j) => {
    const s = new Date(j.scheduledAt)
    return s >= weekStart && s < weekEnd
  })
}

function formatHours(jobCount: number): string {
  // Every job occupies a fixed 2h block on the schedule grid (see jobsToEvents).
  const totalMinutes = jobCount * 2 * 60
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return `${h}h${String(m).padStart(2, "0")}`
}

interface CategoriesPanelProps {
  jobs: ApiJob[]
  technicians: ApiTechnician[]
  activeTechId: string | null
  onToggleTech: (id: string | null) => void
}

export function CategoriesPanel({ jobs, technicians, activeTechId, onToggleTech }: CategoriesPanelProps) {
  const weekJobs = thisWeekJobs(jobs)
  const unassignedCount = weekJobs.filter((j) => !j.technicianId).length

  return (
    <div className="medops-card p-4">
      <span className="text-sm font-bold text-foreground">Categories</span>
      <div className="mt-3 flex flex-col gap-2.5">
        {technicians.map((tech, i) => {
          const count = weekJobs.filter((j) => j.technicianId === tech.id).length
          const active = activeTechId === null || activeTechId === tech.id
          const colorVar = CHART_VARS[i % CHART_VARS.length]
          return (
            <button
              key={tech.id}
              type="button"
              onClick={() => onToggleTech(activeTechId === tech.id ? null : tech.id)}
              className="flex items-center justify-between gap-2 text-left"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className="flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] border transition-colors"
                  style={{
                    backgroundColor: active ? `var(${colorVar})` : "transparent",
                    borderColor: `var(${colorVar})`,
                  }}
                >
                  {active && <span className="h-1.5 w-1.5 rounded-[2px] bg-white" />}
                </span>
                <span className="truncate text-sm text-foreground">{tech.name}</span>
              </span>
              <span className="shrink-0 text-xs font-medium text-muted-foreground">
                {formatHours(count)}
              </span>
            </button>
          )
        })}

        {unassignedCount > 0 && (
          <div className="flex items-center justify-between gap-2 pt-1 border-t border-border">
            <span className="flex min-w-0 items-center gap-2">
              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] border border-muted-foreground/40" />
              <span className="truncate text-sm text-muted-foreground">Unassigned</span>
            </span>
            <span className="shrink-0 text-xs font-medium text-muted-foreground">
              {formatHours(unassignedCount)}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
