import type { ApiJob } from "@/api/types"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import {
  ArrowUpRight,
  Wrench,
  Settings,
  ClipboardCheck,
  Loader2,
} from "lucide-react"
import { Link } from "react-router-dom"

const statusStyles: Record<string, string> = {
  in_progress: "bg-primary/10 text-primary border-primary/20",
  scheduled: "bg-chart-5/10 text-chart-5 border-chart-5/20",
  completed: "bg-success/10 text-success border-success/20",
  en_route: "bg-accent/10 text-accent border-accent/20",
  cancelled: "bg-destructive/10 text-destructive border-destructive/20",
}

const statusLabels: Record<string, string> = {
  scheduled: "Scheduled",
  en_route: "En Route",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
}

const priorityStyles: Record<string, string> = {
  low: "text-muted-foreground",
  normal: "text-chart-5",
  high: "text-accent",
  urgent: "text-destructive",
}

const equipmentIcons: Record<string, React.ElementType> = {
  furnace: Settings,
  ac: Wrench,
  "heat-pump": ClipboardCheck,
}

interface RecentJobsProps {
  jobs: ApiJob[]
  loading?: boolean
}

export function RecentJobs({ jobs, loading }: RecentJobsProps) {
  const recentJobs = jobs.slice(0, 5)

  if (loading) {
    return (
      <div className="medops-card">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">Loading recent jobs...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="medops-card">
      <div className="flex items-center justify-between px-6 py-5">
        <div>
          <h3 className="text-base font-bold text-card-foreground">
            Recent Jobs
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {jobs.length} total jobs tracked
          </p>
        </div>
        <Link
          to="/office/jobs"
          className="flex items-center gap-1 text-xs font-medium text-success hover:text-success/80 transition-colors"
        >
          View all
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      <div className="divide-y divide-border/50">
        {recentJobs.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <Wrench className="h-6 w-6 text-muted-foreground/40" />
            <p className="mt-2 text-sm text-muted-foreground">No jobs yet</p>
          </div>
        )}
        {recentJobs.map((job) => {
          const TypeIcon = equipmentIcons[job.equipmentType ?? ""] || Wrench
          return (
            <div
              key={job.id}
              className="flex items-center gap-4 px-6 py-4 transition-colors hover:bg-secondary/40"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/8">
                <TypeIcon className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold text-card-foreground">
                    {job.equipmentType
                      ? job.equipmentType.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())
                      : "Service"}
                    {job.symptomSummary ? ` — ${job.symptomSummary}` : ""}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{job.customer.name}</span>
                  <span className="text-border">|</span>
                  <span>{job.technician?.name ?? "Unassigned"}</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    "text-[10px] font-medium uppercase tracking-wider",
                    priorityStyles[job.priority]
                  )}
                >
                  {job.priority}
                </span>
                <Badge
                  variant="outline"
                  className={cn(
                    "rounded-full px-2.5 py-0.5 text-[10px] font-medium border",
                    statusStyles[job.status]
                  )}
                >
                  {statusLabels[job.status]}
                </Badge>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
