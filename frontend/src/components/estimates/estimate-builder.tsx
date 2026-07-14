import { useState } from "react"
import { api } from "@/api/client"
import { Estimate, EstimateLine, PricebookItem } from "@/api/types"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { CatalogDrawer } from "./catalog-drawer"
import { Lock, Sparkles, Trash2 } from "lucide-react"
import { toast } from "sonner"

interface Props {
  estimate: Estimate
  jobTitle: string
  jobNotes?: string | null
  onPresent: (estimate: Estimate) => void
  onSend: () => void
}

type Tier = "good" | "better" | "best"

export function EstimateBuilder({ estimate, jobTitle, jobNotes, onPresent, onSend }: Props) {
  const [lines, setLines] = useState<EstimateLine[]>(estimate.lines)
  const [activeTab, setActiveTab] = useState<Tier>("good")
  const [catalogOpen, setCatalogOpen] = useState(false)
  const [sending, setSending] = useState(false)

  const tierLines = (tier: Tier) => lines.filter((l) => l.tier === tier)
  const tierTotal = (tier: Tier) =>
    tierLines(tier).reduce((sum, l) => sum + l.unitPrice * l.quantity, 0)

  function removeLine(id: string) {
    setLines((prev) => prev.filter((l) => l.id !== id))
  }

  function addFromCatalog(item: PricebookItem) {
    const newLine: EstimateLine = {
      id: `temp-${Date.now()}`,
      estimateId: estimate.id,
      pricebookItemId: item.id,
      tier: activeTab,
      name: item.name,
      quantity: 1,
      unitPrice: item.unitPrice,
      locked: item.locked,
      source: "manual",
    }
    setLines((prev) => [...prev, newLine])
  }

  async function saveLines() {
    await api.patch(`/api/estimates/${estimate.id}`, { lines })
  }

  async function handlePresent() {
    try {
      await saveLines()
      onPresent({ ...estimate, lines })
    } catch {
      toast.error("Failed to save estimate")
    }
  }

  async function handleSend() {
    setSending(true)
    try {
      await saveLines()
      await api.post(`/api/estimates/${estimate.id}/send`, {})
      toast.success("Estimate sent to customer")
      onSend()
    } catch {
      toast.error("Failed to send estimate")
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 bg-primary/5 border-b text-sm">
        <strong>{jobTitle}</strong>
        {jobNotes && <span className="text-muted-foreground"> · {jobNotes}</span>}
      </div>

      <div className="px-4 py-2 bg-indigo-50 dark:bg-indigo-950/30 border-b text-sm flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-indigo-500 shrink-0" />
        <span className="text-muted-foreground">
          AI generated this estimate. Review and adjust before presenting.
        </span>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as Tier)}
        className="flex-1 flex flex-col"
      >
        <TabsList className="grid grid-cols-3 rounded-none border-b h-auto">
          {(["good", "better", "best"] as Tier[]).map((tier) => (
            <TabsTrigger key={tier} value={tier} className="capitalize py-3 rounded-none">
              {tier}
              <span className="ml-1.5 text-xs text-muted-foreground">
                ${tierTotal(tier).toFixed(0)}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>

        {(["good", "better", "best"] as Tier[]).map((tier) => (
          <TabsContent
            key={tier}
            value={tier}
            className="flex-1 overflow-y-auto p-4 space-y-2 mt-0"
          >
            {tierLines(tier).map((line) => (
              <div
                key={line.id}
                className="flex items-center justify-between py-2 border-b last:border-0"
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {line.locked && (
                    <Lock className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                  )}
                  {line.source === "ai" && !line.locked && (
                    <Sparkles className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                  )}
                  <span className="text-sm truncate">{line.name}</span>
                </div>
                <div className="flex items-center gap-2 ml-3">
                  <span className="text-sm font-medium">
                    ${(line.unitPrice * line.quantity).toFixed(0)}
                  </span>
                  {!line.locked && (
                    <button
                      onClick={() => removeLine(line.id)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}

            <button
              onClick={() => setCatalogOpen(true)}
              className="w-full mt-2 py-2 border border-dashed rounded-lg text-sm text-muted-foreground hover:bg-muted/40"
            >
              + Add from catalog
            </button>

            <div className="pt-3 flex justify-between font-semibold">
              <span>Total</span>
              <span>${tierTotal(tier).toFixed(0)}</span>
            </div>
          </TabsContent>
        ))}
      </Tabs>

      <div className="px-4 py-3 border-t flex gap-2">
        <Button className="flex-1" onClick={handlePresent}>
          Present to Customer
        </Button>
        <Button variant="outline" onClick={handleSend} disabled={sending}>
          {sending ? "Sending…" : "Send Link"}
        </Button>
      </div>

      <CatalogDrawer
        open={catalogOpen}
        onClose={() => setCatalogOpen(false)}
        onSelect={addFromCatalog}
      />
    </div>
  )
}
