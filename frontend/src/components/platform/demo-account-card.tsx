import { useState } from "react"
import { Loader2 } from "lucide-react"
import { api } from "@/api/client"
import { Button } from "@/components/ui/button"

interface DemoLogin { role: "office" | "technician" | "customer"; name: string; email: string; password: string }
interface DemoResetResult { organizationId: string; logins: DemoLogin[]; counts: Record<string, number> }

const ROLE_LABEL: Record<DemoLogin["role"], string> = { office: "Office", technician: "Technician", customer: "Customer" }

// Founder-only. Rebuilds the demo shop with a month of data dated around now, so a
// recording or a live walkthrough never starts from stale or empty pages.
export function DemoAccountCard() {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<DemoResetResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  async function reset() {
    setBusy(true)
    setError(null)
    try {
      setResult(await api.post<DemoResetResult>("/api/platform/demo/reset", {}))
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reset failed")
    } finally {
      setBusy(false)
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(text)
      setTimeout(() => setCopied((c) => (c === text ? null : c)), 1500)
    } catch {
      /* clipboard unavailable; the text is selectable */
    }
  }

  return (
    <div className="mt-6 rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-xl">
          <h2 className="text-sm font-semibold">Demo account</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Rebuilds Hill Country Comfort, a six-truck Austin shop, with a month of jobs, invoices, messages and compliance
            entries, plus six months of revenue behind it. Today's jobs follow the clock, so reset it right before you record.
            Logins and passwords change every time.
          </p>
        </div>
        <Button onClick={reset} disabled={busy}>
          {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Rebuilding</> : "Reset demo account"}
        </Button>
      </div>

      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

      {result && (
        <div className="mt-4">
          <p className="text-xs text-muted-foreground">
            Shown once. Sign in at /login in a private window so you stay signed in as yourself here.
          </p>
          <div className="mt-2 overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <tbody>
                {result.logins.map((l) => (
                  <tr key={l.role} className="border-t first:border-t-0">
                    <td className="px-3 py-2 font-medium">{ROLE_LABEL[l.role]}</td>
                    <td className="px-3 py-2 text-muted-foreground">{l.name}</td>
                    <td className="px-3 py-2 font-mono text-xs">{l.email}</td>
                    <td className="px-3 py-2 font-mono text-xs">{l.password}</td>
                    <td className="px-3 py-2 text-right">
                      <Button size="sm" variant="outline" onClick={() => copy(`${l.email}\t${l.password}`)}>
                        {copied === `${l.email}\t${l.password}` ? "Copied" : "Copy"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {result.counts.customers} customers · {result.counts.jobs} jobs · {result.counts.invoices} invoices ·{" "}
            {result.counts.complianceLogs} compliance entries · {result.counts.estimates} estimates
          </p>
        </div>
      )}
    </div>
  )
}
