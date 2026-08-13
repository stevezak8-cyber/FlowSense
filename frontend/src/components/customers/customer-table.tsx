"use client"

import { useState, useEffect, useCallback } from "react"
import { api } from "@/api/client"
import type { ApiCustomer, Equipment, RecurringJob } from "@/api/types"
import { RecurringJobCard } from "@/components/recurring-jobs/RecurringJobCard"
import { RecurringJobFormDialog } from "@/components/recurring-jobs/RecurringJobFormDialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { InviteDialog } from "@/components/invite-dialog"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { EquipmentCard } from "@/components/equipment/EquipmentCard"
import { EquipmentFormDialog } from "@/components/equipment/EquipmentFormDialog"
import {
  Search,
  Mail,
  Phone,
  MapPin,
  ChevronDown,
  ChevronUp,
  Loader2,
  User,
  Trash2,
  Plus,
} from "lucide-react"

interface CustomerTableProps {
  customers: ApiCustomer[]
  loading?: boolean
  onDelete?: (id: string) => void
}

export function CustomerTable({ customers, loading, onDelete }: CustomerTableProps) {
  const [search, setSearch] = useState("")
  const [expandedCustomer, setExpandedCustomer] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [equipment, setEquipment] = useState<Equipment[]>([])
  const [equipmentLoading, setEquipmentLoading] = useState(false)
  const [addEquipmentOpen, setAddEquipmentOpen] = useState(false)
  const [recurringJobs, setRecurringJobs] = useState<RecurringJob[]>([])
  const [recurringFormOpen, setRecurringFormOpen] = useState(false)
  const [editingRecurring, setEditingRecurring] = useState<RecurringJob | null>(null)

  useEffect(() => {
    if (!expandedCustomer) { setEquipment([]); return }
    setEquipmentLoading(true)
    api
      .get<Equipment[]>(`/api/equipment?customerId=${expandedCustomer}`)
      .then(setEquipment)
      .catch(() => setEquipment([]))
      .finally(() => setEquipmentLoading(false))
  }, [expandedCustomer])

  const fetchRecurring = useCallback(async () => {
    if (!expandedCustomer) return
    const data = await api.get<RecurringJob[]>(`/api/recurring-jobs?customerId=${expandedCustomer}`)
    setRecurringJobs(data)
  }, [expandedCustomer])

  useEffect(() => {
    if (!expandedCustomer) { setRecurringJobs([]); return }
    fetchRecurring()
  }, [fetchRecurring, expandedCustomer])

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
                    {/* Equipment section */}
                    <div className="mt-4 border-t border-border pt-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Equipment</span>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 gap-1 text-xs"
                          onClick={(e) => { e.stopPropagation(); setAddEquipmentOpen(true) }}
                        >
                          <Plus className="h-3 w-3" />
                          Add Equipment
                        </Button>
                      </div>
                      {equipmentLoading ? (
                        <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Loading equipment...
                        </div>
                      ) : equipment.length === 0 ? (
                        <p className="text-xs text-muted-foreground py-1">No equipment on file for this customer.</p>
                      ) : (
                        <div className="grid gap-3 sm:grid-cols-2">
                          {equipment.map((eq) => (
                            <EquipmentCard
                              key={eq.id}
                              equipment={eq}
                              onUpdated={(updated) => setEquipment((prev) => prev.map((e) => e.id === updated.id ? updated : e))}
                              onDeleted={(id) => setEquipment((prev) => prev.filter((e) => e.id !== id))}
                            />
                          ))}
                        </div>
                      )}
                      {expandedCustomer && (
                        <EquipmentFormDialog
                          open={addEquipmentOpen}
                          onOpenChange={setAddEquipmentOpen}
                          customerId={expandedCustomer}
                          onSaved={(saved) => setEquipment((prev) => [...prev, saved])}
                        />
                      )}
                    </div>

                    {/* Recurring Jobs section */}
                    <div className="mt-4 border-t border-border pt-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Recurring Jobs</span>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 gap-1 text-xs"
                          onClick={(e) => { e.stopPropagation(); setRecurringFormOpen(true) }}
                        >
                          <Plus className="h-3 w-3" />
                          Add Recurring Job
                        </Button>
                      </div>
                      {recurringJobs.length === 0 ? (
                        <p className="text-xs text-muted-foreground py-1">No recurring schedules.</p>
                      ) : (
                        <div className="space-y-2">
                          {recurringJobs.map((rj) => (
                            <RecurringJobCard
                              key={rj.id}
                              job={rj}
                              onEdit={() => { setEditingRecurring(rj); setRecurringFormOpen(true) }}
                              onDeactivate={async () => {
                                await api.patch(`/api/recurring-jobs/${rj.id}`, { isActive: !rj.isActive })
                                fetchRecurring()
                              }}
                              onDelete={async () => {
                                await api.delete(`/api/recurring-jobs/${rj.id}`)
                                fetchRecurring()
                              }}
                            />
                          ))}
                        </div>
                      )}
                      {recurringFormOpen && expandedCustomer && (
                        <RecurringJobFormDialog
                          customerId={expandedCustomer}
                          customerEquipment={equipment}
                          existing={editingRecurring ?? undefined}
                          onSaved={() => { setRecurringFormOpen(false); setEditingRecurring(null); fetchRecurring() }}
                          onClose={() => { setRecurringFormOpen(false); setEditingRecurring(null) }}
                        />
                      )}
                    </div>

                    <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
                      <InviteDialog
                        email={customer.email ?? ""}
                        role="customer"
                        customerId={customer.id}
                        trigger={
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 gap-1.5 text-xs"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Mail className="h-3.5 w-3.5" />
                            Send invite
                          </Button>
                        }
                      />
                      {onDelete && (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 gap-1.5 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                            disabled={deleting === customer.id}
                            onClick={(e) => {
                              e.stopPropagation()
                              setPendingDeleteId(customer.id)
                            }}
                          >
                            {deleting === customer.id
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : <Trash2 className="h-3.5 w-3.5" />}
                            Delete
                          </Button>
                          <ConfirmDialog
                            open={pendingDeleteId === customer.id}
                            onOpenChange={(open) => { if (!open) setPendingDeleteId(null) }}
                            title={`Delete ${customer.name}?`}
                            description="This will permanently remove the customer and all associated data. This cannot be undone."
                            confirmLabel="Delete"
                            onConfirm={() => {
                              setDeleting(customer.id)
                              setPendingDeleteId(null)
                              onDelete(customer.id)
                            }}
                          />
                        </>
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
