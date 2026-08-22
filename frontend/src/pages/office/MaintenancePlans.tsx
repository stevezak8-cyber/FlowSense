import { useState, useEffect, useCallback } from "react"
import { Trash2 } from "lucide-react"
import type { MaintenancePlan } from "../../api/types"
import { CreatePlanDialog } from "../../components/maintenance/CreatePlanDialog"

type TabStatus = "active" | "expired" | "all"

const TABS: { label: string; value: TabStatus }[] = [
  { label: "Active", value: "active" },
  { label: "Expired", value: "expired" },
  { label: "All", value: "all" },
]

function statusBadge(status: string) {
  if (status === "active") return <span className="rounded bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800">Active</span>
  if (status === "expired") return <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-500">Expired</span>
  return <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">Cancelled</span>
}

function invoiceBadge(invoice: MaintenancePlan["invoice"]) {
  if (!invoice) return null
  if (invoice.status === "paid") return <span className="rounded bg-purple-100 px-2 py-0.5 text-xs text-purple-700">Invoice paid</span>
  return <span className="rounded bg-yellow-100 px-2 py-0.5 text-xs text-yellow-800">Invoice pending</span>
}

export function MaintenancePlans() {
  const [tab, setTab] = useState<TabStatus>("active")
  const [plans, setPlans] = useState<MaintenancePlan[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const res = await fetch(`/api/maintenance-plans?status=${tab}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("flowsense_token")}` },
      })
      if (!res.ok) throw new Error()
      setPlans(await res.json())
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [tab])

  useEffect(() => { load() }, [load])

  async function cancelPlan(id: string) {
    if (!confirm("Cancel this maintenance plan? This will also deactivate its recurring jobs.")) return
    const res = await fetch(`/api/maintenance-plans/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("flowsense_token")}` },
      body: JSON.stringify({ status: "cancelled" }),
    })
    if (res.ok) load()
  }

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Maintenance Plans</h1>
          <p className="text-sm text-muted-foreground">{plans.length} {tab} plan{plans.length !== 1 ? "s" : ""}</p>
        </div>
        <button
          onClick={() => setDialogOpen(true)}
          className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          + New Plan
        </button>
      </div>

      <div className="mb-4 flex border-b">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              tab === t.value ? "border-primary text-primary" : "border-transparent text-muted-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading && <p className="text-sm text-muted-foreground">Loading...</p>}
      {error && <p className="text-sm text-destructive">Could not load maintenance plans.</p>}

      {!loading && !error && plans.length === 0 && (
        <p className="text-sm text-muted-foreground">No maintenance plans yet. Create your first plan to get started.</p>
      )}

      <div className="space-y-3">
        {plans.map((plan) => (
          <div key={plan.id} className="rounded-lg border p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-semibold">{plan.name} · {plan.customer.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {plan.items.length} unit{plan.items.length !== 1 ? "s" : ""} · {new Date(plan.startDate).toLocaleDateString()} – {new Date(plan.endDate).toLocaleDateString()}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-right">
                  <p className="font-bold text-primary">${plan.price.toFixed(0)}</p>
                  {statusBadge(plan.status)}
                </div>
                {plan.status === "active" && (
                  <button onClick={() => cancelPlan(plan.id)} className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>

            <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
              {plan.items.map((item) => (
                <span key={item.id}>⚙ {item.equipment?.equipmentType ?? "Equipment"} · every {item.intervalMonths}mo</span>
              ))}
            </div>

            <div className="mt-2 flex gap-2">
              {invoiceBadge(plan.invoice)}
            </div>
          </div>
        ))}
      </div>

      <CreatePlanDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onCreated={() => { setDialogOpen(false); load() }}
      />
    </div>
  )
}
