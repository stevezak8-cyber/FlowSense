import { Link, Outlet, useLocation, useNavigate } from "react-router-dom"
import { LayoutDashboard, MapPin, MessageSquare, User, LogOut } from "lucide-react"
import { cn } from "@/lib/utils"
import { FlowSenseLogo } from "@/components/brand"
import { ThemeToggle } from "@/components/theme-toggle"
import { useAuth } from "@/auth/auth-context"

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
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-success animate-pulse" />
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">On Duty</span>
          </div>
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
