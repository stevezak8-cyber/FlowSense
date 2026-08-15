import { useEffect, useState } from "react"
import { api } from "@/api/client"
import type { CustomerEquipmentItem } from "@/api/types"
import { Loader2, Wrench } from "lucide-react"

function nextDueDate(item: CustomerEquipmentItem): Date | null {
  if (!item.lastServicedAt || !item.serviceIntervalMonths) return null
  const d = new Date(item.lastServicedAt)
  d.setMonth(d.getMonth() + item.serviceIntervalMonths)
  return d
}

function formatDate(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("en-US", { month: "short", year: "numeric" })
}

function NextDueCell({ item }: { item: CustomerEquipmentItem }) {
  const due = nextDueDate(item)
  if (!due) return <span className="text-muted-foreground">—</span>
  const now = new Date()
  const days = (due.getTime() - now.getTime()) / 86400000
  if (days < 0) return <span className="font-semibold text-red-600 dark:text-red-400">{formatDate(due.toISOString())} (overdue)</span>
  if (days < 60) return <span className="font-semibold text-amber-600 dark:text-amber-400">{formatDate(due.toISOString())}</span>
  return <span>{formatDate(due.toISOString())}</span>
}

export default function CustomerEquipment() {
  const [items, setItems] = useState<CustomerEquipmentItem[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    api.get<CustomerEquipmentItem[]>("/api/customers/me/equipment")
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
    return <p className="py-10 text-center text-sm text-muted-foreground">Could not load equipment.</p>
  }

  if (!items || items.length === 0) {
    return (
      <div className="py-10 text-center">
        <Wrench className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">No equipment on file. Contact us to register your units.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">My Equipment</h1>
        <p className="text-sm text-muted-foreground">Your registered HVAC units</p>
      </div>
      <div className="space-y-3">
        {items.map((item) => (
          <div key={item.id} className="rounded-xl border border-border bg-card p-4">
            <div className="mb-3 flex items-start justify-between">
              <div>
                <div className="font-semibold">{item.equipmentType}</div>
                {(item.make || item.model) && (
                  <div className="text-sm text-muted-foreground">
                    {[item.make, item.model].filter(Boolean).join(" · ")}
                  </div>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <div>
                <div className="text-xs text-muted-foreground">Serial</div>
                <div>{item.serialNumber ?? "—"}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Install date</div>
                <div>{formatDate(item.installDate)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Last serviced</div>
                <div>{formatDate(item.lastServicedAt)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Next due</div>
                <NextDueCell item={item} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
