import { useEffect, useState, useRef } from "react"
import { api } from "@/api/client"
import type { DispatchResult, DispatchSuggestion } from "@/api/types"
import { toast } from "sonner"

interface DispatchSuggestionsProps {
  equipmentType: string | null
  customerAddress: string | null
  scheduledAt: string | null
  customerId: string | null
  priority: string
  selectedTechId: string | null
  onSelect: (technicianId: string | null) => void
  onSkip: () => void
  onError: () => void
}

export function DispatchSuggestions({
  equipmentType,
  customerAddress,
  scheduledAt,
  customerId,
  priority,
  selectedTechId,
  onSelect,
  onSkip,
  onError,
}: DispatchSuggestionsProps) {
  const [result, setResult] = useState<DispatchResult | null>(null)
  const [loading, setLoading] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!equipmentType || !customerId || !customerAddress || !scheduledAt) {
      setResult(null)
      return
    }

    // Debounce API calls
    if (debounceRef.current) clearTimeout(debounceRef.current)

    debounceRef.current = setTimeout(async () => {
      // Abort previous request
      if (abortRef.current) abortRef.current.abort()
      abortRef.current = new AbortController()

      setLoading(true)
      try {
        const data = await api.post<DispatchResult>("/api/dispatch/suggest", {
          equipmentType,
          customerAddress,
          scheduledAt,
          customerId,
          priority,
        })
        setResult(data)
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") return
        toast.error("Failed to load dispatch suggestions")
        onError()
      } finally {
        setLoading(false)
      }
    }, 300)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      if (abortRef.current) abortRef.current.abort()
    }
  }, [equipmentType, customerId, customerAddress, scheduledAt, priority])

  // Idle state
  if (!equipmentType || !customerId) {
    return (
      <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
        Select equipment type and customer to see technician suggestions
      </div>
    )
  }

  // Loading state
  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-16 animate-pulse rounded-lg bg-muted"
          />
        ))}
      </div>
    )
  }

  // Error already handled via onError callback

  // Empty state
  if (result && result.suggestions.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
        No technicians available
      </div>
    )
  }

  if (!result) return null

  return (
    <div className="space-y-2">
      {/* Fallback warning */}
      {result.fallbackMode && (
        <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-sm">
          <span>⚠️</span>
          <div>
            <span className="font-medium text-amber-600">
              No techs with {equipmentType} skills
            </span>
            <span className="text-muted-foreground">
              {" "}— showing all available
            </span>
          </div>
        </div>
      )}

      {/* Degraded mode note */}
      {!result.driveTimesAvailable && !result.fallbackMode && (
        <p className="text-xs text-muted-foreground">
          Drive times unavailable — ranked by workload and history
        </p>
      )}

      {/* Suggestion header */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>ASSIGN TECHNICIAN</span>
        <span>Ranked by skill match, drive time &amp; workload</span>
      </div>

      {/* Suggestion rows */}
      {result.suggestions.map((suggestion, index) => (
        <SuggestionRow
          key={suggestion.technician.id}
          suggestion={suggestion}
          index={index}
          isSelected={selectedTechId === suggestion.technician.id}
          showDriveTime={result.driveTimesAvailable}
          onClick={() => {
            if (selectedTechId === suggestion.technician.id) {
              onSelect(null)
            } else {
              onSelect(suggestion.technician.id)
            }
          }}
        />
      ))}

      {/* Skip link */}
      <div className="text-center">
        <button
          type="button"
          onClick={onSkip}
          className="text-xs text-muted-foreground underline hover:text-foreground"
        >
          Skip suggestions
        </button>
      </div>
    </div>
  )
}

function SuggestionRow({
  suggestion,
  index,
  isSelected,
  showDriveTime,
  onClick,
}: {
  suggestion: DispatchSuggestion
  index: number
  isSelected: boolean
  showDriveTime: boolean
  onClick: () => void
}) {
  const { technician, score, driveMinutes, todayJobCount, servedCustomerBefore, skillMatch } =
    suggestion

  const initials = technician.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()

  const colors = ["bg-indigo-600", "bg-violet-600", "bg-purple-600", "bg-blue-600"]
  const bgColor = colors[index % colors.length]

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center justify-between rounded-lg border p-3 text-left transition-colors hover:bg-accent/50 ${
        isSelected ? "border-primary bg-primary/5" : "border-border"
      }`}
    >
      <div className="flex items-center gap-3">
        <div
          className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white ${bgColor}`}
        >
          {initials}
        </div>
        <div>
          <div className="text-sm font-semibold">{technician.name}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs">
            {skillMatch ? (
              <span className="text-green-600">
                ✓ {suggestion.technician.skills.join(", ")}
              </span>
            ) : (
              <span className="text-red-500">⚠ No skill match</span>
            )}
            {showDriveTime && driveMinutes !== null && (
              <span className="text-muted-foreground">🚗 {driveMinutes} min</span>
            )}
            <span className="text-muted-foreground">
              📋 {todayJobCount} job{todayJobCount !== 1 ? "s" : ""} today
            </span>
            {servedCustomerBefore && (
              <span className="text-amber-500">⟲ Returning</span>
            )}
          </div>
        </div>
      </div>
      <div className="flex flex-col items-end gap-1">
        {index === 0 && (
          <span className="rounded-full bg-green-500 px-2 py-0.5 text-[10px] font-bold text-black">
            BEST MATCH
          </span>
        )}
        <span className="text-xs text-muted-foreground">
          Score: {Math.round(score * 100)}
        </span>
      </div>
    </button>
  )
}
