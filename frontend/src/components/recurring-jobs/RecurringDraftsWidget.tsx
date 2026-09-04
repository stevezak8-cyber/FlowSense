import { useState, useEffect } from "react"
import { Link } from "react-router-dom"
import type { RecurringDraft } from "@/api/types"
import { api } from "@/api/client"
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
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="border-b border-border px-6 py-4">
        <span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          <RefreshCw className="h-4 w-4" />
          Recurring Jobs to Confirm ({drafts.length})
        </span>
      </div>
      <div className="divide-y divide-border">
        {visible.map((draft) => {
          const days = Math.ceil(
            (new Date(draft.recurringJob.nextDueAt).getTime() - Date.now()) / 86400000
          )
          const eq = draft.recurringJob.equipment
          const equipmentLabel = eq
            ? [eq.make, eq.model].filter(Boolean).join(" ")
            : (draft.equipmentType ?? "")

          return (
            <div key={draft.id} className="flex items-center justify-between px-6 py-3 text-sm">
              <div className="min-w-0">
                <span className="font-medium text-card-foreground">{draft.customer.name}</span>
                {draft.serviceType && (
                  <span className="text-muted-foreground text-xs ml-2">· {draft.serviceType}</span>
                )}
                {equipmentLabel && (
                  <span className="text-muted-foreground text-xs ml-2">· {equipmentLabel}</span>
                )}
              </div>
              <span className={`text-xs flex-shrink-0 ml-3 ${days < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                {days < 0 ? "overdue" : `${days}d away`}
              </span>
            </div>
          )
        })}
        <div className="px-6 py-3">
          <Link
            to="/office/jobs"
            className="text-xs font-semibold text-primary hover:underline"
          >
            Review jobs →
          </Link>
        </div>
      </div>
    </div>
  )
}
