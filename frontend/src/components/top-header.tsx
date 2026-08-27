import { GlobalSearch } from "@/components/search/GlobalSearch"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { ThemeToggle } from "@/components/theme-toggle"
import { useAuth } from "@/auth/auth-context"
import { NotificationBell } from "@/components/notifications/NotificationBell"

export function TopHeader() {
  const { user } = useAuth()
  const initials = user?.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "U"

  return (
    <header className="sticky top-0 z-20 flex h-[68px] items-center justify-between bg-background px-8">
      <GlobalSearch />
      <div className="flex items-center gap-3">
        <div className="hidden items-center gap-2 rounded-full bg-card px-3 py-1.5 text-xs text-muted-foreground shadow-sm md:flex">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-success" />
          <span className="font-medium">{new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
        </div>
        <NotificationBell />
        <ThemeToggle />
        <Avatar className="h-9 w-9 border-2 border-primary/15">
          <AvatarFallback className="bg-primary/8 text-xs text-primary font-semibold">
            {initials}
          </AvatarFallback>
        </Avatar>
      </div>
    </header>
  )
}
