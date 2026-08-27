import { Link, useLocation, useNavigate } from "react-router-dom"
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

export function AppSidebar() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const { refreshKey } = useOnboarding()

  function handleLogout() {
    logout()
    navigate("/login")
  }

  return (
    <aside className="fixed inset-y-0 left-0 z-30 flex w-[220px] flex-col bg-sidebar shadow-[1px_0_8px_rgba(0,0,0,0.04)] dark:border-r dark:border-sidebar-border dark:shadow-none">
      {/* Logo */}
      <div className="flex h-[68px] items-center px-5">
        <PneurosLogo size="sm" />
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
  )
}
