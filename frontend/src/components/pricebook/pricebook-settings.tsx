import { useState, useEffect } from "react"
import { api } from "@/api/client"
import { PricebookItem, ApiOrganization } from "@/api/types"
import { PricebookTable } from "./pricebook-table"
import { PricebookItemDialog } from "./pricebook-item-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Plus } from "lucide-react"
import { toast } from "sonner"

export function PricebookSettings() {
  const [items, setItems] = useState<PricebookItem[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<PricebookItem | null>(null)
  const [depositThreshold, setDepositThreshold] = useState("500")
  const [depositPercent, setDepositPercent] = useState("25")

  async function loadItems() {
    try {
      const data = await api.get<PricebookItem[]>("/api/pricebook")
      setItems(data)
    } catch {
      toast.error("Failed to load pricebook")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadItems()
    api.get<ApiOrganization>("/api/organizations/me").then((org) => {
      const o = org as any
      if (o.estimateDepositThreshold != null) setDepositThreshold(String(o.estimateDepositThreshold))
      if (o.estimateDepositPercent != null) setDepositPercent(String(o.estimateDepositPercent))
    }).catch(() => {})
  }, [])

  async function handleSave(data: Partial<PricebookItem>) {
    try {
      if (editingItem) {
        await api.patch(`/api/pricebook/${editingItem.id}`, data)
        toast.success("Item updated")
      } else {
        await api.post("/api/pricebook", data)
        toast.success("Item added")
      }
      setDialogOpen(false)
      setEditingItem(null)
      loadItems()
    } catch {
      toast.error("Failed to save item")
    }
  }

  async function handleDelete(id: string) {
    try {
      await api.delete(`/api/pricebook/${id}`)
      toast.success("Item removed")
      loadItems()
    } catch {
      toast.error("Failed to remove item")
    }
  }

  async function handleToggleLock(id: string, locked: boolean) {
    try {
      await api.patch(`/api/pricebook/${id}`, { locked })
      loadItems()
    } catch {
      toast.error("Failed to update lock")
    }
  }

  async function handleSaveDepositSettings() {
    try {
      await api.patch("/api/organizations/me", {
        estimateDepositThreshold: parseFloat(depositThreshold),
        estimateDepositPercent: parseInt(depositPercent, 10),
      })
      toast.success("Deposit settings saved")
    } catch {
      toast.error("Failed to save deposit settings")
    }
  }

  if (loading) {
    return (
      <div className="py-8 text-center text-muted-foreground">Loading pricebook…</div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Pricebook</h3>
          <p className="text-sm text-muted-foreground">
            Manage your service catalog. Used by AI to generate estimates.
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setEditingItem(null)
            setDialogOpen(true)
          }}
        >
          <Plus className="h-4 w-4 mr-1" /> Add Item
        </Button>
      </div>

      <PricebookTable
        items={items}
        onEdit={(item) => {
          setEditingItem(item)
          setDialogOpen(true)
        }}
        onDelete={handleDelete}
        onToggleLock={handleToggleLock}
        onRefresh={loadItems}
      />

      <div className="border rounded-lg p-4 space-y-4">
        <div>
          <h4 className="font-medium text-sm">Deposit Settings</h4>
          <p className="text-xs text-muted-foreground">
            When an estimate exceeds the threshold, customers are prompted for a deposit.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="grid gap-1.5">
            <Label className="text-xs">Deposit Threshold ($)</Label>
            <Input
              type="number"
              value={depositThreshold}
              onChange={(e) => setDepositThreshold(e.target.value)}
              className="h-8"
            />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Deposit Percent (%)</Label>
            <Input
              type="number"
              value={depositPercent}
              onChange={(e) => setDepositPercent(e.target.value)}
              className="h-8"
            />
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={handleSaveDepositSettings}>
          Save Deposit Settings
        </Button>
      </div>

      <PricebookItemDialog
        open={dialogOpen}
        item={editingItem}
        onSave={handleSave}
        onClose={() => {
          setDialogOpen(false)
          setEditingItem(null)
        }}
      />
    </div>
  )
}
