import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { Loader2 } from "lucide-react"
import { api } from "@/api/client"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import NotFoundPage from "@/pages/NotFoundPage"

interface PlatformOrg {
  id: string
  name: string
  createdAt: string
  plan: string
  trialEndsAt: string | null
  sandboxMode: boolean
  sandboxEndedAt: string | null
  stripeCustomerId: string | null
  owner: { email: string; name: string | null } | null
  counts: { users: number; customers: number; technicians: number; jobs: number }
}

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })

function statusOf(org: PlatformOrg): string {
  if (org.plan === "trial") {
    if (!org.trialEndsAt) return "Trial"
    const days = Math.ceil((new Date(org.trialEndsAt).getTime() - Date.now()) / 86_400_000)
    return days > 0 ? `Trial · ${days}d left` : "Trial ended"
  }
  return org.plan.replace("_", " ")
}

// Founder-only. The API answers 404 to everyone else, so this page does too.
export default function PlatformAccountsPage() {
  const [orgs, setOrgs] = useState<PlatformOrg[] | null>(null)
  const [denied, setDenied] = useState(false)
  const [query, setQuery] = useState("")

  useEffect(() => {
    api
      .get<PlatformOrg[]>("/api/platform/organizations")
      .then(setOrgs)
      .catch(() => setDenied(true))
  }, [])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!orgs || !q) return orgs
    return orgs.filter((o) => `${o.name} ${o.owner?.email ?? ""} ${o.owner?.name ?? ""}`.toLowerCase().includes(q))
  }, [orgs, query])

  if (denied) return <NotFoundPage />
  if (!shown) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const total = orgs?.length ?? 0
  const practicing = orgs?.filter((o) => o.sandboxMode).length ?? 0

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Accounts</h1>
            <p className="text-sm text-muted-foreground">
              {total} total · {practicing} still in sandbox · account-level details only, no customer records
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Input className="w-64" placeholder="Search company or email" value={query} onChange={(e) => setQuery(e.target.value)} />
            <Link to="/office" className="text-sm text-muted-foreground hover:underline">Back to app</Link>
          </div>
        </div>

        <div className="mt-6 overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Company</th>
                <th className="px-3 py-2">Owner</th>
                <th className="px-3 py-2">Signed up</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Mode</th>
                <th className="px-3 py-2 text-right">Users</th>
                <th className="px-3 py-2 text-right">Techs</th>
                <th className="px-3 py-2 text-right">Customers</th>
                <th className="px-3 py-2 text-right">Jobs</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((o) => (
                <tr key={o.id} className="border-t">
                  <td className="px-3 py-2 font-medium">{o.name}</td>
                  <td className="px-3 py-2">
                    {o.owner ? (
                      <>
                        <div>{o.owner.name ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">{o.owner.email}</div>
                      </>
                    ) : "—"}
                  </td>
                  <td className="px-3 py-2">{fmtDate(o.createdAt)}</td>
                  <td className="px-3 py-2 capitalize">{statusOf(o)}</td>
                  <td className="px-3 py-2">
                    {o.sandboxMode ? <Badge variant="secondary">Sandbox</Badge>
                      : o.sandboxEndedAt ? <Badge>Live</Badge>
                      : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{o.counts.users}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{o.counts.technicians}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{o.counts.customers}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{o.counts.jobs}</td>
                </tr>
              ))}
              {shown.length === 0 && (
                <tr><td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">No accounts match.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Customers, techs and jobs exclude sandbox sample data. Accounts created before sandbox mode show “—” for mode.
        </p>
      </div>
    </div>
  )
}
