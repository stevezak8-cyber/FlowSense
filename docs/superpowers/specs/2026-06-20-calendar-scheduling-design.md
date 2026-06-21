# Calendar & Scheduling View — Design Spec

**Date:** 2026-06-20
**Status:** Approved

---

## Overview

Add a dispatcher-facing calendar view to FlowSense using FullCalendar. The calendar gives office dispatchers a visual, time-based view of the week's jobs with drag-to-reschedule and reassignment built in. It is accessible from two places: a dedicated **Schedule** page in the sidebar nav, and a **List / Calendar toggle** on the existing Jobs page.

---

## User & Context

**Primary user:** Office dispatcher at a $1M/yr HVAC or plumbing company.

**Daily workflow:** Plan the week ahead, then react to emergency calls day-by-day. Needs to see the full week at a glance, zoom into a single day when things get busy, and quickly reassign techs when jobs move.

---

## Features

### 1. Schedule Page (dedicated)
- New sidebar nav item: **Schedule**, inserted after Dashboard and before Jobs in `OfficeLayout.tsx`'s nav array/JSX
- Full-screen FullCalendar week view — time on the vertical axis, days across the top
- Week/Day toggle in the toolbar (week is default)
- Prev / Next / Today navigation
- Technician filter dropdown (All Technicians or a specific tech)
- **+ New Job** button that opens the existing `CreateJobDialog`
- Route: `/office/schedule` — wrapped in the same role-protected `OfficeLayout` that guards all `/office/*` routes (no additional guard needed)

### 2. Jobs Page toggle
- Tab switcher on the existing `OfficeJobs` page: **List** | **Calendar**
- Calendar tab renders the same `ScheduleCalendar` component, same data source
- Persists the selected view in local component state (resets on navigation)

### 3. Job cards (rich density)
Each calendar event renders a custom FullCalendar event component (`CalendarEventCard`) showing:
- Customer name (bold)
- Service address
- Service type (AC Repair, Maintenance, etc.)
- Assigned technician name
- Status badge
- Priority indicator: urgent jobs get a red left border and ⚡ label

Color coding by status (status values are snake_case strings from the backend):
- `scheduled` → blue (`#3b82f6`)
- `en_route` → indigo (`#6366f1`)
- `in_progress` → green (`#059669`)
- `completed` → gray (`#6b7280`)
- `cancelled` → gray (`#6b7280`)
- `pending` → slate (`#94a3b8`)
- Urgent override (any status where `priority === "urgent"`) → red (`#dc2626`)

### 4. Unassigned jobs strip
A persistent strip at the bottom of the calendar showing jobs where `technicianId` is null or undefined. Each pill shows customer name and job type. Urgent unassigned jobs are highlighted red.

**Drag from strip onto calendar:**
When a pill is dropped onto a time slot:
1. `PATCH /api/jobs/:id { scheduledAt: <dropped time> }` is called immediately
2. The `DispatchSuggestions` panel opens in "reassignment mode" (see section 5) pre-populated with the new `scheduledAt` and the job's existing data
3. On tech selection, `PATCH /api/jobs/:id { technicianId }` is called
4. The job moves from the unassigned strip onto the calendar grid

### 5. Drag-to-reschedule with reassignment

**Existing calendar events:**
1. Dispatcher drags a job card to a new time slot
2. On drop: `PATCH /api/jobs/:id { scheduledAt: <new time> }` is called immediately
3. The `DispatchSuggestions` panel opens in "reassignment mode" with the updated job context
4. On tech selection: `PATCH /api/jobs/:id { technicianId }` is called
5. If the PATCH in step 2 fails: FullCalendar's `revert()` callback restores the event to its original position and a toast error is shown
6. The dispatcher can dismiss the suggestions panel without reassigning (tech stays the same)

**DispatchSuggestions in reassignment mode:**
The existing `DispatchSuggestions` component (currently used inside `CreateJobDialog`) needs a new usage mode: it accepts a `jobId` prop and a `scheduledAt` prop, fetches suggestions for that job, and on selection calls `PATCH /api/jobs/:id { technicianId }` rather than setting form state. A `mode="reassign"` prop (or equivalent) controls this behavior. No structural changes to the component — just a new prop path.

### 6. Click to open job detail
Clicking any job card opens the existing job detail / edit flow (same as clicking a row in the jobs table).

### 7. Loading and empty states
- While jobs are fetching: render a centered `<Loader2>` spinner (matches existing page patterns)
- If the filtered week has zero jobs: render a centered empty state message ("No jobs scheduled for this week")
- Both states render inside the calendar container so the toolbar remains visible

---

## Architecture

### Frontend

**New files:**
- `frontend/src/pages/office/OfficeSchedule.tsx` — dedicated Schedule page (toolbar + `ScheduleCalendar`)
- `frontend/src/components/schedule/ScheduleCalendar.tsx` — shared FullCalendar wrapper used by both the Schedule page and the Jobs page toggle
- `frontend/src/components/schedule/CalendarEventCard.tsx` — custom event renderer (rich job card)
- `frontend/src/components/schedule/UnassignedStrip.tsx` — bottom strip for unassigned jobs

**Modified files:**
- `frontend/src/pages/office/OfficeJobs.tsx` — add List/Calendar tab switcher
- `frontend/src/pages/office/OfficeLayout.tsx` — add Schedule nav item after Dashboard, before Jobs
- `frontend/src/App.tsx` — add `/office/schedule` route inside the existing office route group
- `frontend/src/components/jobs/dispatch-suggestions.tsx` — add `mode="reassign"` prop path

**Dependencies:**
- `@fullcalendar/react`
- `@fullcalendar/timegrid` (week/day time grid)
- `@fullcalendar/interaction` (drag-and-drop)

### Backend

**No schema changes required.** The Job model already has all needed fields:
- `scheduledAt` — event start time
- `technicianId` — assigned tech
- `status` (`pending | scheduled | en_route | in_progress | completed | cancelled`)
- `priority`, `equipmentType`, `serviceType` — card display fields

**Event duration:** No `duration` field exists on the Job model. All events are mapped with a fixed 2-hour duration: `end = new Date(scheduledAt.getTime() + 2 * 60 * 60 * 1000)`. This is applied in the `ApiJob[] → EventInput[]` mapping in `ScheduleCalendar.tsx`. Configurable duration per job type is out of scope for this iteration.

**API query scope:** `GET /api/jobs` returns all jobs for the organization (no pagination today). For the calendar this is acceptable in the short term — a company with ~50 active jobs will not hit performance issues. If job volume grows, add `?from=&to=` date range params to the endpoint in a future iteration.

**Existing endpoints used:**
- `GET /api/jobs` — fetch all jobs for the calendar
- `GET /api/technicians` — populate the tech filter dropdown
- `PATCH /api/jobs/:id` — update `scheduledAt` and/or `technicianId` on drag-drop
- `POST /api/dispatch/suggest` — fetch tech suggestions in the reassignment panel

---

## Data Flow

```
OfficeSchedule / OfficeJobs (toggle)
  └── ScheduleCalendar
        ├── GET /api/jobs → ApiJob[]
        ├── maps ApiJob[] → EventInput[] (end = scheduledAt + 2h)
        ├── renders CalendarEventCard per event
        ├── UnassignedStrip (filters jobs where !technicianId)
        ├── on calendar event drop:
        │     ├── PATCH /api/jobs/:id { scheduledAt }
        │     └── opens DispatchSuggestions (mode="reassign")
        │           └── on tech select → PATCH /api/jobs/:id { technicianId }
        └── on strip pill drop onto calendar:
              ├── PATCH /api/jobs/:id { scheduledAt }
              └── opens DispatchSuggestions (mode="reassign")
                    └── on tech select → PATCH /api/jobs/:id { technicianId }
```

---

## Error Handling

- Jobs fetch failure → `<PageError>` component with retry
- Drag-drop `PATCH` failure → FullCalendar `revert()` restores position + toast error
- Dispatch suggestions fetch failure → panel shows error state; dispatcher can dismiss and manually assign later via the job detail view
- Strip drag-drop `PATCH` failure → toast error; job remains in the unassigned strip

---

## Testing

- Unit: `CalendarEventCard` renders correct color/badge for each `status` value and the urgent priority override
- Unit: `UnassignedStrip` filters correctly (excludes jobs with `technicianId` set)
- Unit: `ApiJob[] → EventInput[]` mapping sets `end` = `scheduledAt + 2h`
- Integration: drag calendar event → `PATCH /api/jobs/:id` called with new `scheduledAt`
- Integration: clicking event card opens job detail
- Existing jobs table tests unaffected (calendar is additive)

---

## Out of Scope (this iteration)

- Google Calendar sync (future integration)
- Job duration as a configurable field per job type
- Date-range filtering on `GET /api/jobs`
- Month view
- Technician lane view (tech as primary axis)
- Mobile calendar (technicians use the TechnicianJobs list view)
