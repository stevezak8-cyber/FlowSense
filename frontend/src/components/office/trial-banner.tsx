import { useState } from "react"
import { useAuth } from "../../auth/auth-context"

export function TrialBanner() {
  const { user } = useAuth()
  const [dismissed, setDismissed] = useState(false)

  if (dismissed || user?.organization?.plan !== "trial") return null

  const trialEndsAt = user.organization.trialEndsAt
  let trialLabel: string
  if (trialEndsAt) {
    const msLeft = new Date(trialEndsAt).getTime() - Date.now()
    const daysLeft = Math.max(0, Math.ceil(msLeft / (1000 * 60 * 60 * 24)))
    const dateStr = new Date(trialEndsAt).toLocaleDateString()
    trialLabel = daysLeft <= 1 ? `today (${dateStr})` : `in ${daysLeft} days (${dateStr})`
  } else {
    trialLabel = "soon"
  }

  return (
    <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center justify-between text-sm text-amber-800">
      <span>
        Your free trial ends <strong>{trialLabel}</strong>. You won't be charged until then.
      </span>
      <button
        onClick={() => setDismissed(true)}
        className="ml-4 text-amber-600 hover:text-amber-800 font-medium"
      >
        Dismiss
      </button>
    </div>
  )
}
