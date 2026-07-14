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
        <h2 className="font-bold text-lg">Estimate Approved</h2>
        <p className="text-sm text-muted-foreground">
          {estimate.selectedTier
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
