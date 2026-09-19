import { useState } from "react"
import { toast } from "sonner"
import { FlaskConical } from "lucide-react"
import { useAuth } from "@/auth/auth-context"
import { api } from "@/api/client"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export function SandboxBanner() {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [exiting, setExiting] = useState(false)
  const [error, setError] = useState("")

  if (user?.role !== "office" || !user.organization?.sandboxMode) return null

  async function handleExit() {
    setExiting(true)
    setError("")
    try {
      await api.post("/api/organizations/me/sandbox/exit", {})
      toast.success("Sandbox cleared — you're ready to start for real")
      // Reload so every page drops the sample data it had cached.
      window.location.reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not exit sandbox mode")
      setExiting(false)
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-primary/25 bg-primary/10 px-4 py-2 text-sm text-foreground">
        <span className="flex items-center gap-2">
          <FlaskConical className="h-4 w-4 shrink-0 text-primary" />
          <span>
            <strong>Sandbox mode.</strong> You're exploring with sample data. Nothing here is real and no
            messages are sent.
          </span>
        </span>
        <button
          onClick={() => setOpen(true)}
          className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
        >
          Exit sandbox &amp; start for real
        </button>
      </div>

      <Dialog open={open} onOpenChange={(v) => !exiting && setOpen(v)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Start using Pneuros for real?</DialogTitle>
            <DialogDescription>This can't be undone, and sandbox mode can't be turned back on.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div>
              <p className="font-medium text-foreground">Removed</p>
              <p className="text-muted-foreground">
                The sample customers, technicians, trucks, jobs, invoices and messages — plus anything attached
                to them, including jobs you created for a sample customer while practicing.
              </p>
            </div>
            <div>
              <p className="font-medium text-foreground">Kept</p>
              <p className="text-muted-foreground">
                Your account, settings and pricebook, and any customers or technicians you added yourself.
              </p>
            </div>
            {error && <p className="text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={exiting}>
              Keep practicing
            </Button>
            <Button onClick={handleExit} disabled={exiting}>
              {exiting ? "Clearing…" : "Yes, remove sample data"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
