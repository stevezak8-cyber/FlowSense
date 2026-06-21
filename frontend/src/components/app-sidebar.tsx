import { Link, useLocation, useNavigate } from "react-router-dom"
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
} from "lucide-react"
import { cn } from "@/lib/utils"
import { FlowSenseLogo } from "@/components/brand"
import { useAuth } from "@/auth/auth-context"

const navItems = [
  { label: "Dashboard", href: "/office", icon: LayoutDashboard },
  { label: "Schedule", href: "/office/schedule", icon: Calendar },
  { label: "Jobs", href: "/office/jobs", icon: Wrench },
  { label: "Technicians", href: "/office/technicians", icon: UserCog },
  { label: "Customers", href: "/office/customers", icon: Users },
  { label: "Messages", href: "/office/messages", icon: MessageSquare },
  { label: "Reports", href: "/office/reports", icon: BarChart3 },
]

const bottomItems = [
  { label: "Settings", href: "/office/settings", icon: Settings },
]

export function AppSidebar() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useAuth()

  function handleLogout() {
    logout()
    navigate("/login")
  }

  return (
    <aside className="fixed inset-y-0 left-0 z-30 flex w-[220px] flex-col bg-sidebar shadow-[1px_0_8px_rgba(0,0,0,0.04)] dark:border-r dark:border-sidebar-border dark:shadow-none">
      {/* Logo */}
      <div className="flex h-[68px] items-center px-5">
        <FlowSenseLogo size="sm" />
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

      {/* Bottom Items */}
      <div className="px-3 py-4 space-y-1">
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
