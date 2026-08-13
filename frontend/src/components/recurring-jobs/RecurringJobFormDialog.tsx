import { useState, useEffect } from "react"
import type { Equipment, RecurringJob } from "@/api/types"
import { api } from "@/api/client"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Loader2 } from "lucide-react"

interface Props {
  customerId: string
  customerEquipment: Equipment[]
  existing?: RecurringJob
  onSaved: () => void
  onClose: () => void
}

const SERVICE_TYPES = ["repair", "maintenance", "inspection", "installation"] as const
const EQUIPMENT_TYPES = ["ac", "heat-pump", "mini-split", "furnace", "boiler", "other"] as const
const INTERVALS = [
  { label: "Weekly", value: 7 },
  { label: "Every 2 weeks", value: 14 },
  { label: "Monthly", value: 30 },
  { label: "Every 3 months", value: 90 },
  { label: "Every 6 months", value: 180 },
  { label: "Annually", value: 365 },
]

function toDateInput(iso: string | null | undefined) {
  if (!iso) return ""
  return iso.split("T")[0]
}

export function RecurringJobFormDialog({ customerId, customerEquipment, existing, onSaved, onClose }: Props) {
  const [serviceType, setServiceType] = useState(existing?.serviceType ?? "maintenance")
  const [equipmentId, setEquipmentId] = useState(existing?.equipmentId ?? "")
  const [equipmentType, setEquipmentType] = useState(existing?.equipmentType ?? "ac")
  const [intervalDays, setIntervalDays] = useState(existing?.intervalDays?.toString() ?? "90")
  const [nextDueAt, setNextDueAt] = useState(toDateInput(existing?.nextDueAt))
  const [notes, setNotes] = useState(existing?.notes ?? "")
  const [submitting, setSubmitting] = useState(false)

  const noEquipmentSelected = !equipmentId || equipmentId === "__none__"

  useEffect(() => {
    if (!existing) {
      setServiceType("maintenance")
      setEquipmentId("")
      setEquipmentType("ac")
      setIntervalDays("90")
      setNextDueAt("")
      setNotes("")
    }
  }, [existing])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      const body = {
        customerId,
        serviceType,
        intervalDays: parseInt(intervalDays),
        nextDueAt: nextDueAt ? new Date(nextDueAt).toISOString() : undefined,
        ...(equipmentId && equipmentId !== "__none__" ? { equipmentId } : { equipmentId: null }),
        ...(!equipmentId || equipmentId === "__none__" ? { equipmentType } : { equipmentType: null }),
        ...(notes ? { notes } : { notes: null }),
      }
      if (existing) {
        await api.patch(`/api/recurring-jobs/${existing.id}`, body)
      } else {
        await api.post("/api/recurring-jobs", body)
      }
      toast.success(existing ? "Recurring job updated" : "Recurring job created")
      onSaved()
    } catch {
      toast.error("Failed to save recurring job")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{existing ? "Edit Recurring Job" : "Add Recurring Job"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Service Type *</label>
            <Select value={serviceType ?? ""} onValueChange={setServiceType}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SERVICE_TYPES.map((t) => (
                  <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Equipment</label>
            <Select value={equipmentId || "__none__"} onValueChange={(v) => setEquipmentId(v === "__none__" ? "" : v)}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None</SelectItem>
                {customerEquipment.map((eq) => (
                  <SelectItem key={eq.id} value={eq.id}>
                    {[eq.make, eq.model].filter(Boolean).join(" ") || eq.equipmentType}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {noEquipmentSelected && (
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Equipment Type</label>
              <Select value={equipmentType} onValueChange={setEquipmentType}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EQUIPMENT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Interval *</label>
            <Select value={intervalDays} onValueChange={setIntervalDays}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {INTERVALS.map((i) => (
                  <SelectItem key={i.value} value={i.value.toString()}>{i.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Next Due Date *</label>
            <Input
              className="mt-1"
              type="date"
              value={nextDueAt}
              onChange={(e) => setNextDueAt(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Notes</label>
            <textarea
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={submitting || !serviceType || !intervalDays || !nextDueAt}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {existing ? "Save changes" : "Add recurring job"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
