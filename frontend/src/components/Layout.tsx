import { ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Wrench,
  Users,
  UserCircle,
  Wind,
  Settings,
  Bell,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/jobs", label: "Jobs", icon: Wrench },
  { to: "/technicians", label: "Technicians", icon: Users },
  { to: "/customers", label: "Customers", icon: UserCircle },
];

export default function Layout({ children }: { children: ReactNode }) {
  const location = useLocation();

  const pageTitle = (() => {
    const path = location.pathname;
    if (path === "/") return "Dashboard";
    if (path.startsWith("/jobs/")) return "Job Detail";
    if (path === "/jobs") return "Jobs";
    if (path === "/technicians") return "Technicians";
    if (path === "/customers") return "Customers";
    return "FlowSense";
  })();

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="flex w-64 flex-col bg-sidebar">
        {/* Brand */}
        <div className="flex items-center gap-3 px-6 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-600">
            <Wind className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight text-white">
              FlowSense
            </h1>
            <p className="text-[11px] font-medium uppercase tracking-wider text-sidebar-muted">
              HVAC Platform
            </p>
          </div>
        </div>

        <Separator className="bg-sidebar-accent" />

        {/* Navigation */}
        <nav className="flex-1 space-y-1 px-3 py-4">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150",
                  isActive
                    ? "bg-teal-600/20 text-teal-400"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )
              }
            >
              <Icon className="h-[18px] w-[18px]" />
              {label}
            </NavLink>
          ))}
        </nav>

        <Separator className="bg-sidebar-accent" />

        {/* Bottom section */}
        <div className="px-3 py-4 space-y-1">
          <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
            <Settings className="h-[18px] w-[18px]" />
            Settings
          </button>
        </div>

        {/* User section */}
        <div className="border-t border-sidebar-accent px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-teal-700 text-xs font-semibold text-white">
              FS
            </div>
            <div className="flex-1 min-w-0">
              <p className="truncate text-sm font-medium text-white">
                FlowSense Admin
              </p>
              <p className="truncate text-xs text-sidebar-muted">
                admin@flowsense.io
              </p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex h-16 shrink-0 items-center justify-between border-b bg-white px-8">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              {pageTitle}
            </h2>
          </div>
          <div className="flex items-center gap-4">
            <button className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
              <Search className="h-[18px] w-[18px]" />
            </button>
            <button className="relative flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
              <Bell className="h-[18px] w-[18px]" />
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-teal-500" />
            </button>
            <Separator orientation="vertical" className="h-6" />
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-teal-100 text-xs font-semibold text-teal-700">
                FS
              </div>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto bg-background p-8">
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
