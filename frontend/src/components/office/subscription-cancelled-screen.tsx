import { useState, useEffect } from "react"
import { useAuth } from "../../auth/auth-context"

export function SubscriptionCancelledScreen() {
  const { user } = useAuth()
  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (user?.organization?.plan === "cancelled") {
      setShow(true)
    }
    const handler = () => setShow(true)
    window.addEventListener("subscription:cancelled", handler)
    return () => window.removeEventListener("subscription:cancelled", handler)
  }, [user?.organization?.plan])

  if (!show) return null

  const handlePortal = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/billing/portal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("flowsense_token")}`,
        },
      })
      const data = await res.json()
      if ((data as { url?: string }).url) window.location.href = (data as { url: string }).url
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-2xl p-8 max-w-md w-full mx-4 text-center">
        <h2 className="text-2xl font-bold text-gray-900 mb-3">Subscription Ended</h2>
        <p className="text-gray-600 mb-6">
          Your subscription has ended. Reactivate via the billing portal to restore access.
        </p>
        <button
          onClick={handlePortal}
          disabled={loading}
          className="w-full bg-teal-600 text-white py-3 px-6 rounded-lg font-medium hover:bg-teal-700 disabled:opacity-50"
        >
          {loading ? "Opening billing portal..." : "Reactivate Subscription"}
        </button>
      </div>
    </div>
  )
}
