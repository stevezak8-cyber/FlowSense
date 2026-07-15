import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { ChevronDown, ChevronUp, CheckCircle2, Circle } from "lucide-react"
import { api } from "@/api/client"
import type { OnboardingStatus } from "@/api/types"

interface Props {
  refreshKey: number
}

export function OnboardingChecklist({ refreshKey }: Props) {
  const navigate = useNavigate()
  const [status, setStatus] = useState<OnboardingStatus | null>(null)
  const [collapsed, setCollapsed] = useState(() =>
    localStorage.getItem("onboarding_checklist_collapsed") === "true"
  )
  const [hidden, setHidden] = useState(false)
  const [allDoneShown, setAllDoneShown] = useState(false)

  useEffect(() => {
    api
      .get<OnboardingStatus>("/api/onboarding/status")
      .then(setStatus)
      .catch(() => setHidden(true))
  }, [refreshKey])

  // Auto-dismiss when all steps complete
  useEffect(() => {
    if (!status || status.dismissed) return
    const allDone = Object.values(status.steps).every(Boolean)
    if (allDone && !allDoneShown) {
      setAllDoneShown(true)
      setTimeout(() => {
        setHidden(true)
        api.post("/api/onboarding/dismiss", {}).catch(() => {})
      }, 2000)
    }
  }, [status, allDoneShown])

  function toggleCollapse() {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem("onboarding_checklist_collapsed", String(next))
  }

  function dismiss() {
    setHidden(true)
    api.post("/api/onboarding/dismiss", {}).catch(() => {})
  }

  if (hidden || !status || status.dismissed) return null

  const steps = [
    { key: "companyProfile" as const, label: "Set up your company", href: "/office/settings" },
    { key: "technician" as const, label: "Add your first technician", href: "/office/technicians?open=add-technician" },
    { key: "customer" as const, label: "Add your first customer", href: "/office/customers?open=add-customer" },
    { key: "job" as const, label: "Create your first job", href: "/office/jobs?open=create-job" },
    { key: "stripeConnect" as const, label: "Connect Stripe to accept deposits", href: "/office/settings" },
  ]

  const completedCount = steps.filter((s) => status.steps[s.key]).length
  const allDone = completedCount === steps.length

  if (allDone && allDoneShown) {
    return (
      <div className="mx-3 mb-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-300">
        You're all set! FlowSense is ready.
      </div>
    )
  }

  return (
    <div className="mx-3 mb-3 rounded-xl border border-border bg-sidebar-accent/40 text-[13px]">
      {/* Header */}
      <button
        onClick={toggleCollapse}
        className="flex w-full items-center justify-between px-3 py-2.5 font-medium text-foreground"
      >
        <span>
          Getting Started{" "}
          <span className="ml-1 font-normal text-muted-foreground">
            {completedCount}/{steps.length}
          </span>
        </span>
        {collapsed ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {!collapsed && (
        <>
          {/* Progress bar */}
          <div className="mx-3 mb-2 h-1.5 rounded-full bg-border">
            <div
              className="h-1.5 rounded-full bg-teal-500 transition-all"
              style={{ width: `${(completedCount / steps.length) * 100}%` }}
            />
          </div>

          {/* Steps */}
          <div className="px-1 pb-1">
            {steps.map((step) => {
              const done = status.steps[step.key]
              return (
                <button
                  key={step.key}
                  disabled={done}
                  onClick={() => !done && navigate(step.href)}
                  className={[
                    "flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors",
                    done
                      ? "cursor-default text-muted-foreground"
                      : "cursor-pointer text-foreground hover:bg-sidebar-accent",
                  ].join(" ")}
                >
                  {done ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-teal-500" />
                  ) : (
                    <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className={done ? "line-through" : ""}>{step.label}</span>
                </button>
              )
            })}
          </div>

          {/* Dismiss */}
          <div className="border-t border-border px-3 py-2 text-right">
            <button
              onClick={dismiss}
              className="text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              Dismiss
            </button>
          </div>
        </>
      )}
    </div>
  )
}
