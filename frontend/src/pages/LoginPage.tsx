import React, { useState } from "react"
import { Link, Navigate } from "react-router-dom"
import { useAuth } from "@/auth/auth-context"
import type { UserRole } from "@/auth/auth-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PneurosLogo } from "@/components/brand"
import { ThemeToggle } from "@/components/theme-toggle"
import { Loader2, Building2, Wrench, UserCircle, AlertCircle } from "lucide-react"

const roleHome: Record<UserRole, string> = {
  office: "/office",
  technician: "/technician",
  customer: "/customer",
}

const demoAccounts: { label: string; role: "office" | "technician" | "customer"; icon: React.ElementType; color: string }[] = [
  { label: "Office Manager", role: "office", icon: Building2, color: "bg-primary/10 text-primary" },
  { label: "Technician", role: "technician", icon: Wrench, color: "bg-success/10 text-success" },
  { label: "Customer", role: "customer", icon: UserCircle, color: "bg-chart-5/10 text-chart-5" },
]

export default function LoginPage() {
  const { user, loading, login, demoLogin } = useAuth()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Already logged in → redirect to dashboard
  if (!loading && user) {
    return <Navigate to={roleHome[user.role]} replace />
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email || !password) return
    setSubmitting(true)
    setError(null)
    try {
      await login(email, password)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed")
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDemoLogin(role: "office" | "technician" | "customer") {
    setSubmitting(true)
    setError(null)
    try {
      await demoLogin(role)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Demo login failed")
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex items-center justify-between bg-background px-6 py-5 lg:px-10">
        <PneurosLogo size="md" />
        <ThemeToggle />
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Sign in to Pneuros
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Enter your credentials to access your dashboard
            </p>
          </div>

          <div className="medops-card p-7">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                  Email
                </label>
                <Input
                  type="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-11 bg-background pl-4 text-sm rounded-xl border-transparent shadow-sm placeholder:text-muted-foreground focus:border-primary/20"
                  required
                  autoComplete="email"
                  autoFocus
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                    Password
                  </label>
                  <Link to="/forgot-password" className="text-[11px] font-medium text-primary hover:underline">
                    Forgot password?
                  </Link>
                </div>
                <Input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-11 bg-background pl-4 text-sm rounded-xl border-transparent shadow-sm placeholder:text-muted-foreground focus:border-primary/20"
                  required
                  autoComplete="current-password"
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 rounded-xl bg-destructive/8 px-4 py-3 text-xs text-destructive font-medium">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  {error}
                </div>
              )}

              <Button
                type="submit"
                disabled={submitting || !email || !password}
                className="w-full h-11 gap-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 font-semibold"
              >
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Sign In
              </Button>
            </form>
          </div>

          <p className="mt-5 text-center text-sm text-muted-foreground">
            New to Pneuros?{" "}
            <Link to="/register" className="font-medium text-primary hover:underline">
              Create an account
            </Link>
          </p>

          {/* Demo quick-login buttons */}
          <div className="mt-8">
            <div className="relative mb-5">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center">
                <span className="bg-background px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Demo Accounts
                </span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {demoAccounts.map((acct) => (
                <button
                  key={acct.role}
                  type="button"
                  disabled={submitting}
                  onClick={() => handleDemoLogin(acct.role)}
                  className="group medops-card flex flex-col items-center gap-2.5 p-4 transition-all hover:shadow-md disabled:opacity-50"
                >
                  <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${acct.color}`}>
                    <acct.icon className="h-5 w-5" />
                  </div>
                  <span className="text-[11px] font-semibold text-card-foreground">
                    {acct.label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
