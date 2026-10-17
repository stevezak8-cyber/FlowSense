import { useState } from "react"
import { Download, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { downloadFile } from "@/api/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

interface Export { key: string; label: string; hint: string; dated: boolean }

const EXPORTS: Export[] = [
  { key: "customers", label: "Customers", hint: "Contact details, addresses and notes", dated: false },
  { key: "equipment", label: "Equipment", hint: "Make, model, serial, warranty and service dates", dated: false },
  { key: "jobs", label: "Jobs", hint: "Every visit with technician, work done and invoiced total", dated: true },
  { key: "invoices", label: "Invoices", hint: "For your bookkeeper or accounting software", dated: true },
]

// Takes the shop's own records out as spreadsheets. Open to any office user on any plan.
export function DataExportCard() {
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [busy, setBusy] = useState<string | null>(null)

  async function run(e: Export) {
    setBusy(e.key)
    try {
      const qs = new URLSearchParams()
      if (e.dated && from) qs.set("from", from)
      if (e.dated && to) qs.set("to", to)
      await downloadFile(`/api/exports/${e.key}.csv${qs.size ? `?${qs}` : ""}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Download failed")
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-base font-semibold text-card-foreground">
          <Download className="h-4 w-4 text-primary" />
          Export your data
        </CardTitle>
        <CardDescription>Download your records as spreadsheets (CSV). Dates in the files are UTC.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Jobs and invoices from</span>
          <input id="export-from" type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className="rounded border px-2 py-1 text-sm" />
          <span className="text-muted-foreground">to</span>
          <input id="export-to" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className="rounded border px-2 py-1 text-sm" />
          <span className="text-xs text-muted-foreground">(leave blank for everything)</span>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {EXPORTS.map((e) => (
            <div key={e.key} className="flex items-center justify-between gap-3 rounded-md border p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{e.label}</p>
                <p className="text-xs text-muted-foreground">{e.hint}</p>
              </div>
              <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => run(e)}>
                {busy === e.key ? <Loader2 className="h-4 w-4 animate-spin" /> : "Download"}
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
