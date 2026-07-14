import { useState } from "react"
import { api } from "@/api/client"
import type { ApiJob } from "@/api/types"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Loader2, Sparkles, RefreshCw, X, Plus, Camera } from "lucide-react"
import { toast } from "sonner"

// Module-level flag: starts true, permanently flipped to false on 503
let aiAvailable = true

interface CompletionDialogProps {
  job: ApiJob
  open: boolean
  onOpenChange: (open: boolean) => void
  onCompleted: (updatedJob: ApiJob) => void
}

export function CompletionDialog({
  job,
  open,
  onOpenChange,
  onCompleted,
}: CompletionDialogProps) {
  const [actionsTaken, setActionsTaken] = useState("")
  const [partsUsed, setPartsUsed] = useState<string[]>([])
  const [partInput, setPartInput] = useState("")
  const [notes, setNotes] = useState("")
  const [summary, setSummary] = useState("")
  const [laborHours, setLaborHours] = useState<number>(1)
  const [photos, setPhotos] = useState<string[]>([])
  const [generating, setGenerating] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [hasGenerated, setHasGenerated] = useState(false)

  function handlePhotoFiles(files: FileList | null) {
    if (!files) return
    Array.from(files).forEach((file) => {
      if (!file.type.startsWith("image/")) return
      const reader = new FileReader()
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string
        if (dataUrl) setPhotos((prev) => [...prev, dataUrl])
      }
      reader.readAsDataURL(file)
    })
  }

  function removePhoto(index: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== index))
  }

  function addPart(part: string) {
    const trimmed = part.trim()
    if (trimmed && !partsUsed.includes(trimmed)) {
      setPartsUsed((prev) => [...prev, trimmed])
    }
    setPartInput("")
  }

  function removePart(part: string) {
    setPartsUsed((prev) => prev.filter((p) => p !== part))
  }

  async function handleGenerate() {
    setGenerating(true)
    try {
      const res = await api.post<{ summary: string }>(
        `/api/jobs/${job.id}/generate-completion-summary`,
        { actionsTaken, partsUsed, notes: notes || undefined }
      )
      setSummary(res.summary)
      setHasGenerated(true)
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Failed to generate summary"
      // Check if this is a 503 (permanent — no API key)
      if (message.includes("not configured")) {
        aiAvailable = false
        toast.error("AI summaries not configured — enter a summary manually")
      } else {
        toast.error(message)
      }
    } finally {
      setGenerating(false)
    }
  }

  async function handleComplete() {
    setSubmitting(true)
    try {
      const updated = await api.patch<ApiJob>(`/api/jobs/${job.id}`, {
        status: "completed",
        summary: summary || undefined,
        actionsTaken,
        partsUsed,
        laborHours,
        photos: photos.length > 0 ? photos : undefined,
      })
      onCompleted(updated)
      onOpenChange(false)
      toast.success("Job completed successfully")
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Failed to complete job"
      )
    } finally {
      setSubmitting(false)
    }
  }

  const canGenerate = actionsTaken.trim().length > 0 && aiAvailable
  const canComplete = actionsTaken.trim().length > 0 && !submitting && !generating

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Complete Job</DialogTitle>
          <DialogDescription>
            Document what was done before marking this job complete.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Actions Taken */}
          <div className="space-y-2">
            <Label htmlFor="actionsTaken">
              Actions Taken <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="actionsTaken"
              placeholder="Describe what you did..."
              value={actionsTaken}
              onChange={(e) => setActionsTaken(e.target.value)}
              className="min-h-20"
            />
          </div>

          {/* Labor Hours */}
          <div className="space-y-2">
            <Label htmlFor="laborHours">
              Labor Hours <span className="text-destructive">*</span>
            </Label>
            <div className="flex items-center gap-3">
              <Input
                id="laborHours"
                type="number"
                min={0.5}
                max={24}
                step={0.5}
                value={laborHours}
                onChange={(e) => setLaborHours(parseFloat(e.target.value) || 1)}
                className="w-28"
              />
              <span className="text-sm text-muted-foreground">
                hrs · est. invoice ${laborHours <= 1 ? "95" : (95 + (laborHours - 1) * 95).toFixed(0)}
              </span>
            </div>
          </div>

          {/* Parts Used */}
          <div className="space-y-2">
            <Label>Parts Used</Label>
            <div className="flex gap-2">
              <Input
                placeholder="Add a part..."
                value={partInput}
                onChange={(e) => setPartInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    addPart(partInput)
                  }
                }}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => addPart(partInput)}
                disabled={!partInput.trim()}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            {/* Suggested parts from pre-arrival */}
            {job.suggestedParts && job.suggestedParts.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                <span className="text-[10px] text-muted-foreground mr-1 self-center">
                  Suggested:
                </span>
                {job.suggestedParts
                  .filter((p) => !partsUsed.includes(p))
                  .map((part) => (
                    <Badge
                      key={part}
                      variant="outline"
                      className="cursor-pointer text-[10px] hover:bg-primary/10"
                      onClick={() => addPart(part)}
                    >
                      + {part}
                    </Badge>
                  ))}
              </div>
            )}

            {/* Added parts */}
            {partsUsed.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {partsUsed.map((part) => (
                  <Badge key={part} variant="secondary" className="gap-1 text-xs">
                    {part}
                    <button
                      type="button"
                      onClick={() => removePart(part)}
                      className="ml-0.5 hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Additional Notes</Label>
            <Textarea
              id="notes"
              placeholder="Additional observations..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {/* Photos */}
          <div className="space-y-2">
            <Label>Job Photos</Label>
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border bg-secondary/30 px-4 py-3 text-sm text-muted-foreground hover:bg-secondary/50 transition-colors">
              <Camera className="h-4 w-4 shrink-0" />
              <span>{photos.length > 0 ? `${photos.length} photo${photos.length > 1 ? "s" : ""} added — tap to add more` : "Tap to add photos (before/after)"}</span>
              <input
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                onChange={(e) => handlePhotoFiles(e.target.files)}
              />
            </label>
            {photos.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {photos.map((src, i) => (
                  <div key={i} className="relative h-16 w-16 overflow-hidden rounded-lg border border-border">
                    <img src={src} alt={`Photo ${i + 1}`} className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removePhoto(i)}
                      className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-black/60 text-white hover:bg-destructive"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* AI Summary Section */}
          {aiAvailable ? (
            <>
              {!hasGenerated ? (
                <Button
                  onClick={handleGenerate}
                  disabled={!canGenerate || generating}
                  className="w-full gap-2"
                >
                  {generating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  Generate Summary
                </Button>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="summary">Summary</Label>
                    <Badge
                      variant="outline"
                      className="rounded-sm px-1 py-0 text-[8px] text-primary/70 border-primary/30"
                    >
                      AI-generated
                    </Badge>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="ml-auto h-6 gap-1 px-2 text-[10px] text-muted-foreground hover:text-primary"
                      onClick={handleGenerate}
                      disabled={generating || !canGenerate}
                    >
                      {generating ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3 w-3" />
                      )}
                      Regenerate
                    </Button>
                  </div>
                  <Textarea
                    id="summary"
                    value={summary}
                    onChange={(e) => setSummary(e.target.value)}
                    className="min-h-20"
                  />
                </div>
              )}
            </>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="summary">Summary</Label>
              <p className="text-xs text-muted-foreground">
                AI summaries not configured — enter a summary manually
              </p>
              <Textarea
                id="summary"
                placeholder="Write a summary of the work performed..."
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                className="min-h-20"
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleComplete} disabled={!canComplete}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Complete Job
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
