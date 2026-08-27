import { useState } from "react"
import { api } from "@/api/client"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Mail, Copy, CheckCircle2, Loader2, AlertCircle } from "lucide-react"
import { toast } from "sonner"

interface Props {
  /** Pre-filled email — e.g. from the technician or customer record */
  email?: string
  role: "technician" | "customer" | "office"
  /** Optional DB id to link the new user to an existing technician/customer */
  technicianId?: string
  customerId?: string
  trigger?: React.ReactNode
}

export function InviteDialog({ email: defaultEmail = "", role, technicianId, customerId, trigger }: Props) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState(defaultEmail)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [inviteUrl, setInviteUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  function reset() {
    setEmail(defaultEmail)
    setError(null)
    setInviteUrl(null)
    setCopied(false)
  }

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const { token } = await api.post<{ token: string }>("/api/auth/invite", {
        email,
        role,
        ...(technicianId && { technicianId }),
        ...(customerId && { customerId }),
      })
      const url = `${window.location.origin}/invite/${token}`
      setInviteUrl(url)
      toast.success("Invite link generated")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate invite")
    } finally {
      setLoading(false)
    }
  }

  async function copyUrl() {
    if (!inviteUrl) return
    try {
      await navigator.clipboard.writeText(inviteUrl)
      setCopied(true)
      toast.success("Invite link copied to clipboard")
      setTimeout(() => setCopied(false), 2500)
    } catch {
      // Fallback: select the text input
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset() }}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" variant="outline" className="gap-1.5">
            <Mail className="h-3.5 w-3.5" />
            Invite
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">
            Invite {role === "technician" ? "technician" : role === "customer" ? "customer" : "staff member"}
          </DialogTitle>
        </DialogHeader>

        {!inviteUrl ? (
          <form onSubmit={handleGenerate} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="invite-email" className="text-sm text-foreground">Email address</Label>
              <Input
                id="invite-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="h-9"
                required
                autoFocus={!defaultEmail}
              />
              <p className="text-[11px] text-muted-foreground">
                They'll receive a link to set their password and access Pneuros.
              </p>
            </div>
            {error && (
              <p className="flex items-center gap-1.5 text-xs text-destructive">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={loading}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {loading && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                Generate invite link
              </Button>
            </div>
          </form>
        ) : (
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label className="text-sm text-foreground">Invite link</Label>
              <div className="flex gap-2">
                <Input
                  value={inviteUrl}
                  readOnly
                  className="h-9 font-mono text-xs bg-secondary"
                  onFocus={(e) => e.target.select()}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={copyUrl}
                  className="shrink-0 gap-1.5"
                >
                  {copied ? (
                    <><CheckCircle2 className="h-3.5 w-3.5 text-success" /> Copied</>
                  ) : (
                    <><Copy className="h-3.5 w-3.5" /> Copy</>
                  )}
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                This link expires in 7 days. Send it to <span className="font-medium">{email}</span> so they can set their password.
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" size="sm" onClick={reset}>
                Generate another
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => setOpen(false)}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                Done
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
