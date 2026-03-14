import { createContext, useContext, useState, useEffect, useCallback } from "react"
import type { ReactNode } from "react"

export type UserRole = "office" | "technician" | "customer"

export interface AuthUser {
  id: string
  email: string
  name: string | null
  role: UserRole
  organizationId: string
}

interface AuthContextValue {
  user: AuthUser | null
  token: string | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
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
        if (!res.ok) throw new Error("Invalid token")
        return res.json()
      })
      .then((data: AuthUser) => {
        setUser(data)
      })
      .catch(() => {
        // Token expired or invalid — clear it
        localStorage.removeItem(TOKEN_KEY)
        setToken(null)
        setUser(null)
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

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    setToken(null)
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}
