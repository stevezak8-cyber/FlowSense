import { useState, useEffect } from "react"
import type { Equipment } from "@/api/types"
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
  open: boolean
  onOpenChange: (open: boolean) => void
  customerId: string
  existing?: Equipment
  onSaved: (eq: Equipment) => void
}

const EQUIPMENT_TYPES = ["ac", "furnace", "heat-pump", "boiler", "mini-split", "other"]
const INTERVALS = [
  { label: "None", value: "" },
  { label: "Every 3 months", value: "3" },
  { label: "Every 6 months", value: "6" },
  { label: "Every 12 months", value: "12" },
  { label: "Every 24 months", value: "24" },
]

function toDateInput(iso: string | null) {
  if (!iso) return ""
  return iso.split("T")[0]
}

export function EquipmentFormDialog({ open, onOpenChange, customerId, existing, onSaved }: Props) {
  const [equipmentType, setEquipmentType] = useState(existing?.equipmentType ?? "ac")
  const [make, setMake] = useState(existing?.make ?? "")
  const [model, setModel] = useState(existing?.model ?? "")
  const [serialNumber, setSerialNumber] = useState(existing?.serialNumber ?? "")
  const [installDate, setInstallDate] = useState(toDateInput(existing?.installDate ?? null))
  const [warrantyExpiry, setWarrantyExpiry] = useState(toDateInput(existing?.warrantyExpiry ?? null))
  const [serviceIntervalMonths, setServiceIntervalMonths] = useState(
    existing?.serviceIntervalMonths?.toString() ?? ""
  )
  const [notes, setNotes] = useState(existing?.notes ?? "")
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open && !existing) {
      setEquipmentType("ac")
      setMake(""); setModel(""); setSerialNumber("")
      setInstallDate(""); setWarrantyExpiry("")
      setServiceIntervalMonths(""); setNotes("")
    }
  }, [open, existing])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      const body = {
        customerId,
        equipmentType,
        ...(make && { make }),
        ...(model && { model }),
        ...(serialNumber && { serialNumber }),
        ...(installDate && { installDate: new Date(installDate).toISOString() }),
        ...(warrantyExpiry && { warrantyExpiry: new Date(warrantyExpiry).toISOString() }),
        ...(serviceIntervalMonths && { serviceIntervalMonths: parseInt(serviceIntervalMonths) }),
        ...(notes && { notes }),
      }
      const saved: Equipment = existing
        ? await api.patch(`/api/equipment/${existing.id}`, body)
        : await api.post("/api/equipment", body)
      onSaved(saved)
      onOpenChange(false)
      toast.success(existing ? "Equipment updated" : "Equipment added")
    } catch {
      toast.error("Failed to save equipment")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{existing ? "Edit Equipment" : "Add Equipment"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Equipment Type *</label>
            <Select value={equipmentType} onValueChange={setEquipmentType}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {EQUIPMENT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Make</label>
              <Input className="mt-1" value={make} onChange={(e) => setMake(e.target.value)} placeholder="e.g. Carrier" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Model</label>
              <Input className="mt-1" value={model} onChange={(e) => setModel(e.target.value)} placeholder="e.g. 24ACC636A003" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Serial Number</label>
            <Input className="mt-1" value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} placeholder="S/N" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Install Date</label>
              <Input className="mt-1" type="date" value={installDate} onChange={(e) => setInstallDate(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Warranty Expiry</label>
              <Input className="mt-1" type="date" value={warrantyExpiry} onChange={(e) => setWarrantyExpiry(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Service Interval</label>
            <Select value={serviceIntervalMonths} onValueChange={setServiceIntervalMonths}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>
                {INTERVALS.map((i) => (
                  <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Notes</label>
            <Input className="mt-1" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={submitting || !equipmentType}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {existing ? "Save changes" : "Add equipment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
