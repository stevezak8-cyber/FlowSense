# Sub-project 1: Core Workflow Completion

**Date:** 2026-03-14
**Status:** Approved
**Goal:** Fix every broken link in the end-to-end HVAC service workflow so the full lifecycle works: customer books → office dispatches → technician completes → invoice generated → customer notified.

## Context

FlowSense is an HVAC business operating system targeting 5-15 truck companies. The core CRUD layer (jobs, technicians, customers, invoices, conversations) works, but several critical workflow connections are broken. AI features (the product differentiator) will be layered on in subsequent sub-projects — this sub-project establishes the foundation they depend on.

**Sub-project sequence:**
1. **Core Workflow Completion** ← this spec
2. Pre-Arrival Intelligence
3. Auto Job Documentation
4. Smart Dispatch Suggestions
5. Customer AI Concierge
6. UI Polish Pass

## The End-to-End Flow

```
Customer fills booking form
  → POST /api/jobs (status: "pending")
  → Email: booking confirmation to customer
  → WebSocket: "New booking" toast to office users

Office assigns technician
  → PATCH /api/jobs/:id (technicianId + status: "scheduled")
  → WebSocket: "New job assigned" toast to technician

Technician taps "En Route"
  → PATCH /api/jobs/:id (status: "en_route")
  → Email: "Tech is on the way" to customer
  → WebSocket: toast to office + customer

Technician taps "In Progress"
  → PATCH /api/jobs/:id (status: "in_progress")
  → WebSocket: toast to office + customer

Technician taps "Completed"
  → PATCH /api/jobs/:id (status: "completed")
  → Prisma transaction: update job + create invoice
  → Email: "Job complete + invoice" to customer
  → WebSocket: toast to office + customer
```

## What's Broken Today

- Customer booking form exists but doesn't call the API
- No `pending` status — jobs start as `scheduled`, skipping intake
- Job completion doesn't trigger invoice creation
- No auth middleware — API endpoints are unprotected
- Org ID hardcoded as `"default-org"` in every route file instead of reading from JWT
- JWT secret hardcoded with a dev default
- CORS hardcoded to `localhost:5173`
- Technician profile page is incomplete
- No git repository initialized

## What Already Works

- Job CRUD with status transitions (scheduled → en_route → in_progress → completed)
- Office dashboard with stats, charts, technician status
- Technician job cards with status workflow buttons
- Invoice CRUD (manual creation)
- Customer dashboard showing jobs and invoices
- Authentication (login, JWT, role-based routing)
- Messaging/conversations
- Technician route mapping (Leaflet + Nominatim)
- Revenue reporting (Recharts)

---

## Design

### 1. Auth Middleware

**File:** `backend/src/middleware/auth.ts`

A single middleware function that:
- Extracts Bearer token from the Authorization header
- Verifies against `process.env.JWT_SECRET` (required env var, no fallback)
- Attaches `req.user = { userId, role, organizationId }` to the request
- Returns 401 with `{ error: "Unauthorized" }` if missing or invalid

**Applied to:** All routes except `POST /api/auth/login` and `GET /health`.

**Route file changes:** Every route file replaces `const ORG_ID = "default-org"` with `req.user.organizationId`.

**Frontend changes:** Update `api/client.ts` to handle 401 responses globally — clear token from localStorage, redirect to login page.

### 2. Environment Configuration

Move hardcoded values to environment variables:

| Variable | Purpose | Required |
|----------|---------|----------|
| `JWT_SECRET` | Token signing key | Yes (no default) |
| `DATABASE_URL` | PostgreSQL connection | Yes |
| `CORS_ORIGIN` | Allowed frontend origin | Yes (e.g., `http://localhost:5173`) |
| `RESEND_API_KEY` | Email delivery | No (emails silently skipped if missing) |
| `PORT` | Server port | No (defaults to 4000) |

Update `.env.example` with all variables documented.

### 3. Job Status Workflow Update

Add `pending` to the status enum in the Prisma schema.

**Allowed transitions:**
- `pending` → `scheduled` (office assigns technician)
- `scheduled` → `en_route` (tech starts travel)
- `en_route` → `in_progress` (tech arrives)
- `in_progress` → `completed` (tech finishes)
- Any status → `cancelled` (office cancels)

The `PATCH /api/jobs/:id` endpoint validates that the requested status transition is allowed. Invalid transitions return 400 with a clear error message.

### 4. Customer Booking → API Connection

**Frontend (`CustomerBook` component):**
- On form submit, call `POST /api/jobs` with:
  - `status: "pending"`
  - `customerId` from auth context
  - `equipmentType` mapped from service type selection
  - `symptomSummary` mapped from description field
  - `scheduledAt` from date + time selection
  - `priority` from priority selection
- Show success confirmation with job reference number
- Redirect to customer dashboard

**Backend (`POST /api/jobs`):**
- Accept jobs without a `technicianId` (null for pending jobs)
- Validate with Zod, create with `status: "pending"`

### 5. Auto-Invoice on Job Completion

When `PATCH /api/jobs/:id` transitions status to `completed`:

- Use a Prisma transaction to atomically:
  1. Update job status to `completed`, set `completedAt` to current timestamp
  2. Create an Invoice record with:
     - `jobId`, `customerId`, `organizationId` from the job
     - `description`: "Service completed — [equipmentType]"
     - `amount`: `0.00` (office fills in actual amount later)
     - `status`: `"pending"`
     - `issuedDate`: current date
     - `dueDate`: current date + 30 days

- If either operation fails, both roll back.

### 6. WebSocket Notifications

**Backend:**
- Add `ws` package to Express server on the same port (upgrade path)
- Authenticate WebSocket connections: client sends JWT on connect, server verifies and maps `userId → socket`
- `backend/src/services/notifications.ts` exposes:
  - `notifyInApp(userId: string, event: NotificationEvent)` — sends to connected socket
  - `broadcastToRole(organizationId: string, role: string, event: NotificationEvent)` — sends to all connected users with that role in that org

**Frontend:**
- `frontend/src/lib/websocket.ts` — WebSocket client module:
  - Connects after auth, sends JWT for authentication
  - Auto-reconnects with exponential backoff (1s, 2s, 4s, max 30s)
  - Exposes `useNotifications()` React hook
- Toast notifications rendered via Sonner (already installed)

**Notification events:**

| Event | Recipients | Message |
|-------|-----------|---------|
| `job.created` | Office users | "New booking from [customer name]" |
| `job.assigned` | Assigned technician | "New job assigned: [equipment type] at [address]" |
| `job.status_changed` | Office + customer | "[Tech name] is en route / has started / completed" |
| `job.completed` | Office + customer | "Job completed — invoice ready" |

### 7. Email Integration

**Service:** Resend (free tier: 100 emails/day)

**File:** `backend/src/services/email.ts` — thin wrapper around Resend SDK

**Behavior:**
- Fire-and-forget: don't block API responses on email delivery
- Log failures server-side but never fail the request
- If `RESEND_API_KEY` is not set, skip silently (dev mode works without email)

**Templates** (simple HTML, stored in `backend/src/templates/`):

1. **Booking Confirmation** — Triggered on `job.created`
   - To: customer email
   - Content: date/time, equipment type, symptom summary, reference number

2. **Job Status Update** — Triggered on status → `en_route`
   - To: customer email
   - Content: technician name, job details

3. **Job Completed + Invoice** — Triggered on status → `completed`
   - To: customer email
   - Content: work summary, invoice amount, due date

### 8. Technician Profile Page

Complete the existing stub at `/technician/profile`:
- Display and edit: name, phone, email, EPA 608 level, skills
- Show assigned vehicle info (read-only)
- Job history summary: completed jobs count, this month's stats
- Uses `GET /api/technicians/:id` and `PATCH /api/technicians/:id`
- Technician ID resolved from the authenticated user's linked technician record

### 9. Git Repository Initialization

- `git init` in project root
- Create `.gitignore` covering: `node_modules/`, `.env`, `dist/`, `*.log`, `.claude/`
- Initial commit with current state

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Auth failure (invalid/missing token) | 401 → frontend clears token, redirects to login |
| Validation error (bad input) | 400 with field-level Zod error messages, displayed inline on forms |
| Invalid status transition | 400 with message explaining allowed transitions |
| WebSocket disconnect | Client auto-reconnects with exponential backoff (1s, 2s, 4s, max 30s) |
| Email delivery failure | Logged server-side, never blocks API response |
| Invoice auto-creation failure | Prisma transaction rolls back job status change too; user sees error, can retry |

## Testing Strategy

**Backend (Vitest):**
- Auth middleware: rejects missing/invalid tokens, attaches correct user
- Job status transitions: validates allowed transitions, rejects invalid ones
- Auto-invoice creation: invoice created in transaction, rollback on failure
- Booking endpoint: validates fields, creates pending job

**Frontend (Vitest + React Testing Library):**
- Booking form: submits correct payload, shows success, handles errors
- WebSocket reconnection: connects, receives events, reconnects on disconnect
- Auth flow: redirects on 401, clears stale tokens

**Not in scope for Sub-project 1:**
- E2E tests (deferred to UI polish phase)
- Exhaustive CRUD endpoint tests (patterns are repetitive)
- Email delivery tests (mock Resend, verify template + data)

## Explicitly Out of Scope

- AI features (separate sub-projects 2-5)
- Offline support / service workers
- API rate limiting
- List pagination (adequate for 5-15 truck operations)
- Audit logging beyond existing compliance logs
- React Email templates (upgrade during UI polish)
- SMS notifications (email only in this phase)

## Implementation Review Checkpoints

Each area is built and reviewed with the user before moving to the next:

1. **Git init + environment config** — verify repo and env vars
2. **Auth middleware + org scoping** — verify protected routes, JWT-based org ID
3. **Job status workflow** — verify `pending` status, valid transitions
4. **Customer booking → API** — verify form submits, job created as pending
5. **Auto-invoice on completion** — verify transaction, invoice created
6. **WebSocket notifications** — verify real-time toasts across roles
7. **Email integration** — verify Resend sends correct templates
8. **Technician profile** — verify display/edit, job history
9. **Testing** — verify all tests pass
