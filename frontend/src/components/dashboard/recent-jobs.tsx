import type { ApiJob } from "@/api/types"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { ArrowUpRight, Wrench, Loader2 } from "lucide-react"
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

interface RecentJobsProps {
  jobs: ApiJob[]
  loading?: boolean
}

export function RecentJobs({ jobs, loading }: RecentJobsProps) {
  const recentJobs = jobs.slice(0, 5)

  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-card">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">Loading recent jobs...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div>
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Recent Jobs
          </h3>
          <p className="mt-1 text-sm font-semibold text-card-foreground">
            {jobs.length} total jobs tracked
          </p>
        </div>
        <Link
          to="/office/jobs"
          className="flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-[11px] font-semibold text-card-foreground transition-colors hover:border-primary hover:text-primary"
        >
          View all
          <ArrowUpRight className="h-3 w-3" />
        </Link>
      </div>

      {recentJobs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <Wrench className="h-6 w-6 text-muted-foreground/40" />
          <p className="mt-2 text-sm text-muted-foreground">No jobs yet</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                <th className="px-6 py-3 font-bold">Customer</th>
                <th className="px-3 py-3 font-bold">Service</th>
                <th className="px-3 py-3 font-bold">Technician</th>
                <th className="px-3 py-3 font-bold">Priority</th>
                <th className="px-6 py-3 text-right font-bold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {recentJobs.map((job) => (
                <tr key={job.id} className="transition-colors hover:bg-secondary/60">
                  <td className="px-6 py-4 font-semibold text-card-foreground">{job.customer.name}</td>
                  <td className="max-w-[240px] px-3 py-4 text-muted-foreground">
                    <span className="line-clamp-1">
                      {job.equipmentType
                        ? job.equipmentType.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())
                        : "Service"}
                      {job.symptomSummary ? ` — ${job.symptomSummary}` : ""}
                    </span>
                  </td>
                  <td className="px-3 py-4 text-muted-foreground">{job.technician?.name ?? "Unassigned"}</td>
                  <td className={cn("px-3 py-4 text-[10px] font-medium uppercase tracking-wider", priorityStyles[job.priority])}>
                    {job.priority}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Badge
                      variant="outline"
                      className={cn(
                        "rounded-full px-2.5 py-0.5 text-[10px] font-medium border",
                        statusStyles[job.status]
                      )}
                    >
                      {statusLabels[job.status]}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
