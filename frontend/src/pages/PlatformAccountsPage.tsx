import { useCallback, useEffect, useMemo, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { Loader2 } from "lucide-react"
import { api } from "@/api/client"
import { useAuth } from "@/auth/auth-context"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import NotFoundPage from "@/pages/NotFoundPage"
import { DemoAccountCard } from "@/components/platform/demo-account-card"
import { SandboxAccountCard } from "@/components/platform/sandbox-account-card"
import { byRecentActivity, isActiveToday, timeAgo, weekSummary, type OrgActivity } from "@/components/platform/activity"

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
  activity: OrgActivity
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
  const [sort, setSort] = useState<"signup" | "active">("signup")
  const { logout } = useAuth()
  const navigate = useNavigate()

  const load = useCallback(() => {
    api
      .get<PlatformOrg[]>("/api/platform/organizations")
      .then(setOrgs)
      .catch(() => setDenied(true))
  }, [])

  useEffect(load, [load])

  const shown = useMemo(() => {
    if (!orgs) return orgs
    const q = query.trim().toLowerCase()
    const matching = q
      ? orgs.filter((o) => `${o.name} ${o.owner?.email ?? ""} ${o.owner?.name ?? ""}`.toLowerCase().includes(q))
      : orgs
    return sort === "active" ? byRecentActivity(matching) : matching
  }, [orgs, query, sort])

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
  const activeToday = orgs?.filter((o) => isActiveToday(o.activity.lastActiveAt)).length ?? 0

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Accounts</h1>
            <p className="text-sm text-muted-foreground">
              {total} total · {practicing} still in sandbox · {activeToday} active in the last day · account-level details only, no customer records
            </p>
          </div>
          <div className="flex items-center gap-3">
            <select
              aria-label="Sort accounts"
              className="h-9 rounded-md border bg-background px-3 text-sm"
              value={sort}
              onChange={(e) => setSort(e.target.value as "signup" | "active")}
            >
              <option value="signup">Newest signup</option>
              <option value="active">Most recently active</option>
            </select>
            <Input className="w-64" placeholder="Search company or email" value={query} onChange={(e) => setQuery(e.target.value)} />
            <Link to="/office" className="text-sm text-muted-foreground hover:underline">Back to app</Link>
            <button
              type="button"
              className="text-sm text-muted-foreground hover:underline"
              onClick={() => { logout(); navigate("/founder", { replace: true }) }}
            >
              Sign out
            </button>
          </div>
        </div>

        <DemoAccountCard />
        <SandboxAccountCard onCreated={load} />

        <div className="mt-6 overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Company</th>
                <th className="px-3 py-2">Owner</th>
                <th className="px-3 py-2">Signed up</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Mode</th>
                <th className="px-3 py-2">Last active</th>
                <th className="px-3 py-2">Last 7 days</th>
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
                  <td
                    className={`px-3 py-2 whitespace-nowrap ${isActiveToday(o.activity.lastActiveAt) ? "font-medium" : "text-muted-foreground"}`}
                    title={o.activity.lastActiveAt ? `Last sign-in ${timeAgo(o.activity.lastLoginAt)}` : "Not seen since activity tracking began"}
                  >
                    {timeAgo(o.activity.lastActiveAt)}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {weekSummary(o.activity) ?? <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{o.counts.users}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{o.counts.technicians}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{o.counts.customers}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{o.counts.jobs}</td>
                </tr>
              ))}
              {shown.length === 0 && (
                <tr><td colSpan={11} className="px-3 py-6 text-center text-muted-foreground">No accounts match.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Customers, techs and jobs exclude sandbox sample data. “Last active” is the last time anyone on the shop's team made a request, so an open browser tab counts. “Last 7 days” is real customers and jobs added, never sample data. A “—” in Last active means not seen since tracking began. Accounts created before sandbox mode show “—” for mode.
        </p>
      </div>
    </div>
  )
}
