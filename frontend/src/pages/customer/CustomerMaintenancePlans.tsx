import { useEffect, useState } from "react"
import { api } from "@/api/client"
import type { MaintenancePlan } from "@/api/types"
import { Loader2, ShieldCheck, CalendarDays, Wrench, CheckCircle2, Clock, XCircle } from "lucide-react"
import { cn } from "@/lib/utils"

const statusConfig: Record<string, { label: string; className: string; icon: typeof CheckCircle2 }> = {
  active: { label: "Active", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300", icon: CheckCircle2 },
  pending: { label: "Pending", className: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300", icon: Clock },
  expired: { label: "Expired", className: "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400", icon: XCircle },
  cancelled: { label: "Cancelled", className: "bg-rose-100 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400", icon: XCircle },
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

export default function CustomerMaintenancePlans() {
  const [plans, setPlans] = useState<MaintenancePlan[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.get<MaintenancePlan[]>("/api/maintenance-plans")
      .then(setPlans)
      .catch(() => setError("Could not load your maintenance plans."))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return <p className="text-center text-sm text-destructive py-12">{error}</p>
  }

  if (plans.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
        <ShieldCheck className="h-12 w-12 text-muted-foreground/30" />
        <h2 className="text-lg font-semibold text-foreground">No Maintenance Plans</h2>
        <p className="text-sm text-muted-foreground max-w-sm">
          You don't have any maintenance plans yet. Contact us to set up a plan and keep your systems running smoothly.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Maintenance Plans</h1>
        <p className="text-sm text-muted-foreground mt-1">Your scheduled service agreements</p>
      </div>

      <div className="space-y-4">
        {plans.map((plan) => {
          const status = statusConfig[plan.status] ?? statusConfig.pending
          const StatusIcon = status.icon
          const totalItems = plan.items.length

          return (
            <div key={plan.id} className="rounded-2xl border border-border/60 bg-card shadow-sm overflow-hidden">
              {/* Header */}
              <div className="px-5 py-4 flex items-start justify-between gap-3 border-b border-border/60">
                <div>
                  <h3 className="text-base font-bold text-foreground">{plan.name}</h3>
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <CalendarDays className="h-3.5 w-3.5" />
                      <span>{formatDate(plan.startDate)} — {formatDate(plan.endDate)}</span>
                    </div>
                  </div>
                </div>
                <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold flex-shrink-0", status.className)}>
                  <StatusIcon className="h-3 w-3" />{status.label}
                </span>
              </div>

              {/* Items */}
              <div className="px-5 py-4 space-y-2.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
                  Covered Services ({totalItems})
                </p>
                {plan.items.map((item) => {
                  const equipLabel = item.equipment
                    ? [item.equipment.make, item.equipment.model].filter(Boolean).join(" ") || item.equipment.equipmentType
                    : item.serviceType ?? "General Service"
                  return (
                    <div key={item.id} className="flex items-center gap-2.5 rounded-xl bg-muted/50 px-3 py-2.5">
                      <Wrench className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">{equipLabel}</p>
                        {item.serviceType && item.equipment && (
                          <p className="text-[10px] text-muted-foreground">{item.serviceType}</p>
                        )}
                      </div>
                      <span className="text-[10px] font-semibold text-muted-foreground flex-shrink-0">
                        Every {item.intervalMonths}mo
                      </span>
                    </div>
                  )
                })}
              </div>

              {/* Footer */}
              <div className="px-5 py-3 border-t border-border/60 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Annual cost</span>
                <span className="text-sm font-bold text-foreground">
                  ${plan.price.toFixed(2)}/yr
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
