import { Link, Outlet, useLocation, useNavigate } from "react-router-dom"
import { useState, useEffect } from "react"
import { LayoutDashboard, MapPin, MessageSquare, User, LogOut, Download } from "lucide-react"
import { cn } from "@/lib/utils"
import { FlowSenseLogo } from "@/components/brand"
import { ThemeToggle } from "@/components/theme-toggle"
import { useAuth } from "@/auth/auth-context"
import { api } from "@/api/client"
import { usePushNotifications } from "@/hooks/usePushNotifications"

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

const navItems = [
  { label: "Jobs", href: "/technician", icon: LayoutDashboard },
  { label: "Map", href: "/technician/map", icon: MapPin },
  { label: "Messages", href: "/technician/messages", icon: MessageSquare },
  { label: "Profile", href: "/technician/profile", icon: User },
]

export default function TechnicianLayout() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const [isOnDuty, setIsOnDuty] = useState(true)
  const [techId, setTechId] = useState<string | null>(null)
  const [toggling, setToggling] = useState(false)
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [installDismissed, setInstallDismissed] = useState(() =>
    localStorage.getItem("pwa-install-dismissed") === "true"
  )
  const { permission, supported, subscribe, isSubscribed } = usePushNotifications()
  const [notifDismissed, setNotifDismissed] = useState(() =>
    localStorage.getItem("push-prompt-dismissed") === "true"
  )

  const showNotifPrompt =
    supported &&
    permission === "default" &&
    !isSubscribed &&
    !notifDismissed

  function handleDismissNotif() {
    localStorage.setItem("push-prompt-dismissed", "true")
    setNotifDismissed(true)
  }

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault()
      setInstallPrompt(e as BeforeInstallPromptEvent)
    }
    window.addEventListener("beforeinstallprompt", handler)
    return () => window.removeEventListener("beforeinstallprompt", handler)
  }, [])

  async function handleInstall() {
    if (!installPrompt) return
    await installPrompt.prompt()
    const { outcome } = await installPrompt.userChoice
    if (outcome === "dismissed") {
      localStorage.setItem("pwa-install-dismissed", "true")
      setInstallDismissed(true)
    }
    setInstallPrompt(null)
  }

  function handleDismissInstall() {
    localStorage.setItem("pwa-install-dismissed", "true")
    setInstallDismissed(true)
  }

  // Load current duty status from profile
  useEffect(() => {
    api.get<{ role: string; profile: { id: string; isOnDuty?: boolean } | null }>("/api/auth/me/profile")
      .then((data) => {
        if (data.profile) {
          setTechId(data.profile.id)
          setIsOnDuty(data.profile.isOnDuty ?? true)
        }
      })
      .catch(() => {/* keep default */})
  }, [])

  async function handleToggleDuty() {
    if (!techId || toggling) return
    setToggling(true)
    const next = !isOnDuty
    try {
      await api.patch(`/api/technicians/${techId}`, { isOnDuty: next })
      setIsOnDuty(next)
    } catch {
      /* revert optimistic update on error */
    } finally {
      setToggling(false)
    }
  }

  function handleLogout() {
    logout()
    navigate("/login")
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-30 flex h-[60px] items-center justify-between bg-card px-4 shadow-[0_1px_4px_rgba(0,0,0,0.04)] dark:border-b dark:border-border dark:shadow-none">
        <FlowSenseLogo size="sm" />
        <div className="flex items-center gap-3">
          {user && (
            <span className="text-xs font-medium text-muted-foreground hidden sm:block">
              {user.name}
            </span>
          )}
          {/* On Duty toggle — tap to go off duty */}
          <button
            type="button"
            onClick={handleToggleDuty}
            disabled={toggling}
            title={isOnDuty ? "Tap to go off duty" : "Tap to go on duty"}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-2.5 py-1 transition-colors",
              isOnDuty
                ? "bg-success/15 hover:bg-success/25"
                : "bg-muted hover:bg-muted/80"
            )}
          >
            <div className={cn(
              "h-2 w-2 rounded-full",
              isOnDuty ? "bg-success animate-pulse" : "bg-muted-foreground"
            )} />
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {isOnDuty ? "On Duty" : "Off Duty"}
            </span>
          </button>
          <ThemeToggle />
          <button
            type="button"
            onClick={handleLogout}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>

      {installPrompt && !installDismissed && (
        <div className="flex items-center justify-between gap-3 bg-primary/10 border-b border-primary/20 px-4 py-2.5">
          <div className="flex items-center gap-2 text-sm">
            <Download className="h-4 w-4 text-primary flex-shrink-0" />
            <span className="text-foreground font-medium">Add FlowSense to your home screen</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleInstall}
              className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground"
            >
              Install
            </button>
            <button
              type="button"
              onClick={handleDismissInstall}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {showNotifPrompt && (
        <div className="flex items-center justify-between gap-3 bg-primary/10 border-b border-primary/20 px-4 py-2.5">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-foreground font-medium">Get notified about new jobs instantly.</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={subscribe}
              className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground"
            >
              Enable
            </button>
            <button
              type="button"
              onClick={handleDismissNotif}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Not now
            </button>
          </div>
        </div>
      )}

      <main className="flex-1 px-4 py-4 pb-20">
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-around bg-card py-2.5 shadow-[0_-1px_4px_rgba(0,0,0,0.04)] dark:border-t dark:border-border dark:shadow-none">
        {navItems.map((item) => {
          const isActive =
            item.href === "/technician"
              ? pathname === "/technician"
              : pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              to={item.href}
              className={cn(
                "flex flex-col items-center gap-1 px-3 py-1.5 transition-colors",
                isActive ? "text-primary" : "text-muted-foreground"
              )}
            >
              <item.icon className="h-5 w-5" />
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
