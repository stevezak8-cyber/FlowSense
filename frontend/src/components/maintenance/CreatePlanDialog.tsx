import { useState, useEffect } from "react"
import type { CreateMaintenancePlanBody } from "../../api/types"

interface Customer { id: string; name: string }
interface Equipment { id: string; make: string | null; model: string | null; equipmentType: string }

interface ItemDraft {
  equipmentId: string
  serviceType: string
  intervalMonths: 6 | 12
}

interface Props {
  open: boolean
  onClose: () => void
  onCreated: () => void
}

export function CreatePlanDialog({ open, onClose, onCreated }: Props) {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [equipment, setEquipment] = useState<Equipment[]>([])
  const [customerId, setCustomerId] = useState("")
  const [name, setName] = useState("")
  const [price, setPrice] = useState("")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [items, setItems] = useState<ItemDraft[]>([{ equipmentId: "", serviceType: "", intervalMonths: 12 }])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!open) return
    fetch("/api/customers", { headers: { Authorization: `Bearer ${localStorage.getItem("flowsense_token")}` } }).then((r) => r.json()).then(setCustomers).catch(() => {})
  }, [open])

  useEffect(() => {
    if (!customerId) { setEquipment([]); return }
    fetch(`/api/equipment?customerId=${customerId}`, { headers: { Authorization: `Bearer ${localStorage.getItem("flowsense_token")}` } }).then((r) => r.json()).then(setEquipment).catch(() => {})
  }, [customerId])

  function resetForm() {
    setCustomerId(""); setName(""); setPrice(""); setStartDate(""); setEndDate("")
    setItems([{ equipmentId: "", serviceType: "", intervalMonths: 12 }])
    setError("")
  }

  function handleClose() { resetForm(); onClose() }

  function updateItem(idx: number, patch: Partial<ItemDraft>) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!customerId || !name || !startDate || !endDate) { setError("All fields are required."); return }
    if (new Date(endDate) <= new Date(startDate)) { setError("End date must be after start date."); return }
    if (items.some((it) => !it.equipmentId)) { setError("Each item must have equipment selected."); return }

    setSubmitting(true)
    setError("")
    const body: CreateMaintenancePlanBody = {
      customerId,
      name,
      price: parseFloat(price) || 0,
      startDate: new Date(startDate).toISOString(),
      endDate: new Date(endDate).toISOString(),
      items: items.map((it) => ({ equipmentId: it.equipmentId, serviceType: it.serviceType || undefined, intervalMonths: it.intervalMonths })),
    }
    try {
      const res = await fetch("/api/maintenance-plans", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("flowsense_token")}` },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error()
      resetForm()
      onCreated()
    } catch {
      setError("Failed to create plan. Try again.")
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-xl bg-background p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold">New Maintenance Plan</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground">Customer</label>
            <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="mt-1 w-full rounded border px-2 py-1.5 text-sm bg-background">
              <option value="">Select customer...</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs text-muted-foreground">Plan name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Gold Plan" className="mt-1 w-full rounded border px-2 py-1.5 text-sm bg-background" />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground">Start date</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="mt-1 w-full rounded border px-2 py-1.5 text-sm bg-background" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">End date</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="mt-1 w-full rounded border px-2 py-1.5 text-sm bg-background" />
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground">Price ($)</label>
            <input type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="299.00" className="mt-1 w-full rounded border px-2 py-1.5 text-sm bg-background" />
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Equipment covered</p>
            <div className="mt-2 space-y-2">
              {items.map((item, idx) => (
                <div key={idx} className="rounded border p-2">
                  <div className="flex gap-2">
                    <select value={item.equipmentId} onChange={(e) => updateItem(idx, { equipmentId: e.target.value })} className="flex-1 rounded border px-2 py-1 text-xs bg-background">
                      <option value="">{customerId ? "Select equipment..." : "Select customer first"}</option>
                      {equipment.map((eq) => <option key={eq.id} value={eq.id}>{eq.equipmentType}{eq.make ? ` — ${eq.make}` : ""}{eq.model ? ` ${eq.model}` : ""}</option>)}
                    </select>
                    <select value={item.intervalMonths} onChange={(e) => updateItem(idx, { intervalMonths: Number(e.target.value) as 6 | 12 })} className="rounded border px-2 py-1 text-xs bg-background">
                      <option value={12}>Every 12 months</option>
                      <option value={6}>Every 6 months</option>
                    </select>
                    {items.length > 1 && (
                      <button type="button" onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))} className="text-muted-foreground hover:text-destructive text-xs">✕</button>
                    )}
                  </div>
                  <input value={item.serviceType} onChange={(e) => updateItem(idx, { serviceType: e.target.value })} placeholder="Service type (e.g. Annual tune-up)" className="mt-1 w-full rounded border px-2 py-1 text-xs bg-background" />
                </div>
              ))}
            </div>
            <button type="button" onClick={() => setItems((prev) => [...prev, { equipmentId: "", serviceType: "", intervalMonths: 12 }])} className="mt-1 text-xs text-primary hover:underline">
              + Add equipment
            </button>
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={handleClose} className="rounded border px-3 py-1.5 text-sm hover:bg-muted">Cancel</button>
            <button type="submit" disabled={submitting} className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {submitting ? "Creating..." : "Create plan + generate invoice"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
