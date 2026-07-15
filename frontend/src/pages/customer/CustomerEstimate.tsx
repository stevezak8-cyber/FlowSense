import { useState, useEffect } from "react"
import { useParams } from "react-router-dom"
import { Estimate } from "@/api/types"
import { EstimateTiers } from "@/components/estimates/estimate-tiers"
import { EstimateApproval } from "@/components/estimates/estimate-approval"
import { AlertTriangle, CheckCircle } from "lucide-react"

type Step = "tiers" | "approval" | "done"
type Tier = "good" | "better" | "best"

export default function CustomerEstimate() {
  const { token } = useParams<{ token: string }>()
  const [estimate, setEstimate] = useState<Estimate | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [step, setStep] = useState<Step>("tiers")
  const [selectedTier, setSelectedTier] = useState<Tier>("better")
  const [depositResult, setDepositResult] = useState<"paid" | "cancelled" | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const d = params.get("deposit")
    if (d === "paid") setDepositResult("paid")
    else if (d === "cancelled") setDepositResult("cancelled")
  }, [])

  useEffect(() => {
    if (!token) return
    fetch(`/api/estimates/token/${token}`)
      .then(async (res) => {
        if (res.status === 410) {
          setError("This estimate has expired — please contact us to request a new one.")
          return
        }
        if (res.status === 404) {
          setError("Estimate not found.")
          return
        }
        if (!res.ok) {
          setError("Something went wrong loading this estimate.")
          return
        }
        const data: Estimate = await res.json()
        if (data.status === "approved") {
          setStep("done")
        }
        setEstimate(data)
      })
      .catch(() => setError("Something went wrong loading this estimate."))
      .finally(() => setLoading(false))
  }, [token])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading estimate…</p>
      </div>
    )
  }

  if (error || !estimate) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 px-4 text-center">
        <AlertTriangle className="h-8 w-8 text-destructive" />
        <p className="text-sm">{error ?? "Something went wrong."}</p>
      </div>
    )
  }

  if (step === "done") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 px-4 text-center">
        <CheckCircle className="h-10 w-10 text-green-500" />
        <h2 className="font-bold text-lg">
          {depositResult === "paid" ? "Deposit Received!" : "Estimate Approved"}
        </h2>
        <p className="text-sm text-muted-foreground">
          {depositResult === "paid"
            ? "Your deposit has been received and your appointment is confirmed. Your technician will be in touch soon."
            : estimate?.selectedTier
            ? `You selected the ${estimate.selectedTier} plan. Our team will be in touch soon.`
            : "Your approval has been recorded. Our team will be in touch soon."}
        </p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background p-4 pt-8">
      {step === "tiers" && (
        <EstimateTiers
          estimate={estimate}
          onSelect={(tier) => {
            setSelectedTier(tier)
            setStep("approval")
          }}
        />
      )}
      {step === "approval" && depositResult === "cancelled" && (
        <div className="max-w-sm mx-auto mb-3 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
          Payment was cancelled. You can try again below.
        </div>
      )}
      {step === "approval" && token && (
        <EstimateApproval
          estimate={estimate}
          tier={selectedTier}
          token={token}
          onApproved={() => setStep("done")}
        />
      )}
    </div>
  )
}
