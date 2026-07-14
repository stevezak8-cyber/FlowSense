import { useState } from "react"
import { PricebookItem } from "@/api/types"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Lock, Sparkles, Pencil, Trash2 } from "lucide-react"

const CATEGORIES = ["All", "cooling", "heating", "parts", "labor", "maintenance"] as const

interface Props {
  items: PricebookItem[]
  onEdit: (item: PricebookItem) => void
  onDelete: (id: string) => void
  onToggleLock: (id: string, locked: boolean) => void
  onRefresh: () => void
}

export function PricebookTable({ items, onEdit, onDelete, onToggleLock }: Props) {
  const [search, setSearch] = useState("")
  const [activeCategory, setActiveCategory] = useState<string>("All")

  const filtered = items.filter((item) => {
    const matchesSearch = item.name.toLowerCase().includes(search.toLowerCase())
    const matchesCategory = activeCategory === "All" || item.category === activeCategory
    return matchesSearch && matchesCategory
  })

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
        <Input
          placeholder="Search services…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs h-8"
        />
        <span className="text-xs text-muted-foreground">{items.length} items</span>
      </div>

      <div className="flex border-b overflow-x-auto">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-4 py-2 text-sm whitespace-nowrap border-b-2 transition-colors ${
              activeCategory === cat
                ? "border-primary text-primary font-medium"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {cat.charAt(0).toUpperCase() + cat.slice(1)}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/20 text-xs text-muted-foreground uppercase tracking-wide">
              <th className="text-left px-4 py-3">Service / Part</th>
              <th className="text-left px-3 py-3">Category</th>
              <th className="text-right px-3 py-3">Unit Price</th>
              <th className="text-center px-3 py-3">Locked</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((item) => (
              <tr
                key={item.id}
                className={`border-t ${item.locked ? "bg-amber-50 dark:bg-amber-950/20" : ""}`}
              >
                <td className="px-4 py-3">
                  <div className="font-medium">{item.name}</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    {item.source === "ai" && (
                      <Badge variant="secondary" className="text-xs gap-1 py-0">
                        <Sparkles className="h-2.5 w-2.5" /> AI suggested
                      </Badge>
                    )}
                    {item.unit && (
                      <span className="text-xs text-muted-foreground">{item.unit}</span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-3 text-muted-foreground capitalize">{item.category}</td>
                <td className="px-3 py-3 text-right font-medium">${item.unitPrice.toFixed(0)}</td>
                <td className="px-3 py-3 text-center">
                  <Switch
                    checked={item.locked}
                    onCheckedChange={(checked) => onToggleLock(item.id, checked)}
                    className="data-[state=checked]:bg-amber-500"
                  />
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2 justify-end">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(item)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      onClick={() => onDelete(item.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  No items found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="px-4 py-2 border-t bg-muted/10 text-xs text-muted-foreground flex gap-4 flex-wrap">
        <span className="flex items-center gap-1">
          <Sparkles className="h-3 w-3" /> AI suggested = seeded on signup, admin can edit
        </span>
        <span className="flex items-center gap-1">
          <Lock className="h-3 w-3" /> Locked = techs cannot modify this line item on estimates
        </span>
      </div>
    </div>
  )
}
