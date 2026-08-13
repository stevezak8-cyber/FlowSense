"use client"

import { useState, useEffect } from "react"
import { api } from "@/api/client"
import type { ApiInvoice, RevenueDataPoint, ApiJob } from "@/api/types"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { DollarSign, TrendingUp, FileText, AlertCircle, Loader2, FileDown, Send } from "lucide-react"
import { toast } from "sonner"
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts"

const COLORS = [
  "oklch(0.55 0.18 260)",
  "oklch(0.65 0.18 145)",
  "oklch(0.60 0.14 200)",
  "oklch(0.70 0.16 55)",
]

export default function RevenuePage() {
  const [invoices, setInvoices] = useState<ApiInvoice[]>([])
  const [revenueData, setRevenueData] = useState<RevenueDataPoint[]>([])
  const [jobs, setJobs] = useState<ApiJob[]>([])
  const [loading, setLoading] = useState(true)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [sendingId, setSendingId] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      api.get<ApiInvoice[]>("/api/invoices"),
      api.get<RevenueDataPoint[]>("/api/invoices/revenue"),
      api.get<ApiJob[]>("/api/jobs"),
    ])
      .then(([inv, rev, j]) => {
        setInvoices(inv)
        setRevenueData(rev)
        setJobs(j)
      })
      .catch((e) => console.error("Failed to load revenue:", e))
      .finally(() => setLoading(false))
  }, [])

  const totalRevenue = invoices.reduce((acc, inv) => acc + inv.amount, 0)
  const paidRevenue = invoices.filter((i) => i.status === "paid").reduce((acc, i) => acc + i.amount, 0)
  const pendingRevenue = invoices.filter((i) => i.status === "pending").reduce((acc, i) => acc + i.amount, 0)
  const overdueRevenue = invoices.filter((i) => i.status === "overdue").reduce((acc, i) => acc + i.amount, 0)

  // Build equipment type breakdown from real jobs
  const equipmentCounts: Record<string, number> = {}
  jobs.forEach((j) => {
    const t = j.equipmentType ?? "other"
    equipmentCounts[t] = (equipmentCounts[t] || 0) + 1
  })
  const jobTypeData = Object.entries(equipmentCounts).map(([name, value]) => ({
    name: name.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()),
    value,
  }))

  async function handleDownloadPdf(invoiceId: string) {
    setDownloadingId(invoiceId)
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/pdf`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("flowsense_token")}` },
      })
      if (!res.ok) { toast.error("Failed to generate PDF"); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `invoice-${invoiceId.slice(-8)}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 100)
    } catch {
      toast.error("Failed to download PDF")
    } finally {
      setDownloadingId(null)
    }
  }

  async function handleSendInvoice(invoiceId: string) {
    setSendingId(invoiceId)
    try {
      await api.post(`/api/invoices/${invoiceId}/send`, {})
      toast.success("Invoice sent to customer")
    } catch (e) {
      const msg = (e as { message?: string }).message ?? ""
      toast.error(msg.includes("no email") ? "Customer has no email address" : "Failed to send invoice")
    } finally {
      setSendingId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Loading revenue data...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Revenue & Reporting</h1>
        <p className="mt-1 text-sm text-muted-foreground">Financial overview and performance metrics</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-border bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Total Billed</CardTitle>
            <DollarSign className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-card-foreground">${totalRevenue.toLocaleString()}</div>
            <p className="mt-1 text-xs text-muted-foreground">{invoices.length} invoices</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Collected</CardTitle>
            <TrendingUp className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-card-foreground">${paidRevenue.toLocaleString()}</div>
            <p className="mt-1 text-xs text-success">{totalRevenue > 0 ? `${((paidRevenue / totalRevenue) * 100).toFixed(0)}% collection rate` : "No invoices"}</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Pending</CardTitle>
            <FileText className="h-4 w-4 text-accent" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-card-foreground">${pendingRevenue.toLocaleString()}</div>
            <p className="mt-1 text-xs text-muted-foreground">{invoices.filter((i) => i.status === "pending").length} invoices</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Overdue</CardTitle>
            <AlertCircle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-card-foreground">${overdueRevenue.toLocaleString()}</div>
            <p className="mt-1 text-xs text-destructive">{overdueRevenue > 0 ? "Requires attention" : "All clear"}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="border-border bg-card lg:col-span-3">
          <CardHeader><CardTitle className="text-sm font-mono uppercase tracking-wider text-muted-foreground">Monthly Revenue Trend</CardTitle></CardHeader>
          <CardContent>
            <div className="h-72">
              {revenueData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={revenueData}>
                    <defs>
                      <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="oklch(0.55 0.18 260)" stopOpacity={0.28} />
                        <stop offset="95%" stopColor="oklch(0.55 0.18 260)" stopOpacity={0.01} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.90 0.005 250)" vertical={false} />
                    <XAxis dataKey="month" stroke="oklch(0.60 0.01 250)" fontSize={11} fontFamily="monospace" tickLine={false} axisLine={false} />
                    <YAxis stroke="oklch(0.60 0.01 250)" fontSize={11} fontFamily="monospace" tickLine={false} axisLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                    <Tooltip contentStyle={{ backgroundColor: "oklch(1 0 0)", border: "1px solid oklch(0.90 0.005 250)", borderRadius: "8px", fontSize: "12px", fontFamily: "monospace", color: "oklch(0.20 0.02 250)", boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }} formatter={(value: number | undefined) => [`$${(value ?? 0).toLocaleString()}`, "Revenue"]} />
                    <Area type="monotone" dataKey="revenue" stroke="oklch(0.55 0.18 260)" strokeWidth={2.5} fill="url(#revenueGrad)" dot={false} activeDot={{ r: 5, strokeWidth: 0, fill: "oklch(0.55 0.18 260)" }} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-sm text-muted-foreground">No revenue data yet</div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card lg:col-span-2">
          <CardHeader><CardTitle className="text-sm font-mono uppercase tracking-wider text-muted-foreground">Jobs by Equipment Type</CardTitle></CardHeader>
          <CardContent>
            <div className="h-72">
              {jobTypeData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={jobTypeData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={4} dataKey="value" stroke="none">
                      {jobTypeData.map((_, index) => (<Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />))}
                    </Pie>
                    <Legend verticalAlign="bottom" iconType="circle" iconSize={8} formatter={(value) => (<span style={{ color: "oklch(0.50 0.01 250)", fontSize: "11px", fontFamily: "monospace" }}>{value}</span>)} />
                    <Tooltip contentStyle={{ backgroundColor: "oklch(1 0 0)", border: "1px solid oklch(0.90 0.005 250)", borderRadius: "8px", fontSize: "12px", fontFamily: "monospace", color: "oklch(0.20 0.02 250)", boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-sm text-muted-foreground">No jobs yet</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border bg-card">
        <CardHeader><CardTitle className="text-sm font-mono uppercase tracking-wider text-muted-foreground">Jobs Completed per Month</CardTitle></CardHeader>
        <CardContent>
          <div className="h-56">
            {revenueData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={revenueData}>
                  <defs>
                    <linearGradient id="jobsGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="oklch(0.70 0.16 55)" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="oklch(0.70 0.16 55)" stopOpacity={0.01} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.90 0.005 250)" vertical={false} />
                  <XAxis dataKey="month" stroke="oklch(0.60 0.01 250)" fontSize={11} fontFamily="monospace" tickLine={false} axisLine={false} />
                  <YAxis stroke="oklch(0.60 0.01 250)" fontSize={11} fontFamily="monospace" tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: "oklch(1 0 0)", border: "1px solid oklch(0.90 0.005 250)", borderRadius: "8px", fontSize: "12px", fontFamily: "monospace", color: "oklch(0.20 0.02 250)", boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }} />
                  <Area type="monotone" dataKey="jobs" stroke="oklch(0.70 0.16 55)" strokeWidth={2.5} fill="url(#jobsGrad)" dot={false} activeDot={{ r: 5, strokeWidth: 0, fill: "oklch(0.70 0.16 55)" }} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-sm text-muted-foreground">No data yet</div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="border-border bg-card">
        <CardHeader><CardTitle className="text-sm font-mono uppercase tracking-wider text-muted-foreground">Recent Invoices</CardTitle></CardHeader>
        <CardContent>
          {invoices.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="pb-3 text-left text-xs font-mono uppercase tracking-wider text-muted-foreground">Invoice</th>
                    <th className="pb-3 text-left text-xs font-mono uppercase tracking-wider text-muted-foreground">Customer</th>
                    <th className="pb-3 text-left text-xs font-mono uppercase tracking-wider text-muted-foreground">Description</th>
                    <th className="pb-3 text-right text-xs font-mono uppercase tracking-wider text-muted-foreground">Amount</th>
                    <th className="pb-3 text-right text-xs font-mono uppercase tracking-wider text-muted-foreground">Status</th>
                    <th className="pb-3 text-right text-xs font-mono uppercase tracking-wider text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr key={inv.id} className="border-b border-border/50">
                      <td className="py-3 font-mono text-xs text-primary">{inv.id.slice(0, 12)}...</td>
                      <td className="py-3 text-card-foreground">{inv.customer.name}</td>
                      <td className="py-3 text-muted-foreground max-w-xs truncate">{inv.description}</td>
                      <td className="py-3 text-right font-mono text-card-foreground">${inv.amount.toLocaleString()}</td>
                      <td className="py-3 text-right">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider ${inv.status === "paid" ? "bg-success/15 text-success" : inv.status === "pending" ? "bg-accent/15 text-accent" : "bg-destructive/15 text-destructive"}`}>
                          {inv.status}
                        </span>
                      </td>
                      <td className="py-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleDownloadPdf(inv.id)}
                            disabled={downloadingId === inv.id || sendingId === inv.id}
                            className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-50"
                            title="Download PDF"
                          >
                            {downloadingId === inv.id
                              ? <Loader2 className="h-4 w-4 animate-spin" />
                              : <FileDown className="h-4 w-4" />}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSendInvoice(inv.id)}
                            disabled={sendingId === inv.id || downloadingId === inv.id}
                            className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-50"
                            title="Send to customer"
                          >
                            {sendingId === inv.id
                              ? <Loader2 className="h-4 w-4 animate-spin" />
                              : <Send className="h-4 w-4" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <FileText className="h-6 w-6 text-muted-foreground/50" />
              <p className="mt-2 text-sm text-muted-foreground">No invoices yet</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
