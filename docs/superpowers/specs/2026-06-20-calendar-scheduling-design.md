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
- New sidebar nav item: **Schedule**, between Dashboard and Jobs
- Full-screen FullCalendar week view — time on the vertical axis, days across the top
- Week/Day toggle in the toolbar (week is default)
- Prev / Next / Today navigation
- Technician filter dropdown (All Technicians or a specific tech)
- **+ New Job** button that opens the existing `CreateJobDialog`

### 2. Jobs Page toggle
- Tab switcher on the existing `OfficeJobs` page: **List** | **Calendar**
- Calendar tab renders the same FullCalendar component, same data source
- Persists the selected view in local state (resets on navigation)

### 3. Job cards (rich density)
Each calendar event renders a custom FullCalendar event component showing:
- Customer name (bold)
- Service address
- Service type (AC Repair, Maintenance, etc.)
- Assigned technician name
- Status badge (Scheduled / En Route / In Progress / Completed)
- Priority indicator: urgent jobs get a red left border and ⚡ label

Color coding by status:
- Scheduled → blue (`#3b82f6`)
- En Route → indigo (`#6366f1`)
- In Progress → green (`#059669`)
- Completed → gray
- Urgent (any status) → red (`#dc2626`)

### 4. Unassigned jobs strip
A persistent strip at the bottom of the calendar showing jobs with no assigned technician. Each pill shows customer name and job type. Urgent unassigned jobs are highlighted red. Dispatcher can drag from the strip onto the calendar to assign time + tech.

### 5. Drag-to-reschedule with reassignment
- Dragging a job to a new time slot updates `scheduledAt` via `PATCH /api/jobs/:id`
- On drop, the existing dispatch suggestions panel opens pre-populated with the new time, allowing the dispatcher to pick the best available technician
- The job is saved with the new time immediately; tech reassignment is a second confirmation step

### 6. Click to open job detail
Clicking any job card opens the existing job detail / edit flow (same as clicking a row in the jobs table).

---

## Architecture

### Frontend

**New files:**
- `frontend/src/pages/office/OfficeSchedule.tsx` — dedicated Schedule page
- `frontend/src/components/schedule/ScheduleCalendar.tsx` — shared FullCalendar wrapper used by both the Schedule page and the Jobs page toggle
- `frontend/src/components/schedule/CalendarEventCard.tsx` — custom event renderer (rich job card)
- `frontend/src/components/schedule/UnassignedStrip.tsx` — bottom strip of unassigned jobs

**Modified files:**
- `frontend/src/pages/office/OfficeJobs.tsx` — add List/Calendar tab switcher
- `frontend/src/pages/office/OfficeLayout.tsx` — add Schedule nav item
- `frontend/src/App.tsx` — add `/office/schedule` route

**Dependencies:**
- `@fullcalendar/react`
- `@fullcalendar/timegrid` (week/day time grid)
- `@fullcalendar/interaction` (drag-and-drop)
- `@fullcalendar/daygrid` (month view, future)

### Backend

No schema changes required. The Job model already has:
- `scheduledAt` — event start time
- `technicianId` — assigned tech
- `status`, `priority`, `equipmentType`, `serviceType` — card display fields

The drag-drop reschedule calls the existing `PATCH /api/jobs/:id` endpoint to update `scheduledAt`. Tech reassignment uses the existing `POST /api/dispatch/suggest` + `PATCH /api/jobs/:id` flow.

A job duration is assumed to be **2 hours** by default (no `duration` field exists yet). This can be made configurable per job type in a future iteration.

---

## Data Flow

```
OfficeSchedule / OfficeJobs (toggle)
  └── ScheduleCalendar
        ├── fetches GET /api/jobs (same as jobs table)
        ├── maps ApiJob[] → FullCalendar EventInput[]
        ├── renders CalendarEventCard per event
        ├── on drag drop → PATCH /api/jobs/:id { scheduledAt }
        │     └── opens DispatchSuggestions panel for reassignment
        └── UnassignedStrip (filters jobs where !technicianId)
```

---

## Error Handling

- If the jobs fetch fails, show the existing `<PageError>` component
- If a drag-drop PATCH fails, revert the event to its original position (FullCalendar supports this via the `revert()` callback) and show a toast error
- If dispatch suggestions fail to load after reschedule, allow the dispatcher to manually assign or skip reassignment

---

## Testing

- Unit test `CalendarEventCard` renders correct fields for each status/priority combination
- Unit test `UnassignedStrip` filters correctly
- Integration test: drag event → PATCH called with new `scheduledAt`
- Integration test: clicking event card opens job detail
- Existing jobs tests unaffected (calendar is additive)

---

## Out of Scope (this iteration)

- Google Calendar sync (future integration)
- Job duration as a configurable field per job type
- Month view
- Technician lane view (tech as primary axis)
- Mobile calendar (technicians use the TechnicianJobs list view)
