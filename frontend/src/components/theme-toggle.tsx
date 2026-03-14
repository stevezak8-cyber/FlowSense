import { Sun, Moon } from "lucide-react"
import { useTheme } from "@/theme/theme-context"
import { cn } from "@/lib/utils"

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggleTheme } = useTheme()

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={cn(
        "relative flex h-8 items-center gap-1.5 rounded-full px-3 text-[11px] font-semibold tracking-wide transition-all",
        theme === "light"
          ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20"
          : "bg-card text-muted-foreground border border-border hover:text-foreground",
        className
      )}
    >
      {theme === "light" ? (
        <>
          <Sun className="h-3.5 w-3.5" />
          <span>Light</span>
        </>
      ) : (
        <>
          <Moon className="h-3.5 w-3.5" />
          <span>Dark</span>
        </>
      )}
    </button>
  )
}
