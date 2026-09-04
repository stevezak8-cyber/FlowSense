import { useState, useEffect } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { useAuth } from "@/auth/auth-context"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, AlertCircle, CheckCircle2, Zap } from "lucide-react"
import { AuroraBackdrop } from "@/components/aurora-backdrop"

interface InviteInfo {
  email: string
  role: "office" | "technician" | "customer"
  orgName: string
}

const ROLE_LABEL: Record<string, string> = {
  office: "Office Staff",
  technician: "Field Technician",
  customer: "Customer",
}

const ROLE_REDIRECT: Record<string, string> = {
  office: "/office",
  technician: "/technician",
  customer: "/customer",
}

export default function InvitePage() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  useAuth()

  const [info, setInfo] = useState<InviteInfo | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [name, setName] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!token) return
    fetch(`/api/auth/invite/${token}`)
      .then(async (res) => {
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Invalid invite" }))
          throw new Error(err.error ?? "Invalid invite")
        }
        return res.json() as Promise<InviteInfo>
      })
      .then(setInfo)
      .catch((e: Error) => setLoadError(e.message))
      .finally(() => setLoading(false))
  }, [token])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) {
      setSubmitError("Passwords don't match")
      return
    }
    if (password.length < 8) {
      setSubmitError("Password must be at least 8 characters")
      return
    }
    setSubmitting(true)
    setSubmitError(null)

    try {
      const res = await fetch(`/api/auth/invite/${token}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, password }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed to activate account" }))
        throw new Error(err.error ?? "Failed to activate account")
      }

      const data = await res.json() as { token: string; user: { email: string; role: string } }

      // Store the token and log the user in
      localStorage.setItem("flowsense_token", data.token)
      setDone(true)

      // Short pause so they see the success state, then navigate
      setTimeout(() => {
        navigate(ROLE_REDIRECT[data.user.role] ?? "/", { replace: true })
        // Force the auth context to re-read the token
        window.location.reload()
      }, 1500)
    } catch (e: unknown) {
      setSubmitError((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  // ── Loading ──
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <AuroraBackdrop tone="cool" />
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // ── Error ──
  if (loadError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <AuroraBackdrop tone="cool" />
        <Card className="w-full max-w-sm border-border bg-card">
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <p className="text-sm font-medium text-card-foreground">Invite not valid</p>
            <p className="text-xs text-muted-foreground">{loadError}</p>
            <Button size="sm" variant="outline" onClick={() => navigate("/login")}>Go to login</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ── Success ──
  if (done) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <AuroraBackdrop tone="cool" />
        <Card className="w-full max-w-sm border-border bg-card">
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <CheckCircle2 className="h-8 w-8 text-success" />
            <p className="text-sm font-medium text-card-foreground">Account activated!</p>
            <p className="text-xs text-muted-foreground">Logging you in…</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <AuroraBackdrop tone="cool" />
      <div className="w-full max-w-sm">
        {/* Logo / brand */}
        <div className="mb-8 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <Zap className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="text-sm font-semibold text-foreground">Pneuros</span>
        </div>

        <Card className="border-border bg-card">
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-semibold text-card-foreground">
              You've been invited
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{info?.orgName}</span> has invited you as{" "}
              <span className="font-medium text-foreground">{ROLE_LABEL[info?.role ?? "office"]}</span>.
              Set a password to get started.
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="inv-email" className="text-sm text-foreground">Email</Label>
                <Input
                  id="inv-email"
                  value={info?.email ?? ""}
                  disabled
                  className="h-9 opacity-60 cursor-not-allowed"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="inv-name" className="text-sm text-foreground">Your name</Label>
                <Input
                  id="inv-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Full name"
                  className="h-9"
                  required
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="inv-pass" className="text-sm text-foreground">Password</Label>
                <Input
                  id="inv-pass"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  className="h-9"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="inv-confirm" className="text-sm text-foreground">Confirm password</Label>
                <Input
                  id="inv-confirm"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Repeat password"
                  className="h-9"
                  required
                />
              </div>
              {submitError && (
                <p className="flex items-center gap-1.5 text-xs text-destructive">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  {submitError}
                </p>
              )}
              <Button
                type="submit"
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                disabled={submitting}
              >
                {submitting && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                Activate account
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
