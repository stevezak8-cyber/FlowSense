import { useState, useEffect } from "react"
import { api } from "@/api/client"
import type { ComplianceLog } from "@/api/types"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Loader2, ShieldCheck } from "lucide-react"
import { typeLabel, typeBadgeVariant, summarizePayload } from "@/components/compliance/compliance-utils"

interface ApiTechnician {
  id: string
  user: { name: string } | null
}

function defaultFrom() {
  const d = new Date()
  d.setDate(d.getDate() - 90)
  return d.toISOString().split("T")[0]
}

function defaultTo() {
  return new Date().toISOString().split("T")[0]
}

export default function OfficeCompliance() {
  const [logs, setLogs] = useState<ComplianceLog[]>([])
  const [technicians, setTechnicians] = useState<ApiTechnician[]>([])
  const [loading, setLoading] = useState(true)

  const [technicianId, setTechnicianId] = useState("")
  const [type, setType] = useState("")
  const [from, setFrom] = useState(defaultFrom())
  const [to, setTo] = useState(defaultTo())

  useEffect(() => {
    api.get<ApiTechnician[]>("/api/technicians").then(setTechnicians).catch(() => {})
  }, [])

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (technicianId) params.set("technicianId", technicianId)
    if (type) params.set("type", type)
    if (from) params.set("from", new Date(from).toISOString())
    if (to) params.set("to", new Date(to + "T23:59:59").toISOString())

    api.get<ComplianceLog[]>(`/api/compliance?${params}`)
      .then(setLogs)
      .catch(() => setLogs([]))
      .finally(() => setLoading(false))
  }, [technicianId, type, from, to])

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <ShieldCheck className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-semibold">Compliance Audit</h1>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <Select value={technicianId} onValueChange={setTechnicianId}>
          <SelectTrigger className="w-48"><SelectValue placeholder="All technicians" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">All technicians</SelectItem>
            {technicians.map((t) => (
              <SelectItem key={t.id} value={t.id}>{t.user?.name ?? "—"}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="w-40"><SelectValue placeholder="All types" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">All types</SelectItem>
            <SelectItem value="epa608_prompt">EPA 608</SelectItem>
            <SelectItem value="safety_ack">Safety</SelectItem>
            <SelectItem value="code_reminder">Code</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2">
          <Input type="date" className="w-40" value={from} onChange={(e) => setFrom(e.target.value)} />
          <span className="text-muted-foreground text-sm">to</span>
          <Input type="date" className="w-40" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-8">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading...
        </div>
      ) : logs.length === 0 ? (
        <p className="text-muted-foreground text-sm py-8">No compliance logs found for the selected filters.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-xs text-muted-foreground uppercase tracking-wide">
                <th className="px-4 py-3 text-left font-medium">Date</th>
                <th className="px-4 py-3 text-left font-medium">Job</th>
                <th className="px-4 py-3 text-left font-medium">Customer</th>
                <th className="px-4 py-3 text-left font-medium">Technician</th>
                <th className="px-4 py-3 text-left font-medium">Type</th>
                <th className="px-4 py-3 text-left font-medium">Summary</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                    {new Date(log.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                    {log.job?.scheduledAt ? new Date(log.job.scheduledAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}
                  </td>
                  <td className="px-4 py-3">{log.job?.customer?.name ?? "—"}</td>
                  <td className="px-4 py-3">{log.job?.technician?.user?.name ?? "—"}</td>
                  <td className="px-4 py-3">
                    <Badge variant={typeBadgeVariant(log.type)} className="text-xs">{typeLabel(log.type)}</Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground max-w-sm truncate">{summarizePayload(log)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
