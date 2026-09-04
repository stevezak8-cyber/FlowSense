"use client"

import { useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PneurosLogo } from "@/components/brand"
import { ThemeToggle } from "@/components/theme-toggle"
import { Loader2, AlertCircle, CheckCircle2, Lock } from "lucide-react"
import { AuroraBackdrop } from "@/components/aurora-backdrop"

export default function ResetPasswordPage() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()

  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) {
      setError("Passwords don't match")
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/auth/reset-password/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? "Reset failed")
      setDone(true)
      setTimeout(() => navigate("/login", { replace: true }), 2500)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <AuroraBackdrop tone="cool" />
      <header className="flex items-center justify-between bg-background px-6 py-5 lg:px-10">
        <PneurosLogo size="md" />
        <ThemeToggle />
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Set a new password</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Choose something strong that you haven't used before.
            </p>
          </div>

          <div className="medops-card p-7">
            {done ? (
              <div className="flex flex-col items-center gap-3 py-4 text-center">
                <CheckCircle2 className="h-10 w-10 text-success" />
                <p className="text-sm font-medium text-card-foreground">Password updated!</p>
                <p className="text-sm text-muted-foreground">Redirecting you to sign in…</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                    New password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="password"
                      placeholder="At least 8 characters"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="h-11 bg-background pl-10 text-sm rounded-xl border-transparent shadow-sm placeholder:text-muted-foreground"
                      required
                      autoFocus
                      autoComplete="new-password"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                    Confirm password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="password"
                      placeholder="Repeat password"
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      className="h-11 bg-background pl-10 text-sm rounded-xl border-transparent shadow-sm placeholder:text-muted-foreground"
                      required
                      autoComplete="new-password"
                    />
                  </div>
                </div>

                {error && (
                  <div className="flex items-center gap-2 rounded-xl bg-destructive/8 px-4 py-3 text-xs text-destructive font-medium">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    {error}
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={submitting || !password || !confirm}
                  className="w-full h-11 gap-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 font-semibold mt-1"
                >
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  Update password
                </Button>
              </form>
            )}
          </div>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            <Link to="/login" className="font-medium text-primary hover:underline">
              Back to sign in
            </Link>
          </p>
        </div>
      </main>
    </div>
  )
}
