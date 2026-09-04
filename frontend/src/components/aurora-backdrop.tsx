import { cn } from "@/lib/utils"

interface AuroraBackdropProps {
  /** "warm" matches the office section's burnt-orange accent; "cool" matches the base MedOps blue. */
  tone: "warm" | "cool"
}

/** A fixed, blurred gradient mesh painted behind an app shell so the liquid-glass panels
 *  (bg-card/bg-popover/bg-sidebar, blurred via index.css) have something to visibly refract. */
export function AuroraBackdrop({ tone }: AuroraBackdropProps) {
  return (
    <div
      aria-hidden="true"
      className={cn("aurora-backdrop", tone === "warm" ? "aurora-warm" : "aurora-cool")}
    />
  )
}
