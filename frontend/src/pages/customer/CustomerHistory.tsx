import { useEffect, useState } from "react"
import { api } from "@/api/client"
import type { CustomerJobHistoryItem } from "@/api/types"
import { Loader2 } from "lucide-react"

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

export default function CustomerHistory() {
  const [items, setItems] = useState<CustomerJobHistoryItem[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    api.get<CustomerJobHistoryItem[]>("/api/customers/me/jobs")
      .then(setItems)
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Could not load job history.</p>
  }

  if (!items || items.length === 0) {
    return (
      <div className="py-10 text-center">
        <p className="text-sm text-muted-foreground">No completed jobs yet.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Job History</h1>
        <p className="text-sm text-muted-foreground">Your completed and cancelled service visits</p>
      </div>
      <div className="space-y-3">
        {items.map((item) => (
          <div key={item.id} className="rounded-xl border border-border bg-card p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="font-semibold">{item.equipmentType ?? "Service"}</span>
              <span
                className={
                  item.status === "completed"
                    ? "rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400"
                    : "rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
                }
              >
                {item.status}
              </span>
            </div>
            <div className="text-sm text-muted-foreground mb-1">{formatDate(item.scheduledAt)}</div>
            {item.symptomSummary && (
              <p className="text-sm text-muted-foreground mt-1">{item.symptomSummary}</p>
            )}
            {item.actionsTaken && (
              <p className="text-sm text-muted-foreground mt-1 line-clamp-3">
                <span className="font-medium text-foreground">Work done:</span> {item.actionsTaken}
              </p>
            )}
            {item.technician && (
              <p className="text-sm text-muted-foreground mt-1">Technician: {item.technician.name}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
