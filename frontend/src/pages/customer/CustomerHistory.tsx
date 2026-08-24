import { useEffect, useState } from "react"
import { api } from "@/api/client"
import type { CustomerJobHistoryItem, JobReview } from "@/api/types"
import { Loader2 } from "lucide-react"

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

export default function CustomerHistory() {
  const [items, setItems] = useState<CustomerJobHistoryItem[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const [cancelError, setCancelError] = useState<string>("")
  const [reviewState, setReviewState] = useState<Record<string, { rating: number; comment: string; submitting: boolean }>>({})

  useEffect(() => {
    api.get<CustomerJobHistoryItem[]>("/api/customers/me/jobs")
      .then(setItems)
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [])

  const handleCancel = async (jobId: string) => {
    if (!confirm("Cancel this appointment?")) return
    setCancellingId(jobId)
    setCancelError("")
    const token = localStorage.getItem("flowsense_token")
    const res = await fetch(`/api/jobs/${jobId}/cancel`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) {
      setItems((prev) => prev ? prev.filter((j) => j.id !== jobId) : prev)
    } else {
      const data = await res.json().catch(() => ({}))
      setCancelError(data.error ?? "Failed to cancel")
    }
    setCancellingId(null)
  }

  const handleSubmitReview = async (jobId: string) => {
    const state = reviewState[jobId]
    if (!state || !state.rating) return
    setReviewState((prev) => ({ ...prev, [jobId]: { ...prev[jobId], submitting: true } }))
    const token = localStorage.getItem("flowsense_token")
    const res = await fetch(`/api/jobs/${jobId}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ rating: state.rating, comment: state.comment || undefined }),
    })
    if (res.ok || res.status === 409) {
      const review: JobReview = await res.json()
      setItems((prev) => prev ? prev.map((j) => j.id === jobId ? { ...j, review } : j) : prev)
      setReviewState((prev) => { const n = { ...prev }; delete n[jobId]; return n })
    } else {
      setReviewState((prev) => ({ ...prev, [jobId]: { ...prev[jobId], submitting: false } }))
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Could not load job history.</p>
  }

  if (!items || items.length === 0) {
    return (
      <div className="py-10 text-center">
        <p className="text-sm text-muted-foreground">No jobs yet.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Job History</h1>
        <p className="text-sm text-muted-foreground">Your service visits</p>
      </div>
      {cancelError && (
        <p className="text-sm text-red-600">{cancelError}</p>
      )}
      <div className="space-y-3">
        {items.map((item) => (
          <div key={item.id} className="rounded-xl border border-border bg-card p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="font-semibold">{item.equipmentType ?? "Service"}</span>
              <span
                className={
                  item.status === "completed"
                    ? "rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400"
                    : "rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
                }
              >
                {item.status}
              </span>
            </div>
            <div className="text-sm text-muted-foreground mb-1">{formatDate(item.scheduledAt)}</div>
            {item.symptomSummary && (
              <p className="text-sm text-muted-foreground mt-1">{item.symptomSummary}</p>
            )}
            {item.actionsTaken && (
              <p className="text-sm text-muted-foreground mt-1 line-clamp-3">
                <span className="font-medium text-foreground">Work done:</span> {item.actionsTaken}
              </p>
            )}
            {item.technician && (
              <p className="text-sm text-muted-foreground mt-1">Technician: {item.technician.name}</p>
            )}
            {(item.status === "pending" || item.status === "scheduled") && (
              <div className="mt-2">
                <button
                  onClick={() => handleCancel(item.id)}
                  disabled={cancellingId === item.id}
                  className="text-sm text-red-600 hover:underline disabled:opacity-50"
                >
                  {cancellingId === item.id ? "Cancelling..." : "Cancel appointment"}
                </button>
              </div>
            )}
            {item.status === "completed" && (
              <div className="mt-2 pt-2 border-t">
                {item.review ? (
                  <div className="text-sm">
                    <span className="text-amber-500">{"★".repeat(item.review.rating)}{"☆".repeat(5 - item.review.rating)}</span>
                    {item.review.comment && <p className="text-muted-foreground mt-1">{item.review.comment}</p>}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Rate this visit</p>
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          onClick={() => setReviewState((prev) => ({
                            ...prev,
                            [item.id]: { rating: star, comment: prev[item.id]?.comment ?? "", submitting: false }
                          }))}
                          className={`text-xl ${(reviewState[item.id]?.rating ?? 0) >= star ? "text-amber-500" : "text-muted-foreground"}`}
                        >
                          ★
                        </button>
                      ))}
                    </div>
                    {(reviewState[item.id]?.rating ?? 0) > 0 && (
                      <>
                        <textarea
                          placeholder="Leave a comment (optional)"
                          value={reviewState[item.id]?.comment ?? ""}
                          onChange={(e) => setReviewState((prev) => ({
                            ...prev,
                            [item.id]: { ...prev[item.id], comment: e.target.value }
                          }))}
                          className="w-full border rounded px-2 py-1 text-sm resize-none"
                          rows={2}
                        />
                        <button
                          onClick={() => handleSubmitReview(item.id)}
                          disabled={reviewState[item.id]?.submitting}
                          className="text-sm bg-primary text-primary-foreground px-3 py-1 rounded disabled:opacity-50"
                        >
                          {reviewState[item.id]?.submitting ? "Submitting..." : "Submit"}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
