import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Search, X } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { api } from "@/api/client"
import type {
  SearchResults,
  SearchPreviewItem,
  SearchCustomer,
  SearchJob,
  SearchEquipment,
} from "@/api/types"

// Flat ordered list for keyboard nav: customers → jobs → equipment
function flatList(results: SearchResults): SearchPreviewItem[] {
  return [
    ...results.customers.map((c): SearchPreviewItem => ({ type: "customer", data: c })),
    ...results.jobs.map((j): SearchPreviewItem => ({ type: "job", data: j })),
    ...results.equipment.map((e): SearchPreviewItem => ({ type: "equipment", data: e })),
  ]
}

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  scheduled: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  en_route: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  in_progress: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  completed: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  cancelled: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)
}

function CustomerPreview({ data, onNavigate }: { data: SearchCustomer; onNavigate: () => void }) {
  const navigate = useNavigate()
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-lg bg-muted/50 p-3 text-sm space-y-1">
        <div className="text-xs text-muted-foreground mb-1">Contact</div>
        <div>{data.phone}</div>
        {data.email && <div className="text-muted-foreground">{data.email}</div>}
        <div className="text-muted-foreground">{data.address}</div>
      </div>
      <Button
        size="sm"
        className="w-full"
        onClick={() => { navigate("/office/customers"); onNavigate() }}
      >
        View Full Customer Profile →
      </Button>
    </div>
  )
}

function JobPreview({ data, onNavigate }: { data: SearchJob; onNavigate: () => void }) {
  const navigate = useNavigate()
  const date = new Date(data.scheduledAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-lg bg-muted/50 p-3 text-sm space-y-1.5">
        <div className="flex items-center gap-2">
          <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[data.status] ?? ""}`}>
            {data.status.replace("_", " ")}
          </span>
          <span className="text-xs text-muted-foreground">{date}</span>
        </div>
        {data.equipmentType && <div><span className="text-muted-foreground">Equipment:</span> {data.equipmentType}</div>}
        {data.symptomSummary && <div className="text-muted-foreground line-clamp-2">{data.symptomSummary}</div>}
        <div><span className="text-muted-foreground">Customer:</span> {data.customer.name}</div>
        {data.assignedTechnician && (
          <div><span className="text-muted-foreground">Technician:</span> {data.assignedTechnician.name}</div>
        )}
      </div>
      <Button
        size="sm"
        className="w-full"
        onClick={() => { navigate("/office/jobs"); onNavigate() }}
      >
        View Job →
      </Button>
    </div>
  )
}

function EquipmentPreview({ data, onNavigate }: { data: SearchEquipment; onNavigate: () => void }) {
  const navigate = useNavigate()
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-lg bg-muted/50 p-3 text-sm space-y-1">
        <div><span className="text-muted-foreground">Type:</span> {data.equipmentType}</div>
        {data.make && <div><span className="text-muted-foreground">Make:</span> {data.make}</div>}
        {data.model && <div><span className="text-muted-foreground">Model:</span> {data.model}</div>}
        {data.serialNumber && <div><span className="text-muted-foreground">Serial:</span> {data.serialNumber}</div>}
        <div><span className="text-muted-foreground">Customer:</span> {data.customer.name}</div>
      </div>
      <Button
        size="sm"
        className="w-full"
        onClick={() => { navigate("/office/customers"); onNavigate() }}
      >
        View Customer →
      </Button>
    </div>
  )
}

export function GlobalSearch() {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResults | null>(null)
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const [preview, setPreview] = useState<SearchPreviewItem | null>(null)
  const [error, setError] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (query.trim().length < 2) {
      setResults(null)
      setOpen(false)
      setSelectedIndex(-1)
      setError(false)
      return
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      setError(false)
      try {
        const data = await api.get<SearchResults>("/api/search?q=" + encodeURIComponent(query.trim()))
        setResults(data)
        setOpen(true)
        setSelectedIndex(-1)
      } catch {
        setError(true)
        setOpen(true)
        setResults(null)
      } finally {
        setLoading(false)
      }
    }, 300)
  }, [query])

  // Click outside closes dropdown and preview
  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setPreview(null)
      }
    }
    document.addEventListener("mousedown", handleMouseDown)
    return () => document.removeEventListener("mousedown", handleMouseDown)
  }, [])

  const flat = results ? flatList(results) : []

  function openPreview(item: SearchPreviewItem) {
    setPreview(item)
    setOpen(false)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setSelectedIndex((i) => Math.min(i + 1, flat.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setSelectedIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === "Enter" && selectedIndex >= 0 && flat[selectedIndex]) {
      openPreview(flat[selectedIndex])
    } else if (e.key === "Escape") {
      if (open) setOpen(false)
      else if (preview) setPreview(null)
    }
  }

  const totalResults = results
    ? results.customers.length + results.jobs.length + results.equipment.length
    : 0

  // Compute flat indices for each group so we can highlight correctly
  const customerOffset = 0
  const jobOffset = results?.customers.length ?? 0
  const equipmentOffset = jobOffset + (results?.jobs.length ?? 0)

  return (
    <div ref={containerRef} className="relative">
      {/* Search input */}
      <div className="relative w-72">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search jobs, customers..."
          className="h-9 bg-card pl-9 text-sm rounded-xl border-transparent shadow-sm placeholder:text-muted-foreground focus:border-primary/20"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => { if (results && flat.length > 0) setOpen(true) }}
          onKeyDown={handleKeyDown}
        />
        {loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 h-3 w-3 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        )}
      </div>

      {/* Dropdown */}
      {open && (
        <div className="absolute top-full left-0 z-50 mt-1 w-80 rounded-xl border border-border bg-popover shadow-lg overflow-hidden">
          {error && (
            <div className="px-4 py-3 text-sm text-muted-foreground text-center">
              Search unavailable
            </div>
          )}
          {!error && results && totalResults === 0 && (
            <div className="px-4 py-3 text-sm text-muted-foreground text-center">
              No results for &ldquo;{query}&rdquo;
            </div>
          )}
          {!error && results && totalResults > 0 && (
            <div className="py-1">
              {results.customers.length > 0 && (
                <div>
                  <div className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    Customers
                  </div>
                  {results.customers.map((c, i) => (
                    <button
                      key={c.id}
                      className={`w-full flex items-center gap-2.5 px-4 py-2 text-left hover:bg-accent transition-colors ${selectedIndex === customerOffset + i ? "bg-accent" : ""}`}
                      onClick={() => openPreview({ type: "customer", data: c })}
                    >
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[11px] font-bold text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                        {initials(c.name)}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{c.name}</div>
                        <div className="truncate text-xs text-muted-foreground">{c.address} · {c.phone}</div>
                      </div>
                      <span className="ml-auto text-xs text-muted-foreground">→</span>
                    </button>
                  ))}
                </div>
              )}
              {results.jobs.length > 0 && (
                <div>
                  {results.customers.length > 0 && <div className="my-1 border-t border-border" />}
                  <div className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    Jobs
                  </div>
                  {results.jobs.map((j, i) => {
                    const date = new Date(j.scheduledAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                    return (
                      <button
                        key={j.id}
                        className={`w-full flex items-center gap-2.5 px-4 py-2 text-left hover:bg-accent transition-colors ${selectedIndex === jobOffset + i ? "bg-accent" : ""}`}
                        onClick={() => openPreview({ type: "job", data: j })}
                      >
                        <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${STATUS_COLORS[j.status] ?? "bg-gray-100"}`}>
                          {j.status === "completed" ? "✓" : j.status[0].toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">{j.equipmentType ?? "Job"} · {j.customer.name}</div>
                          <div className="truncate text-xs text-muted-foreground capitalize">{j.status.replace("_", " ")} · {date}</div>
                        </div>
                        <span className="ml-auto text-xs text-muted-foreground">→</span>
                      </button>
                    )
                  })}
                </div>
              )}
              {results.equipment.length > 0 && (
                <div>
                  {(results.customers.length > 0 || results.jobs.length > 0) && (
                    <div className="my-1 border-t border-border" />
                  )}
                  <div className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    Equipment
                  </div>
                  {results.equipment.map((eq, i) => (
                    <button
                      key={eq.id}
                      className={`w-full flex items-center gap-2.5 px-4 py-2 text-left hover:bg-accent transition-colors ${selectedIndex === equipmentOffset + i ? "bg-accent" : ""}`}
                      onClick={() => openPreview({ type: "equipment", data: eq })}
                    >
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-yellow-100 text-[11px] dark:bg-yellow-900/30">
                        ⚙
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{eq.equipmentType} · {eq.customer.name}</div>
                        {(eq.make || eq.model) && (
                          <div className="truncate text-xs text-muted-foreground">{[eq.make, eq.model].filter(Boolean).join(" ")}</div>
                        )}
                      </div>
                      <span className="ml-auto text-xs text-muted-foreground">→</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="border-t border-border px-4 py-2 text-center text-[11px] text-muted-foreground">
                ↑↓ navigate · Enter select · Esc close
              </div>
            </div>
          )}
        </div>
      )}

      {/* Preview panel */}
      {preview && (
        <div className="absolute top-full right-0 z-50 mt-1 w-72 rounded-xl border border-border bg-popover p-4 shadow-lg">
          <div className="mb-3 flex items-start justify-between gap-2">
            <div>
              <div className="font-semibold text-sm">
                {preview.type === "customer" && preview.data.name}
                {preview.type === "job" && (preview.data.equipmentType ?? "Job")}
                {preview.type === "equipment" && preview.data.equipmentType}
              </div>
              <div className="text-xs text-muted-foreground capitalize">{preview.type}</div>
            </div>
            <button
              onClick={() => setPreview(null)}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {preview.type === "customer" && (
            <CustomerPreview data={preview.data} onNavigate={() => setPreview(null)} />
          )}
          {preview.type === "job" && (
            <JobPreview data={preview.data} onNavigate={() => setPreview(null)} />
          )}
          {preview.type === "equipment" && (
            <EquipmentPreview data={preview.data} onNavigate={() => setPreview(null)} />
          )}
        </div>
      )}
    </div>
  )
}
