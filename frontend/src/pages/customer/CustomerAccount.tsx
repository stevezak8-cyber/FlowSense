import { useEffect, useState } from "react"
import { api } from "@/api/client"
import type { CustomerProfile } from "@/api/types"
import { Loader2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40 ${checked ? "bg-primary" : "bg-muted-foreground/30"}`}
    >
      <span
        className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-6" : "translate-x-1"}`}
      />
    </button>
  )
}

export default function CustomerAccount() {
  const [profile, setProfile] = useState<CustomerProfile | null>(null)
  const [form, setForm] = useState({ name: "", phone: "", email: "", address: "" })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState("")

  useEffect(() => {
    api.get<CustomerProfile>("/api/customers/me")
      .then((p) => {
        setProfile(p)
        setForm({ name: p.name, phone: p.phone, email: p.email ?? "", address: p.address })
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) return setSaveError("Name is required")
    if (form.phone.trim().length < 10) return setSaveError("Enter a valid phone number")
    if (form.email && !form.email.includes("@")) return setSaveError("Enter a valid email address")
    setSaving(true)
    setSaveError("")
    try {
      const updated = await api.patch<CustomerProfile>("/api/customers/me", {
        name: form.name,
        phone: form.phone,
        email: form.email || undefined,
        address: form.address,
      })
      setProfile(updated)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch {
      setSaveError("Failed to save. Try again.")
    } finally {
      setSaving(false)
    }
  }

  async function toggleOpt(field: "smsOptOut" | "emailOptOut", newOptOut: boolean) {
    if (!profile) return
    const prev = profile
    setProfile({ ...profile, [field]: newOptOut })
    try {
      const updated = await api.patch<CustomerProfile>("/api/customers/me", { [field]: newOptOut })
      setProfile(updated)
    } catch {
      setProfile(prev)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !profile) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Could not load profile.</p>
  }

  const smsOn = !profile.smsOptOut
  const emailOn = !profile.emailOptOut

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h1 className="text-lg font-semibold">My Account</h1>
        <p className="text-sm text-muted-foreground">Update your contact info and preferences</p>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Contact Info</h2>
        <form onSubmit={handleSave} className="space-y-3">
          <div>
            <Label htmlFor="name" className="text-sm">Name</Label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="phone" className="text-sm">Phone</Label>
            <Input
              id="phone"
              type="tel"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="email" className="text-sm">
              Email <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Input
              id="email"
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="address" className="text-sm">Address</Label>
            <Input
              id="address"
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              className="mt-1"
            />
          </div>
          {saveError && <p className="text-sm text-destructive">{saveError}</p>}
          <div className="flex items-center gap-3 pt-1">
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : saved ? "Saved!" : "Save changes"}
            </Button>
          </div>
        </form>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Notifications</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium">SMS notifications</div>
              <div className="text-xs text-muted-foreground">Reminders &amp; status updates to {profile.phone}</div>
            </div>
            <Toggle
              checked={smsOn}
              onChange={(v) => toggleOpt("smsOptOut", !v)}
            />
          </div>
          <div className="border-t border-border" />
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium">Email notifications</div>
              <div className="text-xs text-muted-foreground">
                {profile.email
                  ? `Reminders & status updates to ${profile.email}`
                  : "Add an email address to enable"}
              </div>
            </div>
            <Toggle
              checked={emailOn}
              onChange={(v) => toggleOpt("emailOptOut", !v)}
              disabled={!profile.email}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
