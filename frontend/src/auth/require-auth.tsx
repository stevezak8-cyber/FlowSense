import { Navigate } from "react-router-dom"
import { useAuth } from "./auth-context"
import type { UserRole } from "./auth-context"
import { Loader2 } from "lucide-react"

interface RequireAuthProps {
  role: UserRole
  children: React.ReactNode
  /** Where a signed-out visitor is sent. Defaults to the normal login page. */
  loginPath?: string
}

export function RequireAuth({ role, children, loginPath = "/login" }: RequireAuthProps) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // Not logged in → go to login
  if (!user) {
    return <Navigate to={loginPath} replace />
  }

  // Wrong role → redirect to their correct dashboard
  if (user.role !== role) {
    const roleHome: Record<UserRole, string> = {
      office: "/office",
      technician: "/technician",
      customer: "/customer",
    }
    return <Navigate to={roleHome[user.role]} replace />
  }

  return <>{children}</>
}
