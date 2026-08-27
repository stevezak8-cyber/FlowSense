import { Wind } from "lucide-react"
import { cn } from "@/lib/utils"

export function PneurosLogo({
  size = "md",
  className,
}: {
  size?: "sm" | "md" | "lg"
  className?: string
}) {
  const sizes = {
    sm: { icon: "h-8 w-8", iconInner: "h-4 w-4", title: "text-base", sub: "text-[9px]" },
    md: { icon: "h-10 w-10", iconInner: "h-5 w-5", title: "text-lg", sub: "text-[10px]" },
    lg: { icon: "h-14 w-14", iconInner: "h-8 w-8", title: "text-2xl", sub: "text-xs" },
  }
  const s = sizes[size]

  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div
        className={cn(
          "flex items-center justify-center rounded-xl bg-primary shadow-sm",
          s.icon
        )}
      >
        <Wind className={cn("text-primary-foreground", s.iconInner)} />
      </div>
      <div className="flex flex-col">
        <span
          className={cn(
            "font-semibold tracking-tight text-foreground",
            s.title
          )}
        >
          Pneuros
        </span>
        <span
          className={cn(
            "text-muted-foreground",
            s.sub
          )}
        >
          HVAC Platform
        </span>
      </div>
    </div>
  )
}
