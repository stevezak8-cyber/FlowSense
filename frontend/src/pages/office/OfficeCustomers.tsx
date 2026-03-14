"use client"

import { useState, useEffect } from "react"
import { api } from "@/api/client"
import type { ApiCustomer } from "@/api/types"
import { CustomerTable } from "@/components/customers/customer-table"
import { AddCustomerDialog } from "@/components/customers/add-customer-dialog"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Users } from "lucide-react"

export default function OfficeCustomersPage() {
  const [customers, setCustomers] = useState<ApiCustomer[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api
      .get<ApiCustomer[]>("/api/customers")
      .then(setCustomers)
      .catch((e) => console.error("Failed to fetch customers:", e))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Customer Database</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage customer records, service history, and contact info</p>
        </div>
        <AddCustomerDialog onCreated={(cust) => setCustomers((prev) => [cust, ...prev])} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="border-border bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Total Customers</CardTitle>
            <Users className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-card-foreground">{customers.length}</div></CardContent>
        </Card>
      </div>

      <CustomerTable customers={customers} loading={loading} />
    </div>
  )
}
