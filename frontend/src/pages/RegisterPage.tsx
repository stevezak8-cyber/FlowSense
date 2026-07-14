import { useState } from "react"
import { Link, Navigate, useNavigate } from "react-router-dom"
import { useAuth } from "@/auth/auth-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { FlowSenseLogo } from "@/components/brand"
import { ThemeToggle } from "@/components/theme-toggle"
import { Loader2, AlertCircle, Building2, User, Mail, Lock } from "lucide-react"

export default function RegisterPage() {
  const { user, loading } = useAuth()
  const navigate = useNavigate()

  const [companyName, setCompanyName] = useState("")
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Already logged in → go to office
  if (!loading && user) {
    return <Navigate to="/office" replace />
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) {
      setError("Passwords don't match")
      return
    }
    setSubmitting(true)
    setError(null)

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyName, name, email, password }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error ?? "Registration failed")
      }

      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl
      } else if (data.token) {
        localStorage.setItem("flowsense_token", data.token)
        navigate("/office", { replace: true })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed")
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
        <FlowSenseLogo size="md" />
        <ThemeToggle />
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Create your FlowSense account
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Get your HVAC business up and running in minutes
            </p>
          </div>

          <div className="medops-card p-7">
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Company name */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                  Company Name
                </label>
                <div className="relative">
                  <Building2 className="absolute left-3.5 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder="Acme HVAC Services"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    className="h-11 bg-background pl-10 text-sm rounded-xl border-transparent shadow-sm placeholder:text-muted-foreground"
                    required
                    autoFocus
                  />
                </div>
              </div>

              {/* Your name */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                  Your Name
                </label>
                <div className="relative">
                  <User className="absolute left-3.5 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder="Jane Smith"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="h-11 bg-background pl-10 text-sm rounded-xl border-transparent shadow-sm placeholder:text-muted-foreground"
                    required
                  />
                </div>
              </div>

              {/* Email */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                  Work Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="email"
                    placeholder="jane@acmehvac.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-11 bg-background pl-10 text-sm rounded-xl border-transparent shadow-sm placeholder:text-muted-foreground"
                    required
                    autoComplete="email"
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                  Password
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
                    autoComplete="new-password"
                  />
                </div>
              </div>

              {/* Confirm password */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                  Confirm Password
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
                disabled={submitting}
                className="w-full h-11 gap-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 font-semibold mt-2"
              >
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Create Account
              </Button>
            </form>
          </div>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link to="/login" className="font-medium text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </main>
    </div>
  )
}
