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
    <header className="sticky top-4 z-20 mx-4 mt-4 flex h-[60px] items-center justify-between rounded-2xl border border-border bg-card px-5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.5),inset_1px_0_0_0_rgba(255,255,255,0.325),0_14px_30px_-18px_rgba(0,0,0,0.25)] dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06),inset_1px_0_0_0_rgba(255,255,255,0.039),0_14px_30px_-18px_rgba(0,0,0,0.5)] md:mx-6">
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
