import { useEffect, useState } from "react"
import { PricebookItem } from "@/api/types"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface Props {
  open: boolean
  item?: PricebookItem | null
  onSave: (data: Partial<PricebookItem>) => void
  onClose: () => void
}

const CATEGORIES = ["cooling", "heating", "parts", "labor", "maintenance"] as const

export function PricebookItemDialog({ open, item, onSave, onClose }: Props) {
  const [form, setForm] = useState({
    name: "",
    description: "",
    category: "cooling" as PricebookItem["category"],
    unit: "",
    unitPrice: "",
  })

  useEffect(() => {
    if (item) {
      setForm({
        name: item.name,
        description: item.description ?? "",
        category: item.category,
        unit: item.unit ?? "",
        unitPrice: String(item.unitPrice),
      })
    } else {
      setForm({ name: "", description: "", category: "cooling", unit: "", unitPrice: "" })
    }
  }, [item, open])

  function handleSave() {
    onSave({
      name: form.name,
      description: form.description || undefined,
      category: form.category,
      unit: form.unit || undefined,
      unitPrice: parseFloat(form.unitPrice),
    })
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{item ? "Edit Item" : "Add Item"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <Label>Name</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div className="grid gap-1.5">
            <Label>
              Description{" "}
              <span className="text-muted-foreground text-xs">(optional)</span>
            </Label>
            <Input
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Category</Label>
              <Select
                value={form.category}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, category: v as PricebookItem["category"] }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c.charAt(0).toUpperCase() + c.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>
                Unit <span className="text-muted-foreground text-xs">(optional)</span>
              </Label>
              <Input
                placeholder="e.g. per lb, each"
                value={form.unit}
                onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>Unit Price ($)</Label>
            <Input
              type="number"
              min="0"
              step="1"
              value={form.unitPrice}
              onChange={(e) => setForm((f) => ({ ...f, unitPrice: e.target.value }))}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!form.name || !form.unitPrice}>
            {item ? "Save Changes" : "Add Item"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
