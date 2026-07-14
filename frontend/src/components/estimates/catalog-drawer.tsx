import { useState, useEffect } from "react"
import { api } from "@/api/client"
import { PricebookItem } from "@/api/types"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Sparkles } from "lucide-react"

interface Props {
  open: boolean
  onClose: () => void
  onSelect: (item: PricebookItem) => void
}

export function CatalogDrawer({ open, onClose, onSelect }: Props) {
  const [items, setItems] = useState<PricebookItem[]>([])
  const [search, setSearch] = useState("")

  useEffect(() => {
    if (open) {
      api.get<PricebookItem[]>("/api/pricebook").then(setItems).catch(() => {})
    }
  }, [open])

  const filtered = items.filter((item) =>
    item.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="bottom" className="h-[80vh]">
        <SheetHeader>
          <SheetTitle>Add from Catalog</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-3">
          <Input
            placeholder="Search catalog…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
          <div className="overflow-y-auto max-h-[calc(80vh-120px)] space-y-1">
            {filtered.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  onSelect(item)
                  onClose()
                }}
                className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-muted/60 flex items-center justify-between"
              >
                <div>
                  <div className="text-sm font-medium">{item.name}</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    {item.source === "ai" && (
                      <Badge variant="secondary" className="text-xs gap-1 py-0">
                        <Sparkles className="h-2.5 w-2.5" /> AI suggested
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground capitalize">{item.category}</span>
                  </div>
                </div>
                <span className="text-sm font-semibold">${item.unitPrice.toFixed(0)}</span>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-8">No items found</p>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
