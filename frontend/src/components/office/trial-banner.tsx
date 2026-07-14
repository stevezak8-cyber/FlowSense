import { useState } from "react"
import { useAuth } from "../../auth/auth-context"

export function TrialBanner() {
  const { user } = useAuth()
  const [dismissed, setDismissed] = useState(false)

  if (dismissed || user?.organization?.plan !== "trial") return null

  const trialEnd = user.organization.trialEndsAt
    ? new Date(user.organization.trialEndsAt).toLocaleDateString()
    : "30 days"

  return (
    <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center justify-between text-sm text-amber-800">
      <span>
        Your 30-day free trial ends on <strong>{trialEnd}</strong>. You won't be charged until then.
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
