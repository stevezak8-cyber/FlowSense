import { useState } from "react"
import type { Equipment } from "@/api/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Wrench, ChevronDown, ChevronUp, AlertTriangle } from "lucide-react"
import { api } from "@/api/client"
import { toast } from "sonner"
import { EquipmentFormDialog } from "./EquipmentFormDialog"

interface Props {
  equipment: Equipment
  onUpdated: (eq: Equipment) => void
  onDeleted: (id: string) => void
}

function timeAgo(iso: string | null) {
  if (!iso) return null
  const diffMs = Date.now() - new Date(iso).getTime()
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays < 30) return `${diffDays}d ago`
  const diffMonths = Math.round(diffDays / 30)
  if (diffMonths < 12) return `${diffMonths}mo ago`
  return `${Math.round(diffMonths / 12)}yr ago`
}

function formatDate(iso: string | null) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString("en-US", { month: "short", year: "numeric" })
}

function isExpired(iso: string | null) {
  if (!iso) return false
  return new Date(iso) < new Date()
}

function isDue(nextDueAt: string | null) {
  if (!nextDueAt) return false
  const thirtyDaysOut = new Date()
  thirtyDaysOut.setDate(thirtyDaysOut.getDate() + 30)
  return new Date(nextDueAt) <= thirtyDaysOut
}

function daysUntil(iso: string | null) {
  if (!iso) return null
  const diff = Math.round((new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  return diff
}

export function EquipmentCard({ equipment: eq, onUpdated, onDeleted }: Props) {
  const [historyOpen, setHistoryOpen] = useState(false)
  const [history, setHistory] = useState<{ id: string; scheduledAt: string; symptomSummary: string | null; status: string }[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const title = [eq.make, eq.model].filter(Boolean).join(" ") || eq.equipmentType
  const due = isDue(eq.nextDueAt)
  const expired = isExpired(eq.warrantyExpiry)
  const days = daysUntil(eq.nextDueAt)

  async function toggleHistory() {
    if (!historyOpen && history.length === 0) {
      setLoadingHistory(true)
      try {
        const data = await api.get<typeof history>(`/api/equipment/${eq.id}/history`)
        setHistory(data)
      } catch {
        toast.error("Failed to load history")
      } finally {
        setLoadingHistory(false)
      }
    }
    setHistoryOpen((o) => !o)
  }

  async function handleDelete() {
    if (!confirm(`Delete ${title}? This cannot be undone.`)) return
    setDeleting(true)
    try {
      await api.delete(`/api/equipment/${eq.id}`)
      onDeleted(eq.id)
      toast.success("Equipment deleted")
    } catch {
      toast.error("Failed to delete equipment")
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Card className="border-border bg-card">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Wrench className="h-4 w-4 text-primary flex-shrink-0" />
              <span className="font-semibold text-sm">{title}</span>
              <span className="text-xs text-muted-foreground">— {eq.equipmentType}</span>
            </div>

            <div className="mt-1 text-xs text-muted-foreground space-y-0.5">
              {eq.serialNumber && <div>S/N: {eq.serialNumber}</div>}
              <div className="flex gap-3 flex-wrap">
                {eq.installDate && <span>Installed {formatDate(eq.installDate)}</span>}
                {eq.warrantyExpiry && (
                  expired
                    ? <Badge variant="destructive" className="text-xs">Warranty expired {formatDate(eq.warrantyExpiry)}</Badge>
                    : <span>Warranty exp. {formatDate(eq.warrantyExpiry)}</span>
                )}
              </div>
            </div>

            <div className="mt-2 flex items-center gap-2 flex-wrap">
              {due && (
                <Badge variant="destructive" className="text-xs gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  {days !== null && days < 0 ? `${Math.abs(days)}d overdue` : "Maintenance due"}
                </Badge>
              )}
              {eq.nextDueAt && !due && (
                <span className="text-xs text-muted-foreground">
                  Next due {days !== null && days > 0 ? `in ${days} days` : formatDate(eq.nextDueAt)}
                </span>
              )}
              {eq.lastServicedAt && (
                <span className="text-xs text-muted-foreground">
                  Last serviced {timeAgo(eq.lastServicedAt)}
                </span>
              )}
            </div>
          </div>

          <div className="flex gap-2 flex-shrink-0">
            <Button size="sm" variant="outline" onClick={toggleHistory} disabled={loadingHistory}>
              History {historyOpen ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>Edit</Button>
            <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={handleDelete} disabled={deleting}>
              Delete
            </Button>
          </div>
        </div>

        {historyOpen && (
          <div className="mt-3 border-t pt-3 space-y-2">
            {history.length === 0 ? (
              <p className="text-xs text-muted-foreground">No service history yet.</p>
            ) : (
              history.slice(0, 5).map((j) => (
                <div key={j.id} className="text-xs flex gap-3">
                  <span className="text-muted-foreground w-20 flex-shrink-0">
                    {new Date(j.scheduledAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </span>
                  <span>{j.symptomSummary ?? "—"}</span>
                  <Badge variant="outline" className="text-xs ml-auto flex-shrink-0">{j.status}</Badge>
                </div>
              ))
            )}
          </div>
        )}
      </CardContent>

      <EquipmentFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        customerId={eq.customerId}
        existing={eq}
        onSaved={onUpdated}
      />
    </Card>
  )
}
