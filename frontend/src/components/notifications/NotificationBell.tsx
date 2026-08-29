import { useState, useEffect, useRef, useCallback } from "react"
import { Bell, CheckCheck, Briefcase, CreditCard, AlertTriangle, Star, Shield, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { api } from "@/api/client"
import { Link } from "react-router-dom"

interface Notification {
  id: string
  type: string
  title: string
  body: string
  link: string | null
  read: boolean
  createdAt: string
}

const typeIcon: Record<string, { icon: typeof Bell; className: string }> = {
  "job.created":       { icon: Briefcase,     className: "bg-violet-100 text-violet-600 dark:bg-violet-500/20 dark:text-violet-400" },
  "job.completed":     { icon: CheckCheck,    className: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400" },
  "job.status_changed":{ icon: Briefcase,     className: "bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400" },
  "payment.received":  { icon: CreditCard,    className: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400" },
  "payment.failed":    { icon: AlertTriangle, className: "bg-rose-100 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400" },
  "review.new":        { icon: Star,          className: "bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400" },
  "plan.created":      { icon: Shield,        className: "bg-violet-100 text-violet-600 dark:bg-violet-500/20 dark:text-violet-400" },
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const ref = useRef<HTMLDivElement>(null)

  const fetchNotifications = useCallback(() => {
    api.get<{ notifications: Notification[]; unreadCount: number }>("/api/notifications")
      .then(({ notifications, unreadCount }) => {
        setNotifications(notifications)
        setUnreadCount(unreadCount)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    fetchNotifications()
    const interval = setInterval(fetchNotifications, 30000)
    return () => clearInterval(interval)
  }, [fetchNotifications])

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  function handleOpen() {
    setOpen((v) => !v)
  }

  async function markAllRead() {
    await api.patch("/api/notifications/read-all", {})
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
    setUnreadCount(0)
  }

  async function markOneRead(id: string) {
    await api.patch(`/api/notifications/${id}/read`, {})
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n))
    setUnreadCount((c) => Math.max(0, c - 1))
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={handleOpen}
        className="relative flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground hover:text-foreground hover:bg-card transition-colors"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[9px] font-bold text-white border-2 border-background">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-50 w-80 rounded-2xl border border-border bg-card shadow-xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-foreground" />
              <span className="text-sm font-semibold text-foreground">Notifications</span>
              {unreadCount > 0 && (
                <span className="rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold text-white">{unreadCount}</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button onClick={markAllRead} className="text-[11px] text-primary hover:underline font-medium">
                  Mark all read
                </button>
              )}
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="max-h-[420px] overflow-y-auto divide-y divide-border/60">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
                <Bell className="h-8 w-8 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">No notifications yet</p>
              </div>
            ) : (
              notifications.map((n) => {
                const cfg = typeIcon[n.type] ?? { icon: Bell, className: "bg-muted text-muted-foreground" }
                const Icon = cfg.icon
                const content = (
                  <div
                    className={cn(
                      "flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/50 cursor-pointer",
                      !n.read && "bg-primary/5"
                    )}
                    onClick={() => { if (!n.read) markOneRead(n.id) }}
                  >
                    <div className={cn("mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl", cfg.className)}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className={cn("text-xs font-semibold text-foreground leading-snug", !n.read && "font-bold")}>{n.title}</p>
                        {!n.read && <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary flex-shrink-0" />}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed line-clamp-2">{n.body}</p>
                      <p className="text-[10px] text-muted-foreground/60 mt-1">{timeAgo(n.createdAt)}</p>
                    </div>
                  </div>
                )

                return n.link ? (
                  <Link key={n.id} to={n.link} onClick={() => { setOpen(false); if (!n.read) markOneRead(n.id) }}>
                    {content}
                  </Link>
                ) : (
                  <div key={n.id}>{content}</div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
