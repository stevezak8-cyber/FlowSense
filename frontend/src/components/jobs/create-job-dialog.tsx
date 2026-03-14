import { useState, useEffect } from "react"
import { api } from "@/api/client"
import type { ApiCustomer, ApiTechnician, CreateJobPayload } from "@/api/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Loader2 } from "lucide-react"

interface CreateJobDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
}

export function CreateJobDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateJobDialogProps) {
  const [customers, setCustomers] = useState<ApiCustomer[]>([])
  const [technicians, setTechnicians] = useState<ApiTechnician[]>([])
  const [loadingOptions, setLoadingOptions] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Form state
  const [customerId, setCustomerId] = useState("")
  const [technicianId, setTechnicianId] = useState("")
  const [scheduledAt, setScheduledAt] = useState("")
  const [scheduledTime, setScheduledTime] = useState("09:00")
  const [priority, setPriority] = useState<"low" | "normal" | "high" | "urgent">("normal")
  const [equipmentType, setEquipmentType] = useState("")
  const [symptomSummary, setSymptomSummary] = useState("")
  const [equipmentNotes, setEquipmentNotes] = useState("")

  useEffect(() => {
    if (!open) return
    setLoadingOptions(true)
    Promise.all([
      api.get<ApiCustomer[]>("/api/customers"),
      api.get<ApiTechnician[]>("/api/technicians"),
    ])
      .then(([c, t]) => {
        setCustomers(c)
        setTechnicians(t)
      })
      .catch((e) => console.error("Failed to load options:", e))
      .finally(() => setLoadingOptions(false))
  }, [open])

  function resetForm() {
    setCustomerId("")
    setTechnicianId("")
    setScheduledAt("")
    setScheduledTime("09:00")
    setPriority("normal")
    setEquipmentType("")
    setSymptomSummary("")
    setEquipmentNotes("")
    setError(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!customerId || !scheduledAt) return

    setSubmitting(true)
    setError(null)

    const payload: CreateJobPayload = {
      customerId,
      scheduledAt: new Date(`${scheduledAt}T${scheduledTime}`).toISOString(),
      priority,
      ...(technicianId && { technicianId }),
      ...(equipmentType && { equipmentType }),
      ...(symptomSummary && { symptomSummary }),
      ...(equipmentNotes && { equipmentNotes }),
    }

    try {
      await api.post("/api/jobs", payload)
      resetForm()
      onCreated()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create job")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); onOpenChange(v) }}>
      <DialogContent className="bg-card border-border text-card-foreground sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-foreground">Create New Job</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Fill in the details to schedule a new service job
          </DialogDescription>
        </DialogHeader>

        {loadingOptions ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">Loading...</span>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Customer */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                Customer *
              </label>
              <Select value={customerId} onValueChange={setCustomerId}>
                <SelectTrigger className="h-10 bg-secondary border-border text-foreground text-xs">
                  <SelectValue placeholder="Select a customer" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id} className="text-xs text-foreground">
                      {c.name} — {c.address}, {c.city}
                    </SelectItem>
                  ))}
                  {customers.length === 0 && (
                    <div className="px-3 py-2 text-xs text-muted-foreground">No customers found. Create one first.</div>
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Technician */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                Assign Technician
              </label>
              <Select value={technicianId} onValueChange={setTechnicianId}>
                <SelectTrigger className="h-10 bg-secondary border-border text-foreground text-xs">
                  <SelectValue placeholder="Unassigned (optional)" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {technicians.map((t) => (
                    <SelectItem key={t.id} value={t.id} className="text-xs text-foreground">
                      {t.name}{t.skills.length > 0 ? ` (${t.skills.join(", ")})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Schedule */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                  Date *
                </label>
                <Input
                  type="date"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  className="h-10 bg-secondary border-border text-foreground text-xs"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                  Time
                </label>
                <Input
                  type="time"
                  value={scheduledTime}
                  onChange={(e) => setScheduledTime(e.target.value)}
                  className="h-10 bg-secondary border-border text-foreground text-xs"
                />
              </div>
            </div>

            {/* Priority & Equipment */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                  Priority
                </label>
                <Select value={priority} onValueChange={(v) => setPriority(v as typeof priority)}>
                  <SelectTrigger className="h-10 bg-secondary border-border text-foreground text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value="low" className="text-xs text-foreground">Low</SelectItem>
                    <SelectItem value="normal" className="text-xs text-foreground">Normal</SelectItem>
                    <SelectItem value="high" className="text-xs text-foreground">High</SelectItem>
                    <SelectItem value="urgent" className="text-xs text-foreground">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                  Equipment Type
                </label>
                <Select value={equipmentType} onValueChange={setEquipmentType}>
                  <SelectTrigger className="h-10 bg-secondary border-border text-foreground text-xs">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value="furnace" className="text-xs text-foreground">Furnace</SelectItem>
                    <SelectItem value="ac" className="text-xs text-foreground">AC</SelectItem>
                    <SelectItem value="heat-pump" className="text-xs text-foreground">Heat Pump</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Symptom Summary */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                Symptom Summary
              </label>
              <Input
                placeholder="Brief description of the issue..."
                value={symptomSummary}
                onChange={(e) => setSymptomSummary(e.target.value)}
                className="h-10 bg-secondary border-border text-foreground text-xs placeholder:text-muted-foreground"
              />
            </div>

            {/* Equipment Notes */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                Equipment Notes
              </label>
              <Textarea
                placeholder="Model, serial number, or other details..."
                value={equipmentNotes}
                onChange={(e) => setEquipmentNotes(e.target.value)}
                className="min-h-[60px] bg-secondary border-border text-foreground text-xs placeholder:text-muted-foreground resize-none"
              />
            </div>

            {error && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {error}
              </div>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => { resetForm(); onOpenChange(false) }}
                className="border-border text-foreground hover:bg-secondary"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={submitting || !customerId || !scheduledAt}
                className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Create Job
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
