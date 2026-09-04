import { ChevronRight } from "lucide-react"
import type { ApiJob } from "@/api/types"

export type PriorityFilter = "urgent" | "unassigned" | null

interface PriorityPanelProps {
  jobs: ApiJob[]
  activeFilter: PriorityFilter
  onSelectFilter: (filter: PriorityFilter) => void
}

export function PriorityPanel({ jobs, activeFilter, onSelectFilter }: PriorityPanelProps) {
  const activeJobs = jobs.filter((j) => j.status !== "completed" && j.status !== "cancelled")
  const urgentCount = activeJobs.filter((j) => j.priority === "urgent").length
  const unassignedCount = activeJobs.filter((j) => !j.technicianId).length

  const rows: { key: Exclude<PriorityFilter, null>; label: string; count: number }[] = [
    { key: "urgent", label: "Urgent Jobs", count: urgentCount },
    { key: "unassigned", label: "Unassigned Jobs", count: unassignedCount },
  ]

  return (
    <div className="medops-card p-4">
      <span className="text-sm font-bold text-foreground">Priority</span>
      <div className="mt-3 flex flex-col gap-1">
        {rows.map((row) => {
          const isActive = activeFilter === row.key
          return (
            <button
              key={row.key}
              type="button"
              onClick={() => onSelectFilter(isActive ? null : row.key)}
              className={
                "flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 -mx-2 text-left transition-colors " +
                (isActive ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted")
              }
            >
              <span className="flex items-center gap-2 text-sm font-medium">
                <span className={"h-1.5 w-1.5 rounded-full " + (row.key === "urgent" ? "bg-destructive" : "bg-muted-foreground/50")} />
                {row.label}
              </span>
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                {row.count}
                <ChevronRight className="h-3.5 w-3.5" />
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
