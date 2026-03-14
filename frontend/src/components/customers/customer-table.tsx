"use client"

import { useState } from "react"
import type { ApiCustomer } from "@/api/types"
import { Input } from "@/components/ui/input"
import {
  Search,
  Mail,
  Phone,
  MapPin,
  ChevronDown,
  ChevronUp,
  Loader2,
  User,
} from "lucide-react"

interface CustomerTableProps {
  customers: ApiCustomer[]
  loading?: boolean
}

export function CustomerTable({ customers, loading }: CustomerTableProps) {
  const [search, setSearch] = useState("")
  const [expandedCustomer, setExpandedCustomer] = useState<string | null>(null)

  const filtered = customers.filter((c) => {
    if (search === "") return true
    const q = search.toLowerCase()
    return (
      c.name.toLowerCase().includes(q) ||
      (c.email ?? "").toLowerCase().includes(q) ||
      c.phone.includes(q) ||
      c.address.toLowerCase().includes(q)
    )
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Loading customers...</span>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-xs text-muted-foreground font-mono">
          {filtered.length} customer{filtered.length !== 1 ? "s" : ""}
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search customers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 bg-secondary pl-9 text-sm border-border placeholder:text-muted-foreground"
          />
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card">
        <div className="hidden border-b border-border px-5 py-3 sm:grid sm:grid-cols-12 sm:gap-4">
          <span className="col-span-3 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Customer</span>
          <span className="col-span-3 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Contact</span>
          <span className="col-span-4 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Address</span>
          <span className="col-span-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground text-right">Joined</span>
        </div>

        <div className="divide-y divide-border">
          {filtered.map((customer) => {
            const isExpanded = expandedCustomer === customer.id
            const fullAddress = [customer.address, customer.addressLine2, `${customer.city}, ${customer.state} ${customer.postalCode}`].filter(Boolean).join(", ")
            return (
              <div key={customer.id}>
                <div
                  className="cursor-pointer px-5 py-3.5 transition-colors hover:bg-secondary/50 sm:grid sm:grid-cols-12 sm:items-center sm:gap-4"
                  onClick={() => setExpandedCustomer(isExpanded ? null : customer.id)}
                >
                  <div className="col-span-3">
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary">
                        <User className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="text-sm font-medium text-card-foreground">{customer.name}</div>
                    </div>
                  </div>
                  <div className="col-span-3 hidden sm:block">
                    <div className="truncate text-xs text-muted-foreground">{customer.email ?? "—"}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{customer.phone}</div>
                  </div>
                  <div className="col-span-4 hidden sm:block">
                    <div className="truncate text-xs text-card-foreground">{fullAddress}</div>
                  </div>
                  <div className="col-span-2 hidden sm:flex sm:items-center sm:justify-end sm:gap-2">
                    <span className="font-mono text-xs text-muted-foreground">
                      {new Date(customer.createdAt).toLocaleDateString()}
                    </span>
                    {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-border bg-secondary/30 px-5 py-4">
                    <div className="grid gap-4 sm:grid-cols-3">
                      <div className="flex items-center gap-2 text-xs">
                        <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-card-foreground">{customer.email ?? "No email"}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-card-foreground">{customer.phone}</span>
                      </div>
                      <div className="flex items-start gap-2 text-xs">
                        <MapPin className="mt-0.5 h-3.5 w-3.5 text-primary" />
                        <span className="text-card-foreground">{fullAddress}</span>
                      </div>
                      {customer.notes && (
                        <div className="sm:col-span-3 text-xs text-muted-foreground">
                          <span className="font-mono text-[10px] uppercase tracking-wider">Notes:</span>{" "}
                          <span className="text-card-foreground">{customer.notes}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}

          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Search className="h-8 w-8 text-muted-foreground/50" />
              <p className="mt-3 text-sm text-muted-foreground">No customers found matching your criteria</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
