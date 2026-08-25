import { useEffect, useState } from "react"
import { api } from "@/api/client"
import type { CustomerJobHistoryItem } from "@/api/types"
import { Loader2, Star } from "lucide-react"

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

function StarRating({ rating, onRate }: { rating: number; onRate?: (r: number) => void }) {
  const [hover, setHover] = useState(0)
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onRate?.(n)}
          onMouseEnter={() => onRate && setHover(n)}
          onMouseLeave={() => onRate && setHover(0)}
          disabled={!onRate}
          className="disabled:cursor-default"
        >
          <Star
            className={`h-4 w-4 ${n <= (hover || rating) ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"}`}
          />
        </button>
      ))}
    </div>
  )
}

function ReviewSection({ job, onReviewed }: { job: CustomerJobHistoryItem; onReviewed: (review: NonNullable<CustomerJobHistoryItem["review"]>) => void }) {
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

  if (job.review) {
    return (
      <div className="mt-3 pt-3 border-t border-border">
        <p className="text-xs text-muted-foreground mb-1">Your review</p>
        <StarRating rating={job.review.rating} />
        {job.review.comment && <p className="text-sm text-muted-foreground mt-1">{job.review.comment}</p>}
      </div>
    )
  }

  async function submit() {
    if (!rating) { setError("Select a star rating."); return }
    setSubmitting(true); setError("")
    try {
      const res = await fetch(`/api/jobs/${job.id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("flowsense_token")}` },
        body: JSON.stringify({ rating, comment: comment || undefined }),
      })
      if (res.status === 201) { onReviewed(await res.json()) }
      else if (res.status === 409) { const data = await res.json(); onReviewed(data.existing) }
      else { setError("Could not submit review.") }
    } catch { setError("Could not submit review.") } finally { setSubmitting(false) }
  }

  return (
    <div className="mt-3 pt-3 border-t border-border">
      <p className="text-xs text-muted-foreground mb-2">Rate this visit</p>
      <StarRating rating={rating} onRate={setRating} />
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Leave a comment (optional)"
        className="mt-2 w-full rounded border px-2 py-1.5 text-sm bg-background resize-none"
        rows={2}
      />
      {error && <p className="text-xs text-destructive mt-1">{error}</p>}
      <button onClick={submit} disabled={submitting} className="mt-2 rounded bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
        {submitting ? "Submitting…" : "Submit review"}
      </button>
    </div>
  )
}

export default function CustomerHistory() {
  const [items, setItems] = useState<CustomerJobHistoryItem[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [cancellingId, setCancellingId] = useState<string | null>(null)

  useEffect(() => {
    api.get<CustomerJobHistoryItem[]>("/api/customers/me/jobs")
      .then(setItems)
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [])

  async function handleCancel(id: string) {
    if (!confirm("Cancel this appointment?")) return
    setCancellingId(id)
    try {
      await fetch(`/api/jobs/${id}/cancel`, {
        method: "POST",
        headers: { Authorization: `Bearer ${localStorage.getItem("flowsense_token")}` },
      })
      setItems(prev => prev?.map(j => j.id === id ? { ...j, status: "cancelled" } : j) ?? null)
    } catch { /* silent */ } finally { setCancellingId(null) }
  }

  function handleReviewed(jobId: string, review: NonNullable<CustomerJobHistoryItem["review"]>) {
    setItems(prev => prev?.map(j => j.id === jobId ? { ...j, review } : j) ?? null)
  }

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  if (error) return <p className="py-10 text-center text-sm text-muted-foreground">Could not load job history.</p>
  if (!items || items.length === 0) return <div className="py-10 text-center"><p className="text-sm text-muted-foreground">No service history yet.</p></div>

  const upcoming = items.filter(j => ["pending", "scheduled"].includes(j.status))
  const past = items.filter(j => !["pending", "scheduled"].includes(j.status))

  return (
    <div className="space-y-6">
      {upcoming.length > 0 && (
        <div>
          <h1 className="text-lg font-semibold mb-3">Upcoming Appointments</h1>
          <div className="space-y-3">
            {upcoming.map((item) => (
              <div key={item.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="font-semibold">{item.equipmentType ?? "Service"}</span>
                  <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">{item.status}</span>
                </div>
                <div className="text-sm text-muted-foreground mb-2">{formatDate(item.scheduledAt)}</div>
                {item.symptomSummary && <p className="text-sm text-muted-foreground">{item.symptomSummary}</p>}
                <button
                  onClick={() => handleCancel(item.id)}
                  disabled={cancellingId === item.id}
                  className="mt-3 text-xs text-destructive hover:underline disabled:opacity-50"
                >
                  {cancellingId === item.id ? "Cancelling…" : "Cancel appointment"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {past.length > 0 && (
        <div>
          <h1 className="text-lg font-semibold mb-3">Job History</h1>
          <div className="space-y-3">
            {past.map((item) => (
              <div key={item.id} className="rounded-xl border border-border bg-card p-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="font-semibold">{item.equipmentType ?? "Service"}</span>
                  <span className={item.status === "completed"
                    ? "rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700"
                    : "rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"}>
                    {item.status}
                  </span>
                </div>
                <div className="text-sm text-muted-foreground mb-1">{formatDate(item.scheduledAt)}</div>
                {item.symptomSummary && <p className="text-sm text-muted-foreground mt-1">{item.symptomSummary}</p>}
                {item.actionsTaken && <p className="text-sm text-muted-foreground mt-1 line-clamp-3"><span className="font-medium text-foreground">Work done:</span> {item.actionsTaken}</p>}
                {item.technician && <p className="text-sm text-muted-foreground mt-1">Technician: {item.technician.name}</p>}
                {item.status === "completed" && (
                  <ReviewSection job={item} onReviewed={(r) => handleReviewed(item.id, r)} />
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
