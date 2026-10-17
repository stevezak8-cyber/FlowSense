import { useState } from "react"
import { Loader2 } from "lucide-react"
import { api } from "@/api/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { LoginList } from "@/components/platform/login-list"

type Plan = "starter" | "shop" | "fleet" | "enterprise"
interface SandboxAccount { organizationId: string; name: string; plan: Plan; email: string; password: string }

const PLANS: { value: Plan; label: string }[] = [
  { value: "starter", label: "Starter" },
  { value: "shop", label: "Shop" },
  { value: "fleet", label: "Fleet" },
  { value: "enterprise", label: "Enterprise" },
]

// Founder-only. Makes a fresh sandbox account for a prospect: sample data, no card, never billed.
export function SandboxAccountCard({ onCreated }: { onCreated: () => void }) {
  const [companyName, setCompanyName] = useState("")
  const [plan, setPlan] = useState<Plan>("fleet")
  const [busy, setBusy] = useState(false)
  const [account, setAccount] = useState<SandboxAccount | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function create() {
    setBusy(true)
    setError(null)
    try {
      setAccount(await api.post<SandboxAccount>("/api/platform/sandbox-accounts", { companyName: companyName.trim() || undefined, plan }))
      setCompanyName("")
      onCreated()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the account")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-6 rounded-lg border p-4">
      <h2 className="text-sm font-semibold">Sandbox account for a prospect</h2>
      <p className="mt-1 max-w-xl text-sm text-muted-foreground">
        Creates a fresh account with sample customers, technicians and jobs. No card is taken and it is never billed. Nothing in it can
        text or email anyone. It never expires, so give each prospect their own.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Input
          className="w-64"
          placeholder="Prospect's company (optional)"
          maxLength={60}
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
        />
        <select
          aria-label="Plan"
          className="h-9 rounded-md border bg-background px-3 text-sm"
          value={plan}
          onChange={(e) => setPlan(e.target.value as Plan)}
        >
          {PLANS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
        <Button onClick={create} disabled={busy}>
          {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating</> : "Create sandbox account"}
        </Button>
      </div>

      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

      {account && (
        <div className="mt-4">
          <p className="text-xs text-muted-foreground">
            {account.name} · {PLANS.find((p) => p.value === account.plan)?.label} plan. Shown once. Sign in at /login in a private window.
          </p>
          <LoginList logins={[{ label: "Office", name: account.name, email: account.email, password: account.password }]} />
        </div>
      )}
    </div>
  )
}
