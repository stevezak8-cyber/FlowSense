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
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border/60 bg-card/80 px-4 backdrop-blur-xl supports-[backdrop-filter]:bg-card/60">
        <FlowSenseLogo size="sm" />
        <div className="flex items-center gap-2">
          {user && (
            <span className="mr-1 hidden text-sm font-medium text-foreground sm:block">
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
              "flex items-center gap-2 rounded-full border px-3 py-1.5 transition-all active:scale-95",
              isOnDuty
                ? "border-success/30 bg-success/10 hover:bg-success/20"
                : "border-border bg-muted hover:bg-muted/70"
            )}
          >
            <span className="relative flex h-2 w-2">
              {isOnDuty && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
              )}
              <span className={cn(
                "relative inline-flex h-2 w-2 rounded-full",
                isOnDuty ? "bg-success" : "bg-muted-foreground"
              )} />
            </span>
            <span className={cn(
              "text-[11px] font-semibold uppercase tracking-wide",
              isOnDuty ? "text-success" : "text-muted-foreground"
            )}>
              {isOnDuty ? "On Duty" : "Off Duty"}
            </span>
          </button>
          <ThemeToggle />
          <button
            type="button"
            onClick={handleLogout}
            title="Sign out"
            className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          >
            <LogOut className="h-4 w-4" />
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

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border/60 bg-card/80 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl supports-[backdrop-filter]:bg-card/60">
        <div className="mx-auto flex max-w-lg items-center justify-around px-2 py-2">
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
                  "flex flex-1 flex-col items-center gap-1 rounded-xl py-2 transition-all active:scale-95",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <item.icon className={cn("h-5 w-5 transition-transform", isActive && "scale-110")} />
                <span className="text-[10px] font-semibold tracking-wide">{item.label}</span>
              </Link>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
