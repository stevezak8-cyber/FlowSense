import { Link, useLocation, useNavigate } from "react-router-dom"
import { useState, useEffect } from "react"
import { OnboardingChecklist } from "@/components/office/onboarding-checklist"
import { useOnboarding } from "@/components/office/onboarding-context"
import {
  LayoutDashboard,
  Wrench,
  Users,
  UserCog,
  MessageSquare,
  BarChart3,
  Settings,
  LogOut,
  Calendar,
  CreditCard,
  ShieldCheck,
  ClipboardList,
  Menu,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { PneurosLogo } from "@/components/brand"
import { useAuth } from "@/auth/auth-context"

const navItems = [
  { label: "Dashboard", href: "/office", icon: LayoutDashboard },
  { label: "Schedule", href: "/office/schedule", icon: Calendar },
  { label: "Jobs", href: "/office/jobs", icon: Wrench },
  { label: "Maintenance", href: "/office/maintenance", icon: ClipboardList },
  { label: "Technicians", href: "/office/technicians", icon: UserCog },
  { label: "Customers", href: "/office/customers", icon: Users },
  { label: "Messages", href: "/office/messages", icon: MessageSquare },
  { label: "Revenue", href: "/office/reports", icon: BarChart3 },
  { label: "Compliance", href: "/office/compliance", icon: ShieldCheck },
]

const bottomItems = [
  { label: "Settings", href: "/office/settings", icon: Settings },
]

async function openBillingPortal() {
  const token = localStorage.getItem("flowsense_token")
  const res = await fetch("/api/billing/portal", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })
  const data = (await res.json()) as { url?: string }
  if (data.url) window.location.href = data.url
}

export function MobileMenuButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex md:hidden items-center justify-center h-9 w-9 rounded-xl text-muted-foreground hover:bg-sidebar-accent hover:text-foreground transition-colors"
      aria-label="Open menu"
    >
      <Menu className="h-5 w-5" />
    </button>
  )
}

export function AppSidebar() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const { refreshKey } = useOnboarding()
  const [mobileOpen, setMobileOpen] = useState(false)

  // Close on route change
  useEffect(() => { setMobileOpen(false) }, [pathname])

  function handleLogout() {
    logout()
    navigate("/login")
  }

  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile open button — rendered inside TopHeader via MobileMenuButton, exposed here for wiring */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="fixed top-4 left-4 z-30 flex md:hidden items-center justify-center h-9 w-9 rounded-xl bg-background border border-border shadow-sm text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>

    <aside className={cn(
      "fixed inset-y-0 left-0 z-50 flex w-[220px] flex-col bg-sidebar shadow-[1px_0_8px_rgba(0,0,0,0.04)] dark:border-r dark:border-sidebar-border dark:shadow-none transition-transform duration-200",
      "md:inset-y-4 md:left-4 md:rounded-3xl md:border md:border-sidebar-border md:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.5),0_20px_40px_-20px_rgba(0,0,0,0.25)] dark:md:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06),0_20px_40px_-20px_rgba(0,0,0,0.5)]",
      "md:translate-x-0",
      mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
    )}>
      {/* Logo + mobile close */}
      <div className="flex h-[68px] items-center justify-between px-5">
        <PneurosLogo size="sm" />
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          className="flex md:hidden items-center justify-center h-8 w-8 rounded-lg text-muted-foreground hover:bg-sidebar-accent transition-colors"
          aria-label="Close menu"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Nav Items */}
      <nav className="flex flex-1 flex-col gap-1 px-3 pt-2">
        {navItems.map((item) => {
          const isActive =
            item.href === "/office"
              ? pathname === "/office"
              : pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              to={item.href}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] transition-all",
                isActive
                  ? "text-sidebar-primary font-semibold bg-primary/[0.06]"
                  : "text-sidebar-foreground font-medium hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
            >
              <item.icon className={cn("h-[18px] w-[18px]", isActive ? "text-sidebar-primary" : "text-muted-foreground")} />
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* Onboarding Checklist */}
      <OnboardingChecklist refreshKey={refreshKey} />

      {/* Bottom Items */}
      <div className="px-3 py-4 space-y-1">
        <button
          type="button"
          onClick={openBillingPortal}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium text-sidebar-foreground transition-all hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <CreditCard className="h-[18px] w-[18px] text-muted-foreground" />
          Billing
        </button>
        {bottomItems.map((item) => (
          <Link
            key={item.href}
            to={item.href}
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium text-sidebar-foreground transition-all hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <item.icon className="h-[18px] w-[18px] text-muted-foreground" />
            {item.label}
          </Link>
        ))}

        {/* User info */}
        {user && (
          <div className="mt-3 rounded-xl bg-sidebar-accent/60 px-3 py-3">
            <div className="text-[13px] font-semibold text-card-foreground truncate">
              {user.name ?? user.email}
            </div>
            <div className="mt-0.5 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
              {user.role}
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium text-sidebar-foreground transition-all hover:bg-destructive/10 hover:text-destructive"
        >
          <LogOut className="h-[18px] w-[18px]" />
          <span>Logout</span>
        </button>
      </div>
    </aside>
    </>
  )
}
