# Calendar & Scheduling View Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a FullCalendar-based scheduling view to FlowSense so office dispatchers can see, drag-to-reschedule, and reassign jobs across the week.

**Architecture:** A shared `ScheduleCalendar` component wraps FullCalendar and is used in two places: a new dedicated `/office/schedule` page (full-screen, primary dispatcher home), and as a toggle inside the existing `OfficeJobs` page. Drag-drop reschedule calls `PATCH /api/jobs/:id` and then opens the existing `DispatchSuggestions` component in a new `mode="reassign"` path.

**Tech Stack:** React 18, TypeScript, FullCalendar v6 (`@fullcalendar/react`, `@fullcalendar/timegrid`, `@fullcalendar/interaction`), Vitest + Testing Library, existing Express/Prisma backend (no changes).

---

## File Map

**New files:**
- `frontend/src/components/schedule/CalendarEventCard.tsx` — custom FullCalendar event renderer (rich job card)
- `frontend/src/components/schedule/UnassignedStrip.tsx` — bottom strip showing unassigned jobs with drag support
- `frontend/src/components/schedule/ScheduleCalendar.tsx` — shared FullCalendar wrapper (week/day views, drag-drop, reassignment flow)
- `frontend/src/pages/office/OfficeSchedule.tsx` — dedicated Schedule page (toolbar + ScheduleCalendar)
- `frontend/src/components/schedule/__tests__/CalendarEventCard.test.tsx`
- `frontend/src/components/schedule/__tests__/UnassignedStrip.test.tsx`
- `frontend/src/components/schedule/__tests__/ScheduleCalendar.test.tsx`

**Modified files:**
- `frontend/package.json` — add FullCalendar dependencies
- `frontend/src/components/jobs/dispatch-suggestions.tsx` — add `mode="reassign"` prop + `jobId` prop
- `frontend/src/components/app-sidebar.tsx` — add Schedule nav item (after Dashboard, before Jobs)
- `frontend/src/App.tsx` — add `/office/schedule` route inside office route group
- `frontend/src/pages/office/OfficeJobs.tsx` — add List/Calendar tab switcher

---

## Chunk 1: Dependencies + CalendarEventCard

### Task 1: Install FullCalendar packages

**Files:**
- Modify: `frontend/package.json`

- [ ] **Step 1: Install packages**

```bash
cd frontend && npm install @fullcalendar/react @fullcalendar/timegrid @fullcalendar/interaction
```

Expected output: packages added, no peer dependency errors.

- [ ] **Step 2: Verify install**

```bash
cd frontend && npm ls @fullcalendar/react @fullcalendar/timegrid @fullcalendar/interaction
```

Expected: all three packages listed with versions.

- [ ] **Step 3: Commit**

```bash
git add frontend/package.json frontend/package-lock.json
git commit -m "chore: add FullCalendar dependencies"
```

---

### Task 2: CalendarEventCard component

`CalendarEventCard` is the custom event renderer passed to FullCalendar's `eventContent` prop. It receives an `ApiJob` (stored in FullCalendar's `extendedProps`) and renders the rich card.

**Files:**
- Create: `frontend/src/components/schedule/__tests__/CalendarEventCard.test.tsx`
- Create: `frontend/src/components/schedule/CalendarEventCard.tsx`

- [ ] **Step 1: Write failing tests**

Create `frontend/src/components/schedule/__tests__/CalendarEventCard.test.tsx`:

```tsx
import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { CalendarEventCard } from "../CalendarEventCard"
import type { ApiJob } from "@/api/types"

function makeJob(overrides: Partial<ApiJob> = {}): ApiJob {
  return {
    id: "job-1",
    organizationId: "org-1",
    customerId: "cust-1",
    technicianId: "tech-1",
    status: "scheduled",
    priority: "normal",
    scheduledAt: "2026-06-20T09:00:00.000Z",
    symptomSummary: null,
    equipmentType: "furnace",
    equipmentNotes: null,
    serviceType: "repair",
    preArrivalNotes: null,
    suggestedParts: [],
    suggestedTools: [],
    riskFlags: [],
    summary: null,
    actionsTaken: null,
    partsUsed: [],
    photos: [],
    completedAt: null,
    createdAt: "2026-06-20T00:00:00.000Z",
    updatedAt: "2026-06-20T00:00:00.000Z",
    customer: { id: "cust-1", name: "Sarah Johnson", address: "123 Oak St, Austin TX" },
    technician: { id: "tech-1", name: "Mike Thompson" },
    ...overrides,
  }
}

describe("CalendarEventCard", () => {
  it("renders customer name", () => {
    render(<CalendarEventCard job={makeJob()} />)
    expect(screen.getByText("Sarah Johnson")).toBeInTheDocument()
  })

  it("renders customer address", () => {
    render(<CalendarEventCard job={makeJob()} />)
    expect(screen.getByText("123 Oak St, Austin TX")).toBeInTheDocument()
  })

  it("renders service type", () => {
    render(<CalendarEventCard job={makeJob()} />)
    expect(screen.getByText(/repair/i)).toBeInTheDocument()
  })

  it("renders technician name", () => {
    render(<CalendarEventCard job={makeJob()} />)
    expect(screen.getByText("Mike Thompson")).toBeInTheDocument()
  })

  it("renders status badge", () => {
    render(<CalendarEventCard job={makeJob({ status: "en_route" })} />)
    expect(screen.getByText(/en.route/i)).toBeInTheDocument()
  })

  it("shows urgent indicator for urgent priority", () => {
    render(<CalendarEventCard job={makeJob({ priority: "urgent" })} />)
    expect(screen.getByText("⚡")).toBeInTheDocument()
  })

  it("applies blue background for scheduled status", () => {
    const { container } = render(<CalendarEventCard job={makeJob({ status: "scheduled" })} />)
    const card = container.firstChild as HTMLElement
    expect(card.style.backgroundColor).toBe("rgb(59, 130, 246)")
  })

  it("applies red background for urgent priority regardless of status", () => {
    const { container } = render(
      <CalendarEventCard job={makeJob({ status: "scheduled", priority: "urgent" })} />
    )
    const card = container.firstChild as HTMLElement
    expect(card.style.backgroundColor).toBe("rgb(220, 38, 38)")
  })

  it("shows Unassigned when technician is null", () => {
    render(<CalendarEventCard job={makeJob({ technicianId: null, technician: null })} />)
    expect(screen.getByText("Unassigned")).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to confirm failures**

```bash
cd frontend && npm test -- CalendarEventCard
```

Expected: all tests fail with "Cannot find module".

- [ ] **Step 3: Implement CalendarEventCard**

Create `frontend/src/components/schedule/CalendarEventCard.tsx`:

```tsx
import type { ApiJob } from "@/api/types"

const STATUS_COLORS: Record<string, string> = {
  scheduled: "#3b82f6",
  en_route: "#6366f1",
  in_progress: "#059669",
  completed: "#6b7280",
  cancelled: "#6b7280",
  pending: "#94a3b8",
}

function getBackgroundColor(job: ApiJob): string {
  if (job.priority === "urgent") return "#dc2626"
  return STATUS_COLORS[job.status] ?? "#94a3b8"
}

function formatStatus(status: string): string {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

interface CalendarEventCardProps {
  job: ApiJob
}

export function CalendarEventCard({ job }: CalendarEventCardProps) {
  const bg = getBackgroundColor(job)

  return (
    <div
      style={{
        backgroundColor: bg,
        borderLeft: job.priority === "urgent" ? "3px solid #7f1d1d" : undefined,
        borderRadius: "4px",
        padding: "3px 6px",
        color: "white",
        fontSize: "11px",
        height: "100%",
        overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "3px" }}>
        {job.priority === "urgent" && <span>⚡</span>}
        <span style={{ fontWeight: 700 }}>{job.customer.name}</span>
      </div>
      <div style={{ opacity: 0.85, fontSize: "10px", marginTop: "1px" }}>
        {job.customer.address}
      </div>
      {job.serviceType && (
        <div style={{ opacity: 0.85, fontSize: "10px" }}>{job.serviceType}</div>
      )}
      <div style={{ opacity: 0.8, fontSize: "10px", marginTop: "2px" }}>
        👤 {job.technician?.name ?? "Unassigned"}
      </div>
      <span
        style={{
          background: "rgba(255,255,255,0.25)",
          borderRadius: "3px",
          padding: "0 3px",
          fontSize: "9px",
          marginTop: "2px",
          display: "inline-block",
        }}
      >
        {formatStatus(job.status)}
      </span>
    </div>
  )
}
```

- [ ] **Step 4: Run tests — all should pass**

```bash
cd frontend && npm test -- CalendarEventCard
```

Expected: 9 tests passing.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/schedule/
git commit -m "feat: add CalendarEventCard component with status/priority color coding"
```

---

## Chunk 2: UnassignedStrip

### Task 3: UnassignedStrip component

Shows jobs with no assigned technician at the bottom of the calendar. Filters the full job list client-side.

**Files:**
- Create: `frontend/src/components/schedule/__tests__/UnassignedStrip.test.tsx`
- Create: `frontend/src/components/schedule/UnassignedStrip.tsx`

- [ ] **Step 1: Write failing tests**

Create `frontend/src/components/schedule/__tests__/UnassignedStrip.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { UnassignedStrip } from "../UnassignedStrip"
import type { ApiJob } from "@/api/types"

function makeJob(id: string, overrides: Partial<ApiJob> = {}): ApiJob {
  return {
    id,
    organizationId: "org-1",
    customerId: "cust-1",
    technicianId: "tech-1",
    status: "pending",
    priority: "normal",
    scheduledAt: "2026-06-20T09:00:00.000Z",
    symptomSummary: null,
    equipmentType: "furnace",
    equipmentNotes: null,
    serviceType: "repair",
    preArrivalNotes: null,
    suggestedParts: [],
    suggestedTools: [],
    riskFlags: [],
    summary: null,
    actionsTaken: null,
    partsUsed: [],
    photos: [],
    completedAt: null,
    createdAt: "2026-06-20T00:00:00.000Z",
    updatedAt: "2026-06-20T00:00:00.000Z",
    customer: { id: "cust-1", name: "Sarah Johnson", address: "123 Oak St" },
    technician: { id: "tech-1", name: "Mike Thompson" },
    ...overrides,
  }
}

describe("UnassignedStrip", () => {
  it("shows only jobs without a technicianId", () => {
    const jobs = [
      makeJob("job-1", {
        technicianId: "tech-1",
        technician: { id: "tech-1", name: "Mike" },
        customer: { id: "c1", name: "Assigned Customer", address: "1 Main St" },
      }),
      makeJob("job-2", { technicianId: null, technician: null }),
      makeJob("job-3", { technicianId: null, technician: null, customer: { id: "c2", name: "Bob Martinez", address: "456 Elm" } }),
    ]
    render(<UnassignedStrip jobs={jobs} />)
    expect(screen.queryByText(/Assigned Customer/)).not.toBeInTheDocument()
    expect(screen.getByText(/Sarah Johnson/)).toBeInTheDocument() // job-2
    expect(screen.getByText(/Bob Martinez/)).toBeInTheDocument() // job-3
  })

  it("renders nothing when all jobs are assigned", () => {
    const jobs = [makeJob("job-1")]
    const { container } = render(<UnassignedStrip jobs={jobs} />)
    expect(container.textContent).not.toContain("Sarah Johnson")
  })

  it("highlights urgent unassigned jobs in red", () => {
    const jobs = [makeJob("job-1", { technicianId: null, technician: null, priority: "urgent" })]
    render(<UnassignedStrip jobs={jobs} />)
    const pill = screen.getByText(/Sarah Johnson/)
    expect(pill.closest("[data-urgent]")).toHaveAttribute("data-urgent", "true")
  })

  it("renders UNASSIGNED JOBS label when there are unassigned jobs", () => {
    const jobs = [makeJob("job-1", { technicianId: null, technician: null })]
    render(<UnassignedStrip jobs={jobs} />)
    expect(screen.getByText("UNASSIGNED JOBS")).toBeInTheDocument()
  })

  it("renders nothing when there are no unassigned jobs", () => {
    const jobs = [makeJob("job-1")]
    const { container } = render(<UnassignedStrip jobs={jobs} />)
    expect(container.firstChild).toBeNull()
  })
})
```

- [ ] **Step 2: Run to confirm failures**

```bash
cd frontend && npm test -- UnassignedStrip
```

Expected: all tests fail with "Cannot find module".

- [ ] **Step 3: Implement UnassignedStrip**

Create `frontend/src/components/schedule/UnassignedStrip.tsx`:

```tsx
import type { ApiJob } from "@/api/types"

interface UnassignedStripProps {
  jobs: ApiJob[]
}

export function UnassignedStrip({ jobs }: UnassignedStripProps) {
  const unassigned = jobs.filter((j) => !j.technicianId)

  if (unassigned.length === 0) return null

  function handleDragStart(e: React.DragEvent, jobId: string) {
    e.dataTransfer.setData("text/plain", jobId)
    e.dataTransfer.effectAllowed = "move"
  }

  return (
    <div
      style={{
        padding: "8px 16px",
        background: "var(--bg-secondary, #f8fafc)",
        borderTop: "1px solid var(--border, #e2e8f0)",
      }}
    >
      <div
        style={{
          fontSize: "10px",
          fontWeight: 700,
          color: "var(--text-secondary, #64748b)",
          letterSpacing: "0.05em",
          marginBottom: "6px",
        }}
      >
        UNASSIGNED JOBS
      </div>
      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
        {unassigned.map((job) => (
          <div
            key={job.id}
            draggable
            data-job-id={job.id}
            data-urgent={job.priority === "urgent" ? "true" : undefined}
            onDragStart={(e) => handleDragStart(e, job.id)}
            style={{
              background: job.priority === "urgent" ? "#dc2626" : "var(--bg-primary, white)",
              border: job.priority === "urgent" ? "none" : "1px solid var(--border, #e2e8f0)",
              borderRadius: "4px",
              padding: "4px 8px",
              fontSize: "11px",
              fontWeight: 600,
              color: job.priority === "urgent" ? "white" : "var(--text-secondary, #64748b)",
              cursor: "grab",
            }}
          >
            {job.priority === "urgent" && "⚡ "}
            {job.customer.name}
            {job.serviceType ? ` — ${job.serviceType}` : ""}
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests — all should pass**

```bash
cd frontend && npm test -- UnassignedStrip
```

Expected: 5 tests passing.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/schedule/UnassignedStrip.tsx frontend/src/components/schedule/__tests__/UnassignedStrip.test.tsx
git commit -m "feat: add UnassignedStrip component"
```

---

## Chunk 3: DispatchSuggestions reassign mode

### Task 4: Add reassign mode to DispatchSuggestions

The existing component is used inside `CreateJobDialog` and calls `onSelect(technicianId)` to set form state. In reassign mode, it accepts a `jobId` and directly calls `PATCH /api/jobs/:id { technicianId }` on selection.

**Files:**
- Modify: `frontend/src/components/jobs/dispatch-suggestions.tsx`
- Modify: `frontend/src/components/jobs/__tests__/dispatch-suggestions.test.tsx`

- [ ] **Step 1: Read the current component to understand the full interface**

Read `frontend/src/components/jobs/dispatch-suggestions.tsx` — note the existing `DispatchSuggestionsProps` interface and `onSelect` callback.

- [ ] **Step 2: Update the api mock to include `patch`**

At the top of `frontend/src/components/jobs/__tests__/dispatch-suggestions.test.tsx`, update the `vi.mock("@/api/client", ...)` block:

```tsx
vi.mock("@/api/client", () => ({
  api: {
    post: vi.fn(),
    patch: vi.fn(),
  },
}))
```

- [ ] **Step 3: Write failing test for reassign mode**

Add to `frontend/src/components/jobs/__tests__/dispatch-suggestions.test.tsx`:

```tsx
describe("DispatchSuggestions — reassign mode", () => {
  it("calls PATCH /api/jobs/:id when a tech is selected in reassign mode", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    vi.mocked(api.post).mockResolvedValue(mockResult)
    vi.mocked(api.patch).mockResolvedValue({})

    render(
      <DispatchSuggestions
        {...defaultProps}
        mode="reassign"
        jobId="job-123"
      />
    )

    await vi.advanceTimersByTimeAsync(350)
    await waitFor(() => expect(screen.getByText("Jordan Smith")).toBeInTheDocument())

    // Clicking the tech row triggers handleAssign which calls PATCH in reassign mode
    await user.click(screen.getByText("Jordan Smith"))

    expect(api.patch).toHaveBeenCalledWith("/api/jobs/job-123", { technicianId: "t1" })
  })
})
```

- [ ] **Step 4: Run to confirm failure**

```bash
cd frontend && npm test -- dispatch-suggestions
```

Expected: new test fails, existing tests still pass.

- [ ] **Step 5: Add reassign mode to DispatchSuggestions**

In `frontend/src/components/jobs/dispatch-suggestions.tsx`, update the props interface and the select handler:

```tsx
// Add to DispatchSuggestionsProps:
mode?: "suggest" | "reassign"
jobId?: string

// Add handleAssign inside the component body (before the return):
async function handleAssign(technicianId: string) {
  if (mode === "reassign" && jobId) {
    try {
      await api.patch(`/api/jobs/${jobId}`, { technicianId })
      onSelect(technicianId)
    } catch {
      toast.error("Failed to reassign technician")
    }
  } else {
    onSelect(technicianId)
  }
}
```

Replace calls to `onSelect(suggestion.technician.id)` with `handleAssign(suggestion.technician.id)`.
Leave the deselect path (`onSelect(null)`) unchanged — deselecting in reassign mode does not fire a PATCH.

- [ ] **Step 6: Run all dispatch-suggestions tests**

```bash
cd frontend && npm test -- dispatch-suggestions
```

Expected: all tests pass including the new reassign mode test.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/jobs/dispatch-suggestions.tsx frontend/src/components/jobs/__tests__/dispatch-suggestions.test.tsx
git commit -m "feat: add reassign mode to DispatchSuggestions"
```

---

## Chunk 4: ScheduleCalendar component

### Task 5: ScheduleCalendar — job mapping utility (TDD)

The mapping function converts `ApiJob[]` to FullCalendar `EventInput[]`. It is pure and easily unit-tested in isolation.

**Files:**
- Create: `frontend/src/components/schedule/__tests__/ScheduleCalendar.test.tsx`
- Create: `frontend/src/components/schedule/ScheduleCalendar.tsx` (mapping utility first)

- [ ] **Step 1: Write failing tests for the mapping function**

Create `frontend/src/components/schedule/__tests__/ScheduleCalendar.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest"
import { jobsToEvents } from "../ScheduleCalendar"
import type { ApiJob } from "@/api/types"

function makeJob(overrides: Partial<ApiJob> = {}): ApiJob {
  return {
    id: "job-1",
    organizationId: "org-1",
    customerId: "cust-1",
    technicianId: "tech-1",
    status: "scheduled",
    priority: "normal",
    scheduledAt: "2026-06-20T09:00:00.000Z",
    symptomSummary: null,
    equipmentType: "furnace",
    equipmentNotes: null,
    serviceType: "repair",
    preArrivalNotes: null,
    suggestedParts: [],
    suggestedTools: [],
    riskFlags: [],
    summary: null,
    actionsTaken: null,
    partsUsed: [],
    photos: [],
    completedAt: null,
    createdAt: "2026-06-20T00:00:00.000Z",
    updatedAt: "2026-06-20T00:00:00.000Z",
    customer: { id: "cust-1", name: "Sarah Johnson", address: "123 Oak St" },
    technician: { id: "tech-1", name: "Mike Thompson" },
    ...overrides,
  }
}

describe("jobsToEvents", () => {
  it("maps job id to event id", () => {
    const events = jobsToEvents([makeJob({ id: "abc-123" })])
    expect(events[0].id).toBe("abc-123")
  })

  it("sets start from scheduledAt", () => {
    const events = jobsToEvents([makeJob({ scheduledAt: "2026-06-20T09:00:00.000Z" })])
    expect(events[0].start).toBe("2026-06-20T09:00:00.000Z")
  })

  it("sets end to scheduledAt + 2 hours", () => {
    const events = jobsToEvents([makeJob({ scheduledAt: "2026-06-20T09:00:00.000Z" })])
    expect(events[0].end).toBe("2026-06-20T11:00:00.000Z")
  })

  it("stores the full ApiJob in extendedProps.job", () => {
    const job = makeJob()
    const events = jobsToEvents([job])
    expect(events[0].extendedProps?.job).toEqual(job)
  })

  it("marks completed jobs as non-editable", () => {
    const events = jobsToEvents([makeJob({ status: "completed" })])
    expect(events[0].editable).toBe(false)
  })

  it("marks cancelled jobs as non-editable", () => {
    const events = jobsToEvents([makeJob({ status: "cancelled" })])
    expect(events[0].editable).toBe(false)
  })

  it("marks scheduled jobs as editable", () => {
    const events = jobsToEvents([makeJob({ status: "scheduled" })])
    expect(events[0].editable).toBe(true)
  })
})
```

- [ ] **Step 2: Run to confirm failures**

```bash
cd frontend && npm test -- ScheduleCalendar
```

Expected: all tests fail with "Cannot find module".

- [ ] **Step 3: Implement the mapping function**

Create `frontend/src/components/schedule/ScheduleCalendar.tsx` with just the export for now:

```tsx
import { useEffect, useState, useCallback, useRef } from "react"
import FullCalendar from "@fullcalendar/react"
import timeGridPlugin from "@fullcalendar/timegrid"
import interactionPlugin from "@fullcalendar/interaction"
import type { EventInput, EventDropArg } from "@fullcalendar/core"
import { api } from "@/api/client"
import type { ApiJob } from "@/api/types"
import { CalendarEventCard } from "./CalendarEventCard"
import { UnassignedStrip } from "./UnassignedStrip"
import { DispatchSuggestions } from "@/components/jobs/dispatch-suggestions"
import { PageError } from "@/components/page-error"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"

const NON_EDITABLE_STATUSES = new Set(["completed", "cancelled"])

export function jobsToEvents(jobs: ApiJob[]): EventInput[] {
  return jobs.map((job) => {
    const start = new Date(job.scheduledAt)
    const end = new Date(start.getTime() + 2 * 60 * 60 * 1000)
    return {
      id: job.id,
      start: job.scheduledAt,
      end: end.toISOString(),
      editable: !NON_EDITABLE_STATUSES.has(job.status),
      extendedProps: { job },
    }
  })
}

// ScheduleCalendar component defined in Task 6 below
```

- [ ] **Step 4: Run tests — all should pass**

```bash
cd frontend && npm test -- ScheduleCalendar
```

Expected: 7 tests passing.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/schedule/ScheduleCalendar.tsx frontend/src/components/schedule/__tests__/ScheduleCalendar.test.tsx
git commit -m "feat: add jobsToEvents mapping utility with tests"
```

---

### Task 6: ScheduleCalendar — full component

Now implement the full FullCalendar wrapper. This is the most complex piece — it fetches jobs, renders the calendar, handles drag-drop, and coordinates the reassignment panel.

**Files:**
- Modify: `frontend/src/components/schedule/ScheduleCalendar.tsx`

- [ ] **Step 1: Implement the full ScheduleCalendar component**

Replace the stub in `frontend/src/components/schedule/ScheduleCalendar.tsx` with the full implementation. Keep `jobsToEvents` export at the top, then add below it:

```tsx
interface ReassignState {
  jobId: string
  scheduledAt: string
  job: ApiJob
}

interface ScheduleCalendarProps {
  /** Optional tech filter — if set, only show jobs for this technician */
  technicianId?: string | null
  /** Called when + New Job is clicked (parent renders CreateJobDialog) */
  onCreateJob?: () => void
}

export function ScheduleCalendar({ technicianId, onCreateJob }: ScheduleCalendarProps) {
  const [jobs, setJobs] = useState<ApiJob[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reassign, setReassign] = useState<ReassignState | null>(null)
  const calendarRef = useRef<FullCalendar | null>(null)

  const fetchJobs = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.get<ApiJob[]>("/api/jobs")
      setJobs(data)
    } catch {
      setError("Failed to load jobs")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchJobs() }, [fetchJobs])

  const filteredJobs = technicianId
    ? jobs.filter((j) => j.technicianId === technicianId)
    : jobs

  async function handleEventDrop({ event, revert }: EventDropArg) {
    const job = event.extendedProps.job as ApiJob
    const newStart = event.start?.toISOString()
    if (!newStart) { revert(); return }

    try {
      await api.patch(`/api/jobs/${job.id}`, { scheduledAt: newStart })
      setJobs((prev) =>
        prev.map((j) => j.id === job.id ? { ...j, scheduledAt: newStart } : j)
      )
      setReassign({ jobId: job.id, scheduledAt: newStart, job: { ...job, scheduledAt: newStart } })
    } catch {
      revert()
      toast.error("Failed to reschedule job")
    }
  }

  async function handleStripDrop(jobId: string, scheduledAt: string) {
    try {
      await api.patch(`/api/jobs/${jobId}`, { scheduledAt })
      const job = jobs.find((j) => j.id === jobId)
      if (job) {
        setJobs((prev) =>
          prev.map((j) => j.id === jobId ? { ...j, scheduledAt } : j)
        )
        setReassign({ jobId, scheduledAt, job: { ...job, scheduledAt } })
      }
    } catch {
      toast.error("Failed to schedule job")
    }
  }

  function handleReassignSelect(newTechId: string | null) {
    if (newTechId) {
      setJobs((prev) =>
        prev.map((j) => j.id === reassign?.jobId ? { ...j, technicianId: newTechId } : j)
      )
    }
    setReassign(null)
  }

  if (error) return <PageError message={error} onRetry={fetchJobs} />

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {loading && (
        <div style={{ display: "flex", justifyContent: "center", padding: "48px" }}>
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {!loading && (
        <FullCalendar
          ref={calendarRef}
          plugins={[timeGridPlugin, interactionPlugin]}
          initialView="timeGridWeek"
          headerToolbar={{
            left: "prev,next today",
            center: "title",
            right: "timeGridWeek,timeGridDay",
          }}
          events={jobsToEvents(filteredJobs)}
          editable
          droppable
          drop={(info) => {
            const droppedJobId = info.draggedEl.getAttribute("data-job-id")
            if (droppedJobId && info.date) handleStripDrop(droppedJobId, info.date.toISOString())
          }}
          eventDrop={handleEventDrop}
          eventContent={(info) => (
            <CalendarEventCard job={info.event.extendedProps.job as ApiJob} />
          )}
          eventClick={(info) => {
            const job = info.event.extendedProps.job as ApiJob
            // Navigate to job detail — same as clicking a row in jobs table
            window.location.href = `/office/jobs?job=${job.id}`
          }}
          height="auto"
          slotMinTime="07:00:00"
          slotMaxTime="20:00:00"
          allDaySlot={false}
          nowIndicator
        />
      )}

      {!loading && filteredJobs.length === 0 && (
        <div style={{ textAlign: "center", padding: "48px", color: "#64748b" }}>
          No jobs scheduled for this week
        </div>
      )}

      <UnassignedStrip jobs={filteredJobs} />

      {reassign && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50,
          }}
          onClick={() => setReassign(null)}
        >
          <div
            style={{ background: "white", borderRadius: "12px", padding: "24px", width: "400px", maxWidth: "90vw" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: "0 0 16px", fontWeight: 700 }}>Reassign Technician</h3>
            <DispatchSuggestions
              mode="reassign"
              jobId={reassign.jobId}
              equipmentType={reassign.job.equipmentType}
              customerAddress={reassign.job.customer.address}
              scheduledAt={reassign.scheduledAt}
              customerId={reassign.job.customerId}
              priority={reassign.job.priority}
              selectedTechId={reassign.job.technicianId}
              onSelect={handleReassignSelect}
              onSkip={() => setReassign(null)}
              onError={() => setReassign(null)}
            />
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Run all schedule tests to ensure nothing broke**

```bash
cd frontend && npm test -- --reporter=verbose src/components/schedule
```

Expected: all 21 tests pass (9 CalendarEventCard + 5 UnassignedStrip + 7 ScheduleCalendar mapping).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/schedule/ScheduleCalendar.tsx
git commit -m "feat: add ScheduleCalendar component with FullCalendar, drag-drop, and reassignment flow"
```

---

## Chunk 5: Pages and routing

### Task 7: OfficeSchedule page

**Files:**
- Create: `frontend/src/pages/office/OfficeSchedule.tsx`

- [ ] **Step 1: Implement OfficeSchedule**

Create `frontend/src/pages/office/OfficeSchedule.tsx`:

```tsx
import { useState, useEffect } from "react"
import { ScheduleCalendar } from "@/components/schedule/ScheduleCalendar"
import { CreateJobDialog } from "@/components/jobs/create-job-dialog"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { api } from "@/api/client"
import type { ApiTechnician } from "@/api/types"
import { Plus } from "lucide-react"

export default function OfficeSchedule() {
  const [techFilter, setTechFilter] = useState<string | null>(null)
  const [technicians, setTechnicians] = useState<ApiTechnician[]>([])
  const [createDialogOpen, setCreateDialogOpen] = useState(false)

  useEffect(() => {
    api.get<ApiTechnician[]>("/api/technicians").then(setTechnicians).catch(() => {})
  }, [])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Schedule</h1>
          <p className="text-sm text-muted-foreground">Manage and dispatch jobs for the week</p>
        </div>
        <div className="flex items-center gap-3">
          <Select
            value={techFilter ?? "all"}
            onValueChange={(v) => setTechFilter(v === "all" ? null : v)}
          >
            <SelectTrigger className="w-48 h-9">
              <SelectValue placeholder="All Technicians" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Technicians</SelectItem>
              {technicians.map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={() => setCreateDialogOpen(true)}
          >
            <Plus className="h-4 w-4 mr-1" />
            New Job
          </Button>
        </div>
      </div>

      <ScheduleCalendar technicianId={techFilter} />

      <CreateJobDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onCreated={() => {
          setCreateDialogOpen(false)
          window.location.reload()
        }}
      />
    </div>
  )
}
```

- [ ] **Step 2: Add Schedule nav item to sidebar**

In `frontend/src/components/app-sidebar.tsx`, update the `navItems` array:

```tsx
import { LayoutDashboard, Calendar, Wrench, Users, UserCog, MessageSquare, BarChart3, Settings, LogOut } from "lucide-react"

const navItems = [
  { label: "Dashboard", href: "/office", icon: LayoutDashboard },
  { label: "Schedule", href: "/office/schedule", icon: Calendar },  // ADD THIS LINE ONLY
  { label: "Jobs", href: "/office/jobs", icon: Wrench },
  { label: "Technicians", href: "/office/technicians", icon: UserCog },
  { label: "Customers", href: "/office/customers", icon: Users },
  { label: "Messages", href: "/office/messages", icon: MessageSquare },
  { label: "Reports", href: "/office/reports", icon: BarChart3 },  // KEEP — do not remove
]
```

- [ ] **Step 3: Add route to App.tsx**

In `frontend/src/App.tsx`, add the import and route:

```tsx
// Add import with other office imports:
import OfficeSchedule from "./pages/office/OfficeSchedule";

// Add route inside the office <Route> group, after the index route:
<Route path="schedule" element={<OfficeSchedule />} />
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/office/OfficeSchedule.tsx frontend/src/components/app-sidebar.tsx frontend/src/App.tsx
git commit -m "feat: add OfficeSchedule page and Schedule nav item"
```

---

### Task 8: Add List/Calendar toggle to OfficeJobs

**Files:**
- Modify: `frontend/src/pages/office/OfficeJobs.tsx`

- [ ] **Step 1: Add view state and tab switcher**

In `frontend/src/pages/office/OfficeJobs.tsx`:

1. Add import for `ScheduleCalendar`:
```tsx
import { ScheduleCalendar } from "@/components/schedule/ScheduleCalendar"
```

2. Add view state near the top of the component:
```tsx
const [view, setView] = useState<"list" | "calendar">("list")
```

3. Add tab switcher in the toolbar area (where the `+ New Job` button lives), before or after it:
```tsx
<div className="flex bg-muted rounded-lg p-1">
  <button
    type="button"
    onClick={() => setView("list")}
    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
      view === "list" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground"
    }`}
  >
    List
  </button>
  <button
    type="button"
    onClick={() => setView("calendar")}
    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
      view === "calendar" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground"
    }`}
  >
    Calendar
  </button>
</div>
```

4. Conditionally render below the stat cards:
```tsx
{view === "list" ? (
  <JobsTable jobs={jobs} loading={loading} onDelete={handleDelete} />
) : (
  <ScheduleCalendar />
)}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Run all tests to confirm nothing broke**

```bash
cd frontend && npm test
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/office/OfficeJobs.tsx
git commit -m "feat: add List/Calendar toggle to OfficeJobs page"
```

---

## Chunk 6: Final verification

### Task 9: End-to-end smoke test and cleanup

- [ ] **Step 1: Start the dev servers**

```bash
# Terminal 1 — backend
cd backend && npm run dev

# Terminal 2 — frontend
cd frontend && npm run dev
```

- [ ] **Step 2: Verify Schedule page loads**

Open http://localhost:5173, log in as office user, click **Schedule** in the sidebar.

Expected: calendar week view loads, existing seed jobs appear as color-coded event cards.

- [ ] **Step 3: Verify week/day toggle**

Click the **Day** button in the calendar toolbar.

Expected: switches to single-day view showing only today's jobs.

- [ ] **Step 4: Verify technician filter**

Select a specific technician from the filter dropdown.

Expected: only that tech's jobs appear on the calendar.

- [ ] **Step 5: Verify Jobs page toggle**

Click **Jobs** in the sidebar, then click **Calendar** tab.

Expected: same calendar appears embedded in the Jobs page.

- [ ] **Step 6: Verify drag-drop reschedule**

Drag a job card to a different time slot.

Expected: PATCH request fires, reassignment panel opens with tech suggestions.

- [ ] **Step 7: Verify Reports nav item still appears**

Confirm the sidebar still shows Dashboard, Schedule, Jobs, Technicians, Customers, Messages, Reports.

- [ ] **Step 8: Verify sidebar active highlighting for Schedule**

Navigate to `/office/schedule` and confirm the Schedule nav item is highlighted, Dashboard is not.

- [ ] **Step 9: Verify unassigned strip**

If any pending/unassigned jobs exist in seed data, confirm they appear in the strip at the bottom.

- [ ] **Step 10: Run full test suite**

```bash
cd frontend && npm test
```

Expected: all tests pass.

- [ ] **Step 11: Final commit**

```bash
git add -A
git commit -m "feat: complete calendar scheduling view with FullCalendar, drag-drop, and reassignment"
```
