import { useState, useEffect } from "react"
import { api } from "@/api/client"
import type { ComplianceLog } from "@/api/types"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { CheckCircle2, Loader2, ShieldCheck } from "lucide-react"
import { toast } from "sonner"

interface Props {
  jobId: string
  equipmentType: string | null
  onLogged: () => void
}

const EPA_EQUIPMENT = ["ac", "heat-pump", "mini-split"]

const SAFETY_ITEMS = [
  "PPE worn",
  "Work area secured",
  "Lockout/tagout followed",
]

const CERT_LEVELS = [
  { value: "type1", label: "Type I" },
  { value: "type2", label: "Type II" },
  { value: "universal", label: "Universal" },
]

const REFRIGERANT_TYPES = ["R-22", "R-410A", "R-32", "R-134a", "Other"]

export function ComplianceForm({ jobId, equipmentType, onLogged }: Props) {
  const [loading, setLoading] = useState(true)
  const [alreadyLogged, setAlreadyLogged] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // EPA 608 fields
  const [certLevel, setCertLevel] = useState("")
  const [refrigerantType, setRefrigerantType] = useState("")
  const [lbsRecovered, setLbsRecovered] = useState("")
  const [lbsCharged, setLbsCharged] = useState("")

  // Safety ACK
  const [safetyChecked, setSafetyChecked] = useState<Record<string, boolean>>(
    Object.fromEntries(SAFETY_ITEMS.map((item) => [item, false]))
  )

  const showEpa = EPA_EQUIPMENT.includes(equipmentType ?? "")
  const allSafetyChecked = SAFETY_ITEMS.every((item) => safetyChecked[item])

  useEffect(() => {
    api.get<ComplianceLog[]>(`/api/compliance/job/${jobId}`)
      .then((logs) => {
        // safety_ack present = fully logged
        if (logs.some((l) => l.type === "safety_ack")) {
          setAlreadyLogged(true)
          onLogged()
        }
      })
      .catch(() => {}) // non-blocking — form still renders on error
      .finally(() => setLoading(false))
  }, [jobId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      const posts: Promise<unknown>[] = []

      // EPA 608 — only post if all four fields are filled
      if (showEpa && certLevel && refrigerantType && lbsRecovered && lbsCharged) {
        posts.push(
          api.post("/api/compliance", {
            jobId,
            type: "epa608_prompt",
            payload: {
              certLevel,
              refrigerantType,
              lbsRecovered: parseFloat(lbsRecovered),
              lbsCharged: parseFloat(lbsCharged),
            },
          })
        )
      }

      // Safety ACK — always post
      posts.push(
        api.post("/api/compliance", {
          jobId,
          type: "safety_ack",
          payload: { items: SAFETY_ITEMS.filter((item) => safetyChecked[item]) },
        })
      )

      await Promise.all(posts)
      setAlreadyLogged(true)
      onLogged()
    } catch {
      toast.error("Failed to submit compliance log. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return null

  if (alreadyLogged) {
    return (
      <div className="mx-3 mb-3 flex items-center gap-2 rounded-lg border border-border bg-muted px-3 py-2 text-xs">
        <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
        <span className="font-medium text-foreground">Compliance logged</span>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="mx-3 mb-3 rounded-lg border border-border bg-muted p-3 space-y-4">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-foreground">
        <ShieldCheck className="h-4 w-4" />
        Compliance Log
      </div>

      {showEpa && (
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">EPA 608 (optional)</div>
          <div className="grid grid-cols-2 gap-2">
            <Select value={certLevel} onValueChange={setCertLevel}>
              <SelectTrigger className="text-xs h-8"><SelectValue placeholder="Cert level" /></SelectTrigger>
              <SelectContent>
                {CERT_LEVELS.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={refrigerantType} onValueChange={setRefrigerantType}>
              <SelectTrigger className="text-xs h-8"><SelectValue placeholder="Refrigerant" /></SelectTrigger>
              <SelectContent>
                {REFRIGERANT_TYPES.map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              className="text-xs h-8" type="number" step="0.1" min="0"
              placeholder="Lbs recovered" value={lbsRecovered}
              onChange={(e) => setLbsRecovered(e.target.value)}
            />
            <Input
              className="text-xs h-8" type="number" step="0.1" min="0"
              placeholder="Lbs charged" value={lbsCharged}
              onChange={(e) => setLbsCharged(e.target.value)}
            />
          </div>
        </div>
      )}

      <div className="space-y-2">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Safety ACK (required)</div>
        {SAFETY_ITEMS.map((item) => (
          <div key={item} className="flex items-center gap-2">
            <Checkbox
              id={`safety-${item}`}
              checked={safetyChecked[item]}
              onCheckedChange={(checked) =>
                setSafetyChecked((prev) => ({ ...prev, [item]: !!checked }))
              }
            />
            <label htmlFor={`safety-${item}`} className="text-xs text-foreground cursor-pointer">{item}</label>
          </div>
        ))}
      </div>

      <Button
        type="submit"
        size="sm"
        className="w-full text-xs"
        disabled={!allSafetyChecked || submitting}
      >
        {submitting && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
        Submit compliance log
      </Button>
    </form>
  )
}
