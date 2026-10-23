import React, { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Loader2, AlertCircle } from "lucide-react"
import { api } from "@/api/client"
import { useAuth } from "@/auth/auth-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PneurosLogo } from "@/components/brand"
import { AuroraBackdrop } from "@/components/aurora-backdrop"

// The owner's way in to /platform. Not linked from anywhere and kept out of search
// results. It signs in with the normal account, then asks the server whether that
// account is a platform admin; if not, it signs straight back out and says only
// "Invalid email or password", so the page can't be used to find out who is.
export default function FounderLoginPage() {
  const { user, loading, login, logout } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const robots = document.createElement("meta")
    robots.name = "robots"
    robots.content = "noindex, nofollow"
    document.head.appendChild(robots)
    return () => { robots.remove() }
  }, [])

  // Already signed in as the founder (a returning visit): go straight through.
  useEffect(() => {
    if (loading || !user) return
    let cancelled = false
    api.get("/api/platform/me")
      .then(() => { if (!cancelled) navigate("/platform", { replace: true }) })
      .catch(() => { /* a signed-in shop user, not the founder: show the form */ })
    return () => { cancelled = true }
  }, [loading, user, navigate])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email || !password) return
    setSubmitting(true)
    setError(null)
    try {
      await login(email, password)
    } catch {
      setError("Invalid email or password")
      setSubmitting(false)
      return
    }
    try {
      await api.get("/api/platform/me")
      navigate("/platform", { replace: true })
    } catch {
      logout()
      setError("Invalid email or password")
      setPassword("")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <AuroraBackdrop tone="cool" />
      <header className="px-6 py-5 lg:px-10">
        <PneurosLogo size="md" />
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <h1 className="mb-6 text-center text-2xl font-bold tracking-tight text-foreground">Founder sign in</h1>

          <div className="medops-card p-7">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-1.5">
                <label htmlFor="founder-email" className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Email</label>
                <Input
                  id="founder-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-11 rounded-xl bg-background text-sm"
                  required
                  autoComplete="email"
                  autoFocus
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="founder-password" className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Password</label>
                <Input
                  id="founder-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-11 rounded-xl bg-background text-sm"
                  required
                  autoComplete="current-password"
                />
              </div>

              {error && (
                <div role="alert" className="flex items-center gap-2 rounded-xl bg-destructive/8 px-4 py-3 text-xs font-medium text-destructive">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  {error}
                </div>
              )}

              <Button type="submit" disabled={submitting || !email || !password} className="h-11 w-full gap-2 rounded-xl font-semibold">
                {submitting ? <><Loader2 className="h-4 w-4 animate-spin" />Signing in</> : "Sign in"}
              </Button>
            </form>
          </div>
        </div>
      </main>
    </div>
  )
}
