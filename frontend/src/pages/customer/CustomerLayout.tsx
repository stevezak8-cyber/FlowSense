import { Link, Outlet, useLocation, useNavigate } from "react-router-dom"
import {
  LayoutDashboard,
  CalendarPlus,
  FileText,
  MessageSquare,
  LogOut,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { FlowSenseLogo } from "@/components/brand"
import { ThemeToggle } from "@/components/theme-toggle"
import { useAuth } from "@/auth/auth-context"
import { ConciergeChatWidget } from "@/components/customer/ConciergeChatWidget"

const navItems = [
  { label: "Dashboard", to: "/customer", icon: LayoutDashboard },
  { label: "Book Service", to: "/customer/book", icon: CalendarPlus },
  { label: "Invoices", to: "/customer/invoices", icon: FileText },
  { label: "Messages", to: "/customer/messages", icon: MessageSquare },
]

export default function CustomerLayout() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const showFloating = pathname !== "/customer" && pathname !== "/customer/"

  function handleLogout() {
    logout()
    navigate("/login")
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-card shadow-[0_1px_4px_rgba(0,0,0,0.04)] dark:border-b dark:border-border dark:shadow-none">
        <div className="mx-auto flex h-[60px] max-w-5xl items-center justify-between px-4">
          <FlowSenseLogo size="sm" />
          <div className="flex items-center gap-3">
            {user && (
              <span className="text-xs text-muted-foreground font-medium hidden sm:block">
                {user.name}
              </span>
            )}
            <ThemeToggle />
            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        {/* Tab nav */}
        <div className="mx-auto max-w-5xl px-4">
          <nav className="flex gap-1 overflow-x-auto pb-0">
            {navItems.map((item) => {
              const isActive =
                item.to === "/customer"
                  ? pathname === "/customer"
                  : pathname.startsWith(item.to)
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 text-xs font-medium transition-colors",
                    isActive
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              )
            })}
          </nav>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <Outlet />
      </main>
      {showFloating && <ConciergeChatWidget />}
    </div>
  )
}
