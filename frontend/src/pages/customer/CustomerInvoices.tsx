"use client"

import { useState, useEffect } from "react"
import { api } from "@/api/client"
import type { ApiInvoice } from "@/api/types"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DollarSign, FileText, CreditCard, CheckCircle2, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

export default function CustomerInvoices() {
  const [invoices, setInvoices] = useState<ApiInvoice[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get<ApiInvoice[]>("/api/invoices")
      .then(setInvoices)
      .catch((e) => console.error("Failed to load invoices:", e))
      .finally(() => setLoading(false))
  }, [])

  const totalOwed = invoices
    .filter((i) => i.status === "pending" || i.status === "overdue")
    .reduce((acc, i) => acc + i.amount, 0)
  const totalPaid = invoices
    .filter((i) => i.status === "paid")
    .reduce((acc, i) => acc + i.amount, 0)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Loading invoices...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Invoices</h1>
        <p className="text-sm text-muted-foreground">View and manage your billing</p>
      </div>

      {/* Summary */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="border-border bg-card">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/15">
              <DollarSign className="h-5 w-5 text-accent" />
            </div>
            <div>
              <div className="text-2xl font-bold text-card-foreground">${totalOwed.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">Outstanding Balance</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/15">
              <CheckCircle2 className="h-5 w-5 text-success" />
            </div>
            <div>
              <div className="text-2xl font-bold text-card-foreground">${totalPaid.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">Total Paid</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Invoice List */}
      <div className="space-y-3">
        {invoices.map((inv) => (
          <Card key={inv.id} className="border-border bg-card">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-lg",
                      inv.status === "paid"
                        ? "bg-success/15"
                        : inv.status === "overdue"
                          ? "bg-destructive/15"
                          : "bg-accent/15"
                    )}
                  >
                    <FileText
                      className={cn(
                        "h-5 w-5",
                        inv.status === "paid"
                          ? "text-success"
                          : inv.status === "overdue"
                            ? "text-destructive"
                            : "text-accent"
                      )}
                    />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-card-foreground">{inv.description}</h3>
                    <div className="mt-0.5 flex items-center gap-2">
                      <span className="font-mono text-[10px] text-muted-foreground">{inv.id.slice(0, 12)}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(inv.issuedDate).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold font-mono text-card-foreground">${inv.amount.toLocaleString()}</div>
                  <Badge
                    variant="outline"
                    className={cn(
                      "mt-1 rounded-sm px-2 py-0 text-[9px] font-mono uppercase border",
                      inv.status === "paid"
                        ? "bg-success/15 text-success border-success/30"
                        : inv.status === "overdue"
                          ? "bg-destructive/15 text-destructive border-destructive/30"
                          : "bg-accent/15 text-accent border-accent/30"
                    )}
                  >
                    {inv.status}
                  </Badge>
                </div>
              </div>
              {(inv.status === "pending" || inv.status === "overdue") && (
                <div className="mt-3 flex justify-end">
                  <Button size="sm" className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 text-xs">
                    <CreditCard className="h-3.5 w-3.5" />
                    Pay Now
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ))}

        {invoices.length === 0 && (
          <div className="flex flex-col items-center py-12 text-center">
            <FileText className="h-8 w-8 text-muted-foreground/50" />
            <p className="mt-2 text-sm text-muted-foreground">No invoices found</p>
          </div>
        )}
      </div>
    </div>
  )
}
