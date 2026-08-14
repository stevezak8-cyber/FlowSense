# Global Search Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a debounced global search to the office header that queries jobs, customers, and equipment and shows results in a dropdown with an inline preview panel.

**Architecture:** A new `GET /api/search?q=` endpoint runs three parallel Prisma ILIKE queries scoped to the org and returns up to 5 results per category. A self-contained `GlobalSearch.tsx` component replaces the static header input, owns the dropdown + preview panel state, and fires the debounced API call.

**Tech Stack:** Express/Prisma/PostgreSQL (backend), React/TypeScript/shadcn (frontend), Vitest/Supertest (backend tests)

---

## Chunk 1: Backend route + tests

### Task 1: Search route + tests

**Files:**
- Create: `backend/src/routes/search.ts`
- Create: `backend/src/__tests__/search.test.ts`
- Modify: `backend/src/index.ts` (import + mount)

#### Context for implementer

The codebase pattern for route files (see `backend/src/routes/equipment.ts`):
- Uses `import { Router } from "express"` and `export const searchRouter = Router()`
- Auth is applied at mount point in `index.ts`, not inside the router
- `req.user` is typed via `backend/src/middleware/types.js` — access as `req.user!.organizationId` and `req.user!.role`

The Prisma client is at `backend/src/lib/prisma.js` (import as `import { prisma } from "../lib/prisma.js"`).

Tests follow the pattern in `backend/src/__tests__/job-photos.test.ts`:
- `vi.mock("../lib/prisma.js", ...)` at the top before imports
- Build a mini-Express app with a fake `req.user` injected via middleware
- Use `supertest` to fire requests

In `index.ts`, search goes with the other authenticated API routes. The line to add after the equipment router (line 123):
```typescript
import { searchRouter } from "./routes/search.js"
// ...
app.use("/api/search", apiLimiter, requireAuth, requireSubscription, searchRouter);
```

- [ ] **Step 1: Write the test file**

Create `backend/src/__tests__/search.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest"
import request from "supertest"
import express from "express"

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    job: { findMany: vi.fn() },
    customer: { findMany: vi.fn() },
    equipment: { findMany: vi.fn() },
  },
}))

import { prisma } from "../lib/prisma.js"
import { searchRouter } from "../routes/search.js"

const mockPrisma = prisma as unknown as {
  job: { findMany: ReturnType<typeof vi.fn> }
  customer: { findMany: ReturnType<typeof vi.fn> }
  equipment: { findMany: ReturnType<typeof vi.fn> }
}

function makeApp(role = "office") {
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    ;(req as express.Request & { user: unknown }).user = {
      id: "user1",
      organizationId: "org1",
      role,
    }
    next()
  })
  app.use("/", searchRouter)
  return app
}

beforeEach(() => {
  vi.resetAllMocks()
  mockPrisma.job.findMany.mockResolvedValue([])
  mockPrisma.customer.findMany.mockResolvedValue([])
  mockPrisma.equipment.findMany.mockResolvedValue([])
})

describe("GET /", () => {
  it("returns 400 for q shorter than 2 characters", async () => {
    const res = await request(makeApp()).get("/?q=a")
    expect(res.status).toBe(400)
  })

  it("returns 400 when q is missing", async () => {
    const res = await request(makeApp()).get("/")
    expect(res.status).toBe(400)
  })

  it("returns 403 for non-office role", async () => {
    const res = await request(makeApp("technician")).get("/?q=ac")
    expect(res.status).toBe(403)
  })

  it("returns empty arrays for no matches", async () => {
    const res = await request(makeApp()).get("/?q=zzz")
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ jobs: [], customers: [], equipment: [] })
  })

  it("returns matching customers by name", async () => {
    const customer = { id: "c1", name: "Alice Johnson", phone: "555-1234", address: "123 Main St", email: null }
    mockPrisma.customer.findMany.mockResolvedValue([customer])
    const res = await request(makeApp()).get("/?q=alice")
    expect(res.status).toBe(200)
    expect(res.body.customers).toHaveLength(1)
    expect(res.body.customers[0].name).toBe("Alice Johnson")
  })

  it("returns matching jobs by equipment type", async () => {
    const job = {
      id: "j1", status: "completed", scheduledAt: "2026-08-10T10:00:00Z",
      equipmentType: "AC Unit", symptomSummary: null,
      customer: { id: "c1", name: "Alice", address: "123 Main" },
      technician: null,
    }
    mockPrisma.job.findMany.mockResolvedValue([job])
    const res = await request(makeApp()).get("/?q=ac+unit")
    expect(res.status).toBe(200)
    expect(res.body.jobs).toHaveLength(1)
    expect(res.body.jobs[0].equipmentType).toBe("AC Unit")
  })

  it("results are scoped to the requesting org", async () => {
    // org2's customer — prisma is called with organizationId: "org1", so it won't return org2 data
    // Verify the where clause includes organizationId
    mockPrisma.customer.findMany.mockResolvedValue([])
    await request(makeApp()).get("/?q=alice")
    const callArgs = mockPrisma.customer.findMany.mock.calls[0][0]
    expect(callArgs.where.organizationId).toBe("org1")
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd backend && npx vitest run src/__tests__/search.test.ts
```

Expected: import error (module not found) or test failures — route doesn't exist yet.

- [ ] **Step 3: Create the route**

Create `backend/src/routes/search.ts`:

```typescript
import { Router } from "express"
import { prisma } from "../lib/prisma.js"

export const searchRouter = Router()

searchRouter.get("/", async (req, res) => {
  const user = req.user!
  if (user.role !== "office") {
    res.status(403).json({ error: "Office access only" })
    return
  }

  const q = (req.query.q as string | undefined)?.trim() ?? ""
  if (q.length < 2) {
    res.status(400).json({ error: "Query must be at least 2 characters" })
    return
  }

  const { organizationId } = user

  const [jobs, customers, equipment] = await Promise.all([
    prisma.job.findMany({
      where: {
        organizationId,
        OR: [
          { symptomSummary: { contains: q, mode: "insensitive" } },
          { equipmentType: { contains: q, mode: "insensitive" } },
          { serviceType: { contains: q, mode: "insensitive" } },
          { actionsTaken: { contains: q, mode: "insensitive" } },
          { customer: { name: { contains: q, mode: "insensitive" } } },
        ],
      },
      select: {
        id: true,
        status: true,
        scheduledAt: true,
        equipmentType: true,
        symptomSummary: true,
        customer: { select: { id: true, name: true, address: true } },
        technician: { select: { name: true } },
      },
      take: 5,
      orderBy: { scheduledAt: "desc" },
    }),
    prisma.customer.findMany({
      where: {
        organizationId,
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { phone: { contains: q, mode: "insensitive" } },
          { address: { contains: q, mode: "insensitive" } },
          { email: { contains: q, mode: "insensitive" } },
        ],
      },
      select: { id: true, name: true, phone: true, address: true, email: true },
      take: 5,
      orderBy: { name: "asc" },
    }),
    prisma.equipment.findMany({
      where: {
        organizationId,
        OR: [
          { equipmentType: { contains: q, mode: "insensitive" } },
          { make: { contains: q, mode: "insensitive" } },
          { model: { contains: q, mode: "insensitive" } },
          { serialNumber: { contains: q, mode: "insensitive" } },
          { customer: { name: { contains: q, mode: "insensitive" } } },
        ],
      },
      select: {
        id: true,
        equipmentType: true,
        make: true,
        model: true,
        serialNumber: true,
        customer: { select: { id: true, name: true } },
      },
      take: 5,
      orderBy: { createdAt: "desc" },
    }),
  ])

  // Map technician to assignedTechnician shape expected by frontend
  const mappedJobs = jobs.map((j) => ({
    ...j,
    assignedTechnician: j.technician ?? null,
    technician: undefined,
  }))

  res.json({ jobs: mappedJobs, customers, equipment })
})
```

- [ ] **Step 4: Mount in index.ts**

In `backend/src/index.ts`, add after the equipment router import (around line 46):
```typescript
import { searchRouter } from "./routes/search.js"
```

And add after `app.use("/api/equipment", ...)` (around line 123):
```typescript
app.use("/api/search", apiLimiter, requireAuth, requireSubscription, searchRouter);
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
cd backend && npx vitest run src/__tests__/search.test.ts
```

Expected: 7/7 PASS

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/search.ts backend/src/__tests__/search.test.ts backend/src/index.ts
git commit -m "feat: add GET /api/search endpoint with org-scoped ILIKE queries"
```

---

## Chunk 2: Frontend types + GlobalSearch component

### Task 2: Add search types to frontend/src/api/types.ts

**Files:**
- Modify: `frontend/src/api/types.ts`

This file already exists (ends around line 360 with `PhotoUploadUrlResponse`). Add the search types at the end.

- [ ] **Step 1: Append search types**

Add to the end of `frontend/src/api/types.ts`:

```typescript
export interface SearchJob {
  id: string
  status: string
  scheduledAt: string
  equipmentType: string | null
  symptomSummary: string | null
  customer: { id: string; name: string; address: string }
  assignedTechnician: { name: string } | null
}

export interface SearchCustomer {
  id: string
  name: string
  phone: string
  address: string
  email: string | null
}

export interface SearchEquipment {
  id: string
  equipmentType: string
  make: string | null
  model: string | null
  serialNumber: string | null
  customer: { id: string; name: string }
}

export interface SearchResults {
  jobs: SearchJob[]
  customers: SearchCustomer[]
  equipment: SearchEquipment[]
}

export type SearchPreviewItem =
  | { type: "customer"; data: SearchCustomer }
  | { type: "job"; data: SearchJob }
  | { type: "equipment"; data: SearchEquipment }
```

- [ ] **Step 2: Confirm TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api/types.ts
git commit -m "feat: add search types to API types"
```

---

### Task 3: GlobalSearch component

**Files:**
- Create: `frontend/src/components/search/GlobalSearch.tsx`
- Modify: `frontend/src/components/top-header.tsx`

#### Context for implementer

The existing `top-header.tsx` has a `<div className="relative w-72">` wrapping a static `<Input>` with a `<Search>` icon. `GlobalSearch` replaces that entire `<div>`.

The `api` client is at `frontend/src/api/client.ts` — use `api.get<SearchResults>("/api/search?q=" + encodeURIComponent(query))`.

Status badge colors follow the same pattern used in `frontend/src/components/jobs/jobs-table.tsx` — check that file for the status→color mapping.

shadcn components available: `Input`, `Badge` (for status), `Button`. No Dialog needed — the preview panel is an inline positioned div, not a modal.

- [ ] **Step 1: Create GlobalSearch.tsx**

Create `frontend/src/components/search/GlobalSearch.tsx`:

```tsx
import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Search, X } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
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
  const hasResults = flat.length > 0

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
```

- [ ] **Step 2: Replace the static input in top-header.tsx**

In `frontend/src/components/top-header.tsx`:

Remove:
```tsx
import { Bell, Search } from "lucide-react"
import { Input } from "@/components/ui/input"
```

Replace with:
```tsx
import { Bell } from "lucide-react"
import { GlobalSearch } from "@/components/search/GlobalSearch"
```

Replace:
```tsx
      <div className="relative w-72">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search jobs, technicians..."
          className="h-9 bg-card pl-9 text-sm rounded-xl border-transparent shadow-sm placeholder:text-muted-foreground focus:border-primary/20"
        />
      </div>
```

With:
```tsx
      <GlobalSearch />
```

- [ ] **Step 3: Confirm TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/search/GlobalSearch.tsx frontend/src/components/top-header.tsx
git commit -m "feat: add GlobalSearch component with dropdown and inline preview panel"
```

---

## Chunk 3: End-to-end verification

### Task 4: Manual smoke test

This task has no automated tests — it verifies the feature works in the browser.

- [ ] **Step 1: Start both servers**

```bash
# Terminal 1
cd backend && npm run dev

# Terminal 2
cd frontend && npm run dev
```

- [ ] **Step 2: Log in as an office user and type in the search box**

- Type at least 2 characters
- Verify the dropdown appears after ~300 ms
- Verify results are grouped (Customers / Jobs / Equipment)

- [ ] **Step 3: Click a result and verify the preview panel**

- Customer preview: shows name, phone, email, address; "View Full Customer Profile" navigates to `/office/customers`
- Job preview: shows status badge, date, equipment type, customer name; "View Job" navigates to `/office/jobs`
- Equipment preview: shows type, make, model, serial, customer name; "View Customer" navigates to `/office/customers`

- [ ] **Step 4: Verify keyboard navigation**

- ↑↓ moves the highlighted row through Customers → Jobs → Equipment order
- Enter opens the preview for the highlighted row
- Esc closes the dropdown (first press) then the preview (second press)

- [ ] **Step 5: Verify click outside closes both**

- Open the dropdown, click elsewhere on the page — dropdown closes
- Open the preview panel, click elsewhere — preview closes

- [ ] **Step 6: Verify error states**

- Type 1 character — no dropdown
- Disconnect the backend (or stop it) and type — dropdown shows "Search unavailable"
- Type something with no matches — dropdown shows 'No results for "..."'

- [ ] **Step 7: Final commit (if any polish)**

```bash
git add -p
git commit -m "fix: global search polish"
```
