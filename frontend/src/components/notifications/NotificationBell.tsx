import { useState, useEffect, useRef } from "react"
import { Bell, CheckCheck, Wrench, DollarSign, AlertTriangle, CalendarPlus, X } from "lucide-react"
import { api } from "@/api/client"
import { cn } from "@/lib/utils"
import { Link } from "react-router-dom"

interface AppNotification {
  id: string
  type: string
  title: string
  body: string
  link: string | null
  read: boolean
  createdAt: string
}

const typeIcon: Record<string, { icon: typeof Bell; className: string }> = {
  "job.created":      { icon: CalendarPlus, className: "bg-violet-100 text-violet-600 dark:bg-violet-500/20 dark:text-violet-400" },
  "job.completed":    { icon: Wrench,       className: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400" },
  "job.status_changed": { icon: Wrench,    className: "bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400" },
  "payment.received": { icon: DollarSign,  className: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400" },
  "payment.failed":   { icon: AlertTriangle, className: "bg-rose-100 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400" },
  "review.new":       { icon: Bell,        className: "bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400" },
  "plan.created":     { icon: CheckCheck,  className: "bg-indigo-100 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400" },
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
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [unread, setUnread] = useState(0)
  const ref = useRef<HTMLDivElement>(null)

  function load() {
    api.get<{ notifications: AppNotification[]; unreadCount: number }>("/api/notifications")
      .then(({ notifications: n, unreadCount }) => {
        setNotifications(n)
        setUnread(unreadCount)
      })
      .catch(() => {})
  }

  useEffect(() => {
    load()
    const interval = setInterval(load, 30000)
    return () => clearInterval(interval)
  }, [])

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

  function markAllRead() {
    api.patch("/api/notifications/read-all", {})
      .then(() => {
        setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
        setUnread(0)
      })
      .catch(() => {})
  }

  function markRead(id: string) {
    api.patch(`/api/notifications/${id}/read`, {})
      .then(() => {
        setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n))
        setUnread((c) => Math.max(0, c - 1))
      })
      .catch(() => {})
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={handleOpen}
        className="relative flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground hover:text-foreground hover:bg-card transition-colors"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground border-2 border-background">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-50 w-80 rounded-2xl border border-border bg-card shadow-xl">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h3 className="text-sm font-bold text-foreground">Notifications</h3>
            <div className="flex items-center gap-2">
              {unread > 0 && (
                <button
                  type="button"
                  onClick={markAllRead}
                  className="flex items-center gap-1 text-[10px] font-semibold text-primary hover:text-primary/80 transition-colors"
                >
                  <CheckCheck className="h-3 w-3" /> Mark all read
                </button>
              )}
              <button type="button" onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="max-h-[420px] overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <Bell className="h-8 w-8 text-muted-foreground/30 mb-2" />
                <p className="text-xs text-muted-foreground">No notifications yet</p>
              </div>
            ) : (
              notifications.map((n) => {
                const cfg = typeIcon[n.type] ?? typeIcon["job.created"]
                const IconComp = cfg.icon
                const content = (
                  <div
                    className={cn(
                      "flex items-start gap-3 px-4 py-3 hover:bg-muted/50 transition-colors cursor-pointer",
                      !n.read && "bg-primary/5"
                    )}
                    onClick={() => !n.read && markRead(n.id)}
                  >
                    <div className={cn("flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl", cfg.className)}>
                      <IconComp className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className={cn("text-xs font-semibold text-foreground leading-snug", !n.read && "font-bold")}>{n.title}</p>
                        <span className="text-[10px] text-muted-foreground flex-shrink-0">{timeAgo(n.createdAt)}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{n.body}</p>
                    </div>
                    {!n.read && (
                      <div className="h-2 w-2 rounded-full bg-primary flex-shrink-0 mt-1" />
                    )}
                  </div>
                )
                return n.link ? (
                  <Link key={n.id} to={n.link} onClick={() => { markRead(n.id); setOpen(false) }}>
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
