import type { RecurringJob } from "@/api/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { RefreshCw } from "lucide-react"

interface Props {
  job: RecurringJob
  onEdit: () => void
  onDeactivate: () => void
  onDelete: () => void
}

const INTERVAL_LABELS: Record<number, string> = {
  7: "Weekly",
  14: "Every 2 weeks",
  30: "Monthly",
  90: "Every 3 months",
  180: "Every 6 months",
  365: "Annually",
}

function intervalLabel(days: number): string {
  return INTERVAL_LABELS[days] ?? `Every ${days} days`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

export function RecurringJobCard({ job, onEdit, onDeactivate, onDelete }: Props) {
  const equipmentName = job.equipment
    ? [job.equipment.make, job.equipment.model].filter(Boolean).join(" ") || "Unknown equipment"
    : job.equipmentType ?? "—"

  return (
    <Card className="border-border bg-card">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`h-2 w-2 rounded-full flex-shrink-0 ${job.isActive ? "bg-green-500" : "bg-muted-foreground/40"}`}
              />
              <span className="font-semibold text-sm capitalize">{job.serviceType ?? "Service"}</span>
              <Badge variant="outline" className="text-xs">
                <RefreshCw className="h-3 w-3 mr-1" />
                {intervalLabel(job.intervalDays)}
              </Badge>
              {!job.isActive && (
                <Badge variant="secondary" className="text-xs">Inactive</Badge>
              )}
            </div>

            <div className="mt-1 text-xs text-muted-foreground space-y-0.5">
              <div>{equipmentName}</div>
              <div>Next due: {formatDate(job.nextDueAt)}</div>
              {job.notes && (
                <div className="truncate max-w-xs">{job.notes}</div>
              )}
            </div>
          </div>

          <div className="flex gap-2 flex-shrink-0 flex-wrap justify-end">
            <Button size="sm" variant="outline" onClick={onEdit}>Edit</Button>
            <Button size="sm" variant="outline" onClick={onDeactivate}>
              {job.isActive ? "Deactivate" : "Reactivate"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={onDelete}
            >
              Delete
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
