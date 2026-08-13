import { useState, useEffect } from "react"
import { Link } from "react-router-dom"
import type { RecurringDraft } from "@/api/types"
import { api } from "@/api/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { RefreshCw } from "lucide-react"

export function RecurringDraftsWidget() {
  const [drafts, setDrafts] = useState<RecurringDraft[]>([])

  useEffect(() => {
    api.get<RecurringDraft[]>("/api/recurring-jobs/pending-drafts")
      .then(setDrafts)
      .catch(() => {})
  }, [])

  if (drafts.length === 0) return null

  const visible = drafts.slice(0, 5)

  return (
    <Card className="border-border bg-card">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-xs font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          <RefreshCw className="h-4 w-4" />
          Recurring Jobs to Confirm ({drafts.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {visible.map((draft) => {
          const days = Math.ceil(
            (new Date(draft.recurringJob.nextDueAt).getTime() - Date.now()) / 86400000
          )
          const eq = draft.recurringJob.equipment
          const equipmentLabel = eq
            ? [eq.make, eq.model].filter(Boolean).join(" ")
            : (draft.equipmentType ?? "")

          return (
            <div key={draft.id} className="flex items-center justify-between text-sm">
              <div className="min-w-0">
                <span className="font-medium">{draft.customer.name}</span>
                {draft.serviceType && (
                  <span className="text-muted-foreground text-xs ml-2">· {draft.serviceType}</span>
                )}
                {equipmentLabel && (
                  <span className="text-muted-foreground text-xs ml-2">· {equipmentLabel}</span>
                )}
              </div>
              <span className={`text-xs flex-shrink-0 ml-3 ${days < 0 ? "text-red-500" : "text-muted-foreground"}`}>
                {days < 0 ? "overdue" : `${days}d away`}
              </span>
            </div>
          )
        })}
        <div className="pt-1">
          <Link
            to="/office/jobs"
            className="text-xs font-medium text-primary hover:underline"
          >
            Review jobs →
          </Link>
        </div>
      </CardContent>
    </Card>
  )
}
