"use client"

import { useState } from "react"
import type { ApiJob } from "@/api/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import {
  Search,
  Filter,
  Wrench,
  Settings,
  ClipboardCheck,
  MapPin,
  Clock,
  ChevronDown,
  ChevronUp,
  Loader2,
} from "lucide-react"

const statusStyles: Record<string, string> = {
  in_progress: "bg-primary/15 text-primary border-primary/30",
  scheduled: "bg-chart-5/15 text-chart-5 border-chart-5/30",
  completed: "bg-success/15 text-success border-success/30",
  en_route: "bg-accent/15 text-accent border-accent/30",
  cancelled: "bg-destructive/15 text-destructive border-destructive/30",
}

const statusLabels: Record<string, string> = {
  scheduled: "Scheduled",
  en_route: "En Route",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
}

const priorityStyles: Record<string, string> = {
  low: "bg-muted text-muted-foreground border-border",
  normal: "bg-chart-5/15 text-chart-5 border-chart-5/30",
  high: "bg-accent/15 text-accent border-accent/30",
  urgent: "bg-destructive/15 text-destructive border-destructive/30",
}

const equipmentIcons: Record<string, React.ElementType> = {
  furnace: Settings,
  ac: Wrench,
  "heat-pump": ClipboardCheck,
}

type StatusFilter = ApiJob["status"] | "all"

const filters: { label: string; value: StatusFilter }[] = [
  { label: "All Jobs", value: "all" },
  { label: "Scheduled", value: "scheduled" },
  { label: "In Progress", value: "in_progress" },
  { label: "Completed", value: "completed" },
  { label: "Cancelled", value: "cancelled" },
]

interface JobsTableProps {
  jobs: ApiJob[]
  loading?: boolean
}

export function JobsTable({ jobs, loading }: JobsTableProps) {
  const [activeFilter, setActiveFilter] = useState<StatusFilter>("all")
  const [search, setSearch] = useState("")
  const [expandedJob, setExpandedJob] = useState<string | null>(null)

  const filtered = jobs.filter((job) => {
    const matchesFilter =
      activeFilter === "all" || job.status === activeFilter
    const matchesSearch =
      search === "" ||
      (job.symptomSummary ?? "").toLowerCase().includes(search.toLowerCase()) ||
      job.customer.name.toLowerCase().includes(search.toLowerCase()) ||
      job.id.toLowerCase().includes(search.toLowerCase())
    return matchesFilter && matchesSearch
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Loading jobs...</span>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {filters.map((f) => (
            <Button
              key={f.value}
              variant={activeFilter === f.value ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveFilter(f.value)}
              className={cn(
                "h-8 text-xs font-mono",
                activeFilter === f.value
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "border-border text-muted-foreground hover:bg-secondary hover:text-foreground"
              )}
            >
              {f.label}
              {f.value !== "all" && (
                <span className="ml-1.5 opacity-60">
                  {jobs.filter((j) => j.status === f.value).length}
                </span>
              )}
            </Button>
          ))}
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search jobs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 bg-secondary pl-9 text-sm border-border placeholder:text-muted-foreground"
          />
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
        <Filter className="h-3.5 w-3.5" />
        <span>
          Showing {filtered.length} of {jobs.length} jobs
        </span>
      </div>

      <div className="rounded-lg border border-border bg-card">
        <div className="hidden border-b border-border px-5 py-3 sm:grid sm:grid-cols-12 sm:gap-4">
          <span className="col-span-1 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Type</span>
          <span className="col-span-3 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Details</span>
          <span className="col-span-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Customer</span>
          <span className="col-span-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Technician</span>
          <span className="col-span-1 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Priority</span>
          <span className="col-span-1 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Status</span>
          <span className="col-span-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground text-right">Schedule</span>
        </div>

        <div className="divide-y divide-border">
          {filtered.map((job) => {
            const TypeIcon = equipmentIcons[job.equipmentType ?? ""] ?? Wrench
            const isExpanded = expandedJob === job.id
            const scheduled = new Date(job.scheduledAt)
            return (
              <div key={job.id}>
                <div
                  className="cursor-pointer px-5 py-3.5 transition-colors hover:bg-secondary/50 sm:grid sm:grid-cols-12 sm:items-center sm:gap-4"
                  onClick={() => setExpandedJob(isExpanded ? null : job.id)}
                >
                  <div className="col-span-1">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-secondary">
                      <TypeIcon className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                  <div className="col-span-3 min-w-0">
                    <div className="truncate text-sm font-medium text-card-foreground">
                      {job.equipmentType
                        ? job.equipmentType.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())
                        : "Service"}
                      {job.symptomSummary ? ` — ${job.symptomSummary}` : ""}
                    </div>
                    <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                      {job.equipmentType ?? "general"}
                    </div>
                  </div>
                  <div className="col-span-2 hidden sm:block">
                    <div className="text-sm text-card-foreground">{job.customer.name}</div>
                  </div>
                  <div className="col-span-2 hidden sm:block">
                    <div className="text-sm text-card-foreground">{job.technician?.name ?? "Unassigned"}</div>
                  </div>
                  <div className="col-span-1 hidden sm:block">
                    <Badge variant="outline" className={cn("rounded-sm px-2 py-0.5 text-[10px] font-mono uppercase", priorityStyles[job.priority])}>
                      {job.priority}
                    </Badge>
                  </div>
                  <div className="col-span-1 hidden sm:block">
                    <Badge variant="outline" className={cn("rounded-sm px-2 py-0.5 text-[10px] font-mono uppercase", statusStyles[job.status])}>
                      {statusLabels[job.status]}
                    </Badge>
                  </div>
                  <div className="col-span-2 hidden items-center justify-end gap-2 sm:flex">
                    <div className="text-right">
                      <div className="text-xs text-card-foreground font-mono">
                        {scheduled.toLocaleDateString()}
                      </div>
                      <div className="flex items-center justify-end gap-1 text-[10px] text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {scheduled.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                    {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-border bg-secondary/30 px-5 py-4">
                    <div className="grid gap-4 sm:grid-cols-3">
                      <div>
                        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Location</span>
                        <div className="mt-1 flex items-start gap-2">
                          <MapPin className="mt-0.5 h-3.5 w-3.5 text-primary" />
                          <span className="text-sm text-card-foreground">{job.customer.address}</span>
                        </div>
                      </div>
                      <div className="sm:col-span-2">
                        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Notes</span>
                        <p className="mt-1 text-sm text-card-foreground leading-relaxed">
                          {job.symptomSummary || job.equipmentNotes || "No notes"}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}

          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Search className="h-8 w-8 text-muted-foreground/50" />
              <p className="mt-3 text-sm text-muted-foreground">No jobs found matching your criteria</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
