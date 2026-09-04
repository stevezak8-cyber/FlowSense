import { useState, useEffect } from "react"
import type { Equipment } from "@/api/types"
import { api } from "@/api/client"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Wrench, Loader2 } from "lucide-react"

function daysLabel(nextDueAt: string) {
  const diff = Math.round((new Date(nextDueAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  if (diff < 0) return `${Math.abs(diff)}d overdue`
  if (diff === 0) return "due today"
  return `due in ${diff}d`
}

export function MaintenanceDueWidget() {
  const [items, setItems] = useState<Equipment[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    api.get<Equipment[]>("/api/equipment?maintenanceDue=true")
      .then(setItems)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function handleCreateJobs() {
    setCreating(true)
    try {
      const { created } = await api.post<{ created: unknown[] }>("/api/equipment/check-maintenance", {})
      if (created.length === 0) {
        toast.success("No new draft jobs needed — jobs already exist for all due units")
      } else {
        toast.success(`Created ${created.length} draft job${created.length === 1 ? "" : "s"}`)
      }
      const updated = await api.get<Equipment[]>("/api/equipment?maintenanceDue=true")
      setItems(updated)
    } catch {
      toast.error("Failed to create maintenance jobs")
    } finally {
      setCreating(false)
    }
  }

  if (loading || items.length === 0) return null

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          <Wrench className="h-4 w-4" />
          Maintenance Due ({items.length})
        </span>
        <Button size="sm" variant="outline" className="rounded-full" onClick={handleCreateJobs} disabled={creating}>
          {creating && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
          Create draft jobs
        </Button>
      </div>
      <div className="divide-y divide-border">
        {items.map((eq) => (
          <div key={eq.id} className="flex items-center justify-between px-6 py-3 text-sm">
            <div className="min-w-0">
              <span className="font-medium text-card-foreground">{[eq.make, eq.model].filter(Boolean).join(" ") || eq.equipmentType}</span>
              <span className="text-muted-foreground text-xs ml-2">· {eq.customer?.name ?? ""} · {eq.equipmentType}</span>
            </div>
            {eq.nextDueAt && (
              <Badge
                variant={new Date(eq.nextDueAt) < new Date() ? "destructive" : "outline"}
                className="text-xs flex-shrink-0 ml-3 rounded-full"
              >
                {daysLabel(eq.nextDueAt)}
              </Badge>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
