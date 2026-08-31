import { createContext, useContext, useState, useEffect, useCallback } from "react"
import type { ReactNode } from "react"
import type { ApiOrganization } from "../api/types"

export type UserRole = "office" | "technician" | "customer"

export interface AuthUser {
  id: string
  email: string
  name: string | null
  role: UserRole
  organizationId: string
  organization?: ApiOrganization
}

interface AuthContextValue {
  user: AuthUser | null
  token: string | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  demoLogin: (role: "office" | "technician" | "customer") => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

const TOKEN_KEY = "flowsense_token"

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY))
  const [loading, setLoading] = useState(true)

  // Verify token on mount / token change
  useEffect(() => {
    if (!token) {
      setLoading(false)
      return
    }

    fetch("/api/auth/me", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (res.status === 401) {
          // Definitively invalid token — clear it so user re-authenticates
          localStorage.removeItem(TOKEN_KEY)
          setToken(null)
          setUser(null)
          return null
        }
        if (!res.ok) {
          // Server error or backend restarting — keep the token, just don't set user yet
          // The next navigation or reload will retry
          return null
        }
        return res.json()
      })
      .then((data: AuthUser | null) => {
        if (data) setUser({ ...data, organization: data.organization })
      })
      .catch(() => {
        // Network error (backend restarting, offline, etc.) — do NOT clear the token
        // Clearing here would log users out every time tsx watch restarts
        // Leave the token in place; the next successful request will restore the session
      })
      .finally(() => setLoading(false))
  }, [token])

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Login failed" }))
      throw new Error((err as { error?: string }).error ?? "Login failed")
    }

    const data = (await res.json()) as { token: string; user: AuthUser }
    localStorage.setItem(TOKEN_KEY, data.token)
    setToken(data.token)
    setUser(data.user)
  }, [])

  const demoLogin = useCallback(async (role: "office" | "technician" | "customer") => {
    const res = await fetch("/api/auth/demo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Demo login failed" }))
      throw new Error((err as { error?: string }).error ?? "Demo login failed")
    }

    const data = (await res.json()) as { token: string; user: AuthUser }
    localStorage.setItem(TOKEN_KEY, data.token)
    setToken(data.token)
    setUser(data.user)
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    setToken(null)
    setUser(null)
  }, [])

  // Listen for session-expired events fired by the API client on 401 responses
  useEffect(() => {
    const handleExpired = () => {
      setToken(null)
      setUser(null)
    }
    window.addEventListener("flowsense:session-expired", handleExpired)
    return () => window.removeEventListener("flowsense:session-expired", handleExpired)
  }, [])

  return (
    <AuthContext.Provider value={{ user, token, loading, login, demoLogin, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}
