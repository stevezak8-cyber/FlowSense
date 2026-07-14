import { useState } from "react"
import { Estimate } from "@/api/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"

type Tier = "good" | "better" | "best"

interface Props {
  estimate: Estimate
  tier: Tier
  token: string
  onApproved: () => void
}

export function EstimateApproval({ estimate, tier, token, onApproved }: Props) {
  const [signature, setSignature] = useState("")
  const [approving, setApproving] = useState(false)
  const [depositSkipped, setDepositSkipped] = useState(false)

  const tierLines = estimate.lines.filter((l) => l.tier === tier)
  const total = tierLines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0)
  const estimatedDeposit = Math.round(total * 0.25)
  const showDeposit = total >= 500 && !depositSkipped

  async function handleApprove() {
    if (!signature.trim()) {
      toast.error("Please type your full name to sign")
      return
    }
    setApproving(true)
    try {
      const res = await fetch(`/api/estimates/token/${token}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier, signatureData: signature }),
      })
      if (res.status === 409) {
        toast.error("This estimate has already been approved.")
        return
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Request failed" }))
        throw new Error((err as { error?: string }).error ?? "Request failed")
      }
      onApproved()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to approve estimate"
      if (message !== "This estimate has already been approved.") {
        toast.error(message || "Failed to approve estimate")
      }
    } finally {
      setApproving(false)
    }
  }

  return (
    <div className="max-w-sm mx-auto space-y-4">
      <div className="text-center">
        <h2 className="font-bold text-lg">Confirm your selection</h2>
        <p className="text-sm text-muted-foreground capitalize">
          {tier} plan · ${total.toFixed(0)} total
        </p>
      </div>

      <div className="bg-muted/40 rounded-xl p-3 text-sm space-y-1.5">
        {tierLines.map((line) => (
          <div key={line.id} className="flex justify-between">
            <span className="text-muted-foreground">{line.name}</span>
            <span>${(line.unitPrice * line.quantity).toFixed(0)}</span>
          </div>
        ))}
        <div className="flex justify-between font-bold pt-2 border-t mt-2">
          <span>Total</span>
          <span>${total.toFixed(0)}</span>
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">Full Name (legal signature)</label>
        <Input
          placeholder="Type your full name"
          value={signature}
          onChange={(e) => setSignature(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          By signing you authorize work to proceed at the quoted price
        </p>
      </div>

      {showDeposit && (
        <div className="border border-amber-200 dark:border-amber-800 rounded-xl p-3 bg-amber-50 dark:bg-amber-950/20 space-y-2">
          <div className="text-sm font-semibold">
            Optional: Pay ${estimatedDeposit} deposit today (25%)
          </div>
          <p className="text-xs text-muted-foreground">
            Locks in your appointment. Balance due at completion.
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              className="flex-1 bg-amber-500 hover:bg-amber-600 text-white"
            >
              Pay Deposit
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="flex-1"
              onClick={() => setDepositSkipped(true)}
            >
              Skip for now
            </Button>
          </div>
        </div>
      )}

      <Button className="w-full" onClick={handleApprove} disabled={approving}>
        {approving ? "Approving…" : "Approve & Begin Work"}
      </Button>
    </div>
  )
}
