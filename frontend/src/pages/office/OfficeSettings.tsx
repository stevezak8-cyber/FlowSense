"use client"

import { useState, useEffect } from "react"
import { api } from "@/api/client"
import type { ApiOrganization, NotificationPreferences } from "@/api/types"
import { useOnboarding } from "@/components/office/onboarding-context"
import { useAuth } from "@/auth/auth-context"
import { ChangePasswordCard } from "@/components/change-password-card"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Building2, User, Bell, Mail, Phone, Loader2, AlertCircle, BookOpen, CreditCard, CheckCircle, MessageSquare } from "lucide-react"
import { PricebookSettings } from "@/components/pricebook/pricebook-settings"
import { toast } from "sonner"

const DEFAULT_PREFS: NotificationPreferences = {
  booking: true,
  statusChange: true,
  completion: true,
  urgent: true,
}

export default function OfficeSettings() {
  const { user } = useAuth()
  const { triggerRefresh } = useOnboarding()

  // Org state
  const [org, setOrg] = useState<ApiOrganization | null>(null)
  const [orgName, setOrgName] = useState("")
  const [orgPhone, setOrgPhone] = useState("")
  const [orgEmail, setOrgEmail] = useState("")
  const [orgAddress, setOrgAddress] = useState("")
  const [orgLoading, setOrgLoading] = useState(true)
  const [orgSaving, setOrgSaving] = useState(false)
  const [orgError, setOrgError] = useState<string | null>(null)

  // Account state
  const [userName, setUserName] = useState(user?.name ?? "")
  const [accountSaving, setAccountSaving] = useState(false)
  const [accountError, setAccountError] = useState<string | null>(null)

  // Stripe Connect state
  const [connectLoading, setConnectLoading] = useState(false)
  const [connectStatus, setConnectStatus] = useState<"success" | "error" | null>(null)

  // SMS state
  const [smsEnabled, setSmsEnabled] = useState(false)
  const [smsLoading, setSmsLoading] = useState(false)

  // Notification state
  const [prefs, setPrefs] = useState<NotificationPreferences>(DEFAULT_PREFS)
  const [prefsSaving, setPrefsSaving] = useState(false)
  const [prefsError, setPrefsError] = useState<string | null>(null)

  // Read connect URL param
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const connect = params.get("connect")
    if (connect === "success") setConnectStatus("success")
    else if (connect === "error") setConnectStatus("error")
  }, [])

  // Load org on mount
  useEffect(() => {
    api.get<ApiOrganization>("/api/organizations/me")
      .then((data) => {
        setOrg(data)
        setOrgName(data.name ?? "")
        setOrgPhone(data.phone ?? "")
        setOrgEmail(data.email ?? "")
        setOrgAddress(data.address ?? "")
        setPrefs(data.notificationPreferences ?? DEFAULT_PREFS)
        setSmsEnabled(data.smsEnabled ?? false)
      })
      .catch(() => setOrgError("Could not load organization settings"))
      .finally(() => setOrgLoading(false))
  }, [])

  async function handleSmsToggle(enabled: boolean) {
    setSmsLoading(true)
    try {
      await api.patch<ApiOrganization>("/api/organizations/me", { smsEnabled: enabled })
      setSmsEnabled(enabled)
    } catch {
      // leave toggle in current state on error
    } finally {
      setSmsLoading(false)
    }
  }

  async function handleConnectStripe() {
    setConnectLoading(true)
    try {
      const data = await api.get<{ url: string }>("/api/billing/connect")
      window.location.href = data.url
    } catch {
      toast.error("Could not start Stripe Connect. Please try again.")
      setConnectLoading(false)
    }
  }

  async function handleSaveOrg(e: React.FormEvent) {
    e.preventDefault()
    setOrgSaving(true)
    setOrgError(null)
    try {
      const updated = await api.patch<ApiOrganization>("/api/organizations/me", {
        name: orgName,
        phone: orgPhone,
        email: orgEmail,
        address: orgAddress,
      })
      setOrg(updated)
      toast.success("Organization settings saved")
      triggerRefresh()
    } catch (err) {
      setOrgError(err instanceof Error ? err.message : "Failed to save")
    } finally {
      setOrgSaving(false)
    }
  }

  async function handleSaveAccount(e: React.FormEvent) {
    e.preventDefault()
    setAccountSaving(true)
    setAccountError(null)
    try {
      await api.patch("/api/auth/me", { name: userName })
      toast.success("Account name updated")
    } catch (err) {
      setAccountError(err instanceof Error ? err.message : "Failed to save")
    } finally {
      setAccountSaving(false)
    }
  }

  async function handleSavePrefs() {
    setPrefsSaving(true)
    setPrefsError(null)
    try {
      const updated = await api.patch<ApiOrganization>("/api/organizations/me", {
        notificationPreferences: prefs,
      })
      setOrg(updated)
      toast.success("Notification preferences saved")
    } catch (err) {
      setPrefsError(err instanceof Error ? err.message : "Failed to save")
    } finally {
      setPrefsSaving(false)
    }
  }

  function togglePref(key: keyof NotificationPreferences) {
    setPrefs((p) => ({ ...p, [key]: !p[key] }))
  }

  if (orgLoading) {
    return (
      <div className="flex items-center gap-2 py-16 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading settings…
      </div>
    )
  }

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your organization and account preferences</p>
      </div>

      {/* Organization Profile */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base font-semibold text-card-foreground">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            Organization Profile
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSaveOrg} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="orgName" className="text-sm text-foreground">Company Name</Label>
                <Input
                  id="orgName"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  placeholder="Your HVAC Company"
                  className="h-9"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="orgPhone" className="text-sm text-foreground">Main Phone</Label>
                <div className="relative">
                  <Phone className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    id="orgPhone"
                    value={orgPhone}
                    onChange={(e) => setOrgPhone(e.target.value)}
                    placeholder="+1 (555) 000-0000"
                    className="h-9 pl-8"
                  />
                </div>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="orgEmail" className="text-sm text-foreground">Dispatch Email</Label>
              <div className="relative">
                <Mail className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  id="orgEmail"
                  type="email"
                  value={orgEmail}
                  onChange={(e) => setOrgEmail(e.target.value)}
                  placeholder="dispatch@yourcompany.com"
                  className="h-9 pl-8"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="orgAddress" className="text-sm text-foreground">Business Address</Label>
              <Input
                id="orgAddress"
                value={orgAddress}
                onChange={(e) => setOrgAddress(e.target.value)}
                placeholder="123 Main St, City, State 00000"
                className="h-9"
              />
            </div>
            {orgError && (
              <p className="flex items-center gap-1.5 text-xs text-destructive">
                <AlertCircle className="h-3.5 w-3.5" />
                {orgError}
              </p>
            )}
            <div className="flex items-center gap-3 pt-1">
              <Button
                type="submit"
                size="sm"
                disabled={orgSaving}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {orgSaving && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
                Save Organization
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Account */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base font-semibold text-card-foreground">
            <User className="h-4 w-4 text-muted-foreground" />
            My Account
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSaveAccount} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="userName" className="text-sm text-foreground">Display Name</Label>
                <Input
                  id="userName"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  placeholder="Your name"
                  className="h-9"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="userEmail" className="text-sm text-foreground">Email</Label>
                <Input
                  id="userEmail"
                  value={user?.email ?? ""}
                  disabled
                  className="h-9 opacity-60 cursor-not-allowed"
                />
                <p className="text-[10px] text-muted-foreground">Email cannot be changed here</p>
              </div>
            </div>
            {accountError && (
              <p className="flex items-center gap-1.5 text-xs text-destructive">
                <AlertCircle className="h-3.5 w-3.5" />
                {accountError}
              </p>
            )}
            <div className="flex items-center gap-3 pt-1">
              <Button
                type="submit"
                size="sm"
                disabled={accountSaving}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {accountSaving && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
                Save Account
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base font-semibold text-card-foreground">
            <Bell className="h-4 w-4 text-muted-foreground" />
            Email Notifications
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {([
              { key: "booking" as const, label: "New booking confirmation", sub: "When a customer books a service" },
              { key: "statusChange" as const, label: "Job status changes", sub: "En route, in progress updates" },
              { key: "completion" as const, label: "Job completion", sub: "Summary email when a job is finished" },
              { key: "urgent" as const, label: "Urgent job alerts", sub: "Immediate alert for high-priority jobs" },
            ]).map((item) => (
              <div key={item.key} className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-card-foreground">{item.label}</p>
                  <p className="text-xs text-muted-foreground">{item.sub}</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={prefs[item.key]}
                  onClick={() => togglePref(item.key)}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus:outline-none ${
                    prefs[item.key] ? "bg-primary" : "bg-muted"
                  }`}
                >
                  <span
                    className={`pointer-events-none block h-4 w-4 rounded-full bg-white shadow-lg ring-0 transition-transform ${
                      prefs[item.key] ? "translate-x-4" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
            ))}
          </div>
          {prefsError && (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5" />
              {prefsError}
            </p>
          )}
          <div className="mt-4 flex items-center gap-3">
            <Button
              type="button"
              size="sm"
              disabled={prefsSaving}
              onClick={handleSavePrefs}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {prefsSaving && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
              Save Preferences
            </Button>
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">
            Notification emails are sent to your dispatch email address. Configure your email provider in your environment settings.
          </p>
        </CardContent>
      </Card>

      {/* Pricebook */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base font-semibold text-card-foreground">
            <BookOpen className="h-4 w-4 text-muted-foreground" />
            Pricebook &amp; Estimates
          </CardTitle>
        </CardHeader>
        <CardContent>
          <PricebookSettings />
        </CardContent>
      </Card>

      {/* Payment Collection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Payment Collection
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {connectStatus === "success" && (
            <div className="text-sm text-green-600 dark:text-green-400 font-medium">
              Stripe connected successfully.
            </div>
          )}
          {connectStatus === "error" && (
            <div className="text-sm text-destructive">
              Stripe connection failed. Please try again.
            </div>
          )}
          {org?.stripeConnectOnboarded ? (
            <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400 font-medium">
              <CheckCircle className="h-4 w-4" />
              Stripe Connected — deposits are enabled
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Connect your Stripe account to collect deposit payments from customers.
              </p>
              <Button onClick={handleConnectStripe} disabled={connectLoading} variant="outline">
                {connectLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Connect Stripe
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* SMS Notifications */}
      <div className="rounded-xl border bg-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-muted-foreground" />
          <h3 className="font-semibold">SMS Notifications</h3>
        </div>
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <p className="text-sm font-medium">Enable SMS notifications</p>
            <p className="text-xs text-muted-foreground">
              {smsEnabled
                ? "Customers will receive texts from our shared FlowSense number. Messages include your business name."
                : "Enable to send automated texts to customers at key job milestones."}
            </p>
          </div>
          <button
            role="switch"
            aria-checked={smsEnabled}
            onClick={() => !smsLoading && handleSmsToggle(!smsEnabled)}
            disabled={smsLoading}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              smsEnabled ? "bg-primary" : "bg-input"
            } ${smsLoading ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                smsEnabled ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>
      </div>

      <ChangePasswordCard />

      {org && (
        <p className="text-[11px] text-muted-foreground">
          Organization ID: <span className="font-mono">{org.id}</span>
        </p>
      )}
    </div>
  )
}
