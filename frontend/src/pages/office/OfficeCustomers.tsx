"use client"

import { useState, useEffect } from "react"
import { useSearchParams } from "react-router-dom"
import { api } from "@/api/client"
import type { ApiCustomer } from "@/api/types"
import { CustomerTable } from "@/components/customers/customer-table"
import { AddCustomerDialog } from "@/components/customers/add-customer-dialog"
import { PageError } from "@/components/page-error"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Users } from "lucide-react"
import { toast } from "sonner"
import { useOnboarding } from "@/components/office/onboarding-context"

export default function OfficeCustomersPage() {
  const [customers, setCustomers] = useState<ApiCustomer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()
  const { triggerRefresh } = useOnboarding()

  function fetchCustomers() {
    setLoading(true)
    setError(null)
    api
      .get<ApiCustomer[]>("/api/customers")
      .then(setCustomers)
      .catch((e: unknown) => setError((e as Error).message ?? "Failed to load"))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchCustomers() }, [])

  useEffect(() => {
    if (searchParams.get("open") === "add-customer") {
      setDialogOpen(true)
      setSearchParams((prev) => { prev.delete("open"); return prev })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleDelete(id: string) {
    try {
      await api.delete(`/api/customers/${id}`)
      setCustomers((prev) => prev.filter((c) => c.id !== id))
      toast.success("Customer deleted")
    } catch (e: unknown) {
      const msg = (e as { message?: string })?.message ?? ""
      if (msg.includes("jobs or invoices")) {
        toast.error("This customer has existing jobs or invoices and cannot be deleted.")
      } else {
        toast.error("Failed to delete customer. Please try again.")
      }
    }
  }

  if (error) return <PageError message={error} onRetry={fetchCustomers} />

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Customer Database</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage customer records, service history, and contact info</p>
        </div>
        <AddCustomerDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          onCreated={(cust) => {
            setCustomers((prev) => [cust, ...prev])
            triggerRefresh()
          }}
        />
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

      {!loading && customers.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Users className="mb-4 h-12 w-12 text-muted-foreground/40" />
          <h3 className="text-lg font-medium text-foreground">No customers yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Add your first customer to create jobs.
          </p>
          <button
            onClick={() => setDialogOpen(true)}
            className="mt-6 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700"
          >
            Add Customer
          </button>
        </div>
      )}

      <CustomerTable customers={customers} loading={loading} onDelete={handleDelete} />
    </div>
  )
}
