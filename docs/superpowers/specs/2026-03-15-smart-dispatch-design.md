# Smart Dispatch Suggestions Design Spec

**Sub-project 4 of 6** in the FlowSense roadmap.

**Goal:** When office staff creates or assigns a job, replace the manual technician dropdown with a ranked suggestion panel that scores technicians by skill match, Google Maps drive time, workload, and customer history — so dispatchers make faster, better-informed assignments.

---

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Intelligence level | Suggestion-only with route-aware hints | Staff retains final say; suggestions surface data they'd otherwise look up manually |
| Location source | Google Maps Distance Matrix API | Real drive times are more accurate than zip-code or straight-line distance; free tier covers 5-15 truck companies easily |
| Skill filtering | Hard filter with fallback | Only show matching techs; if none match, show all with a warning badge to prevent silent misassignment |
| Ranking weights | Skills (gate) → Drive time (0.50) → Workload (0.30) → History (0.20) | Efficiency-first: get the right-skilled, closest, least-loaded tech. History is a tiebreaker for rapport |
| Urgent job override | Drive weight 0.60, workload 0.20, history 0.20 | Urgent jobs prioritize proximity even more aggressively |
| UI surface | Inline ranked panel inside create/edit job dialog | Enhances existing workflow rather than adding a new page; keeps scope tight |
| Fallback (no Maps key) | Score on workload + history only, hide drive time column | Feature still works without external API; drive time is advisory, not required |

---

## Architecture

One new backend service (`dispatch-suggestions.ts`), one new utility module (`google-maps.ts`), one new API endpoint, one new frontend component (`dispatch-suggestions.tsx`), and a modification to the create job dialog.

### Data Flow

```
Office staff opens Create Job dialog
  ↓
Fills in: equipmentType + customer (with address)
  ↓
Frontend calls POST /api/dispatch/suggest
  Body: { equipmentType, customerAddress, scheduledAt, customerId, priority }
  ↓
Backend dispatch-suggestions service:
  1. Fetch all org technicians (including vehicle data) + today's jobs
  2. Hard-filter by skills[] containing equipmentType
     (fallback: include all techs if no match, flag skillMatch: false)
  3. For each tech, resolve "current location":
     - Address of their last scheduled job ending before scheduledAt
     - Or org default address if no prior job
  4. Geocode all origin addresses + destination (with in-memory cache)
  5. Call Google Maps Distance Matrix API (batch: all origins → one destination)
  6. Compute composite score per tech:
     - driveScore: normalized inverse drive time (0–1), weight 0.50
     - workloadScore: normalized inverse job count (0–1), weight 0.30
     - historyBonus: 1.0 if served customer before else 0.0, weight 0.20
     - (Urgent priority: weights shift to 0.60 / 0.20 / 0.20)
  7. Sort descending by score
  ↓
Returns ranked array of DispatchSuggestion objects
  ↓
Frontend renders inline suggestion panel:
  - Each row: avatar initials, name, skill match ✓, drive time, job count, badges
  - Top result gets "BEST MATCH" badge
  - Repeat customers get "Returning" badge
  - Click a row → technicianId is set in the form
  ↓
Office staff reviews suggestions, clicks to select (or skips to manual dropdown)
  ↓
Proceeds with normal job creation: POST /api/jobs with selected technicianId
```

### Fallback (no Google Maps API key)

```
Same flow, but:
  - Steps 3–5 skipped (no geocoding, no distance matrix)
  - driveMinutes: null for all techs
  - Score computed from workload + history only (re-weighted to 0.60 / 0.40)
  - Frontend hides the drive time column
  - Response includes driveTimesAvailable: false
```

---

## Backend — Google Maps Module

### New file: `backend/src/services/google-maps.ts`

Two functions wrapping the Google Maps REST APIs via `fetch`. No SDK dependency needed.

**`geocodeAddress(address: string): Promise<{ lat: number, lng: number } | null>`**

- Calls `https://maps.googleapis.com/maps/api/geocode/json?address=<encoded>&key=<key>`
- Returns `{ lat, lng }` from the first result, or `null` on failure (bad address, API error, no key)
- **Caching:** Module-level `Map<string, { lat: number, lng: number }>` stores successful geocode results for the server lifetime. Customer addresses rarely change, so this eliminates redundant API calls.
- If `GOOGLE_MAPS_API_KEY` is not set, returns `null` immediately without logging (checked once at module load, same pattern as Anthropic key)

**`getDriveTimesMatrix(origins: { lat: number, lng: number }[], destination: { lat: number, lng: number }): Promise<(number | null)[]>`**

- Calls `https://maps.googleapis.com/maps/api/distancematrix/json` with all origins and one destination
- Returns array of drive times in minutes (one per origin), `null` for any pair that failed
- Uses `mode=driving` and `departure_time=now` for traffic-aware estimates
- If API key is not set or origins array is empty, returns array of nulls
- 10-second timeout on the fetch call

**Environment variable:** `GOOGLE_MAPS_API_KEY` — optional. If missing, both functions return null. Startup log: `[GoogleMaps] Skipped — no GOOGLE_MAPS_API_KEY set`

---

## Backend — Dispatch Suggestion Service

### New file: `backend/src/services/dispatch-suggestions.ts`

**Public API:**

```ts
interface DispatchRequest {
  equipmentType: string
  customerAddress: string
  scheduledAt: string      // ISO date string
  customerId: string
  priority: string         // "low" | "normal" | "high" | "urgent"
  organizationId: string
}

interface DispatchSuggestion {
  technician: {
    id: string
    name: string
    skills: string[]
    vehicle: { id: string; name: string } | null
  }
  score: number              // 0–1, higher = better match
  driveMinutes: number | null // null if geocoding/Maps unavailable
  todayJobCount: number
  servedCustomerBefore: boolean
  skillMatch: boolean        // false only in fallback mode
}

interface DispatchResult {
  suggestions: DispatchSuggestion[]
  fallbackMode: boolean       // true when no tech had skill match
  driveTimesAvailable: boolean // false when Google Maps unavailable or errored
}

function rankTechnicians(request: DispatchRequest): Promise<DispatchResult>
```

**Implementation steps:**

1. **Fetch technicians:** `prisma.technician.findMany({ where: { organizationId }, include: { vehicle: true } })` — all org technicians, including their vehicle relation (which may be `null` for techs without an assigned vehicle). Technicians without vehicles are still included in suggestions — vehicle assignment is informational, not a dispatch requirement.

2. **Fetch today's jobs:** `prisma.job.findMany({ where: { organizationId, scheduledAt between start/end of scheduledAt's day, status not cancelled/completed }, include: { customer: true } })` — to compute workload per tech and resolve each tech's "current location"

3. **Skill filter:** Keep techs whose `skills[]` includes `equipmentType`. If the filtered list is empty, use the full list and set `fallbackMode: true`, marking each suggestion's `skillMatch: false`.

4. **Resolve tech locations:** For each tech, find their last job (by `scheduledAt`) ending before the requested `scheduledAt`. Use that job's customer address as the tech's origin. If no prior job exists, the tech gets `driveMinutes: null` and receives the worst drive score (`0`). **Known limitation:** Newly hired techs with no job history will rank lower on the drive component even if they are physically closest. This is acceptable for MVP — the dispatcher can see the null drive time and use judgment.

5. **Geocode + Distance Matrix:** Call `geocodeAddress` for each unique origin address and the destination customer address. Then call `getDriveTimesMatrix` with all origin coordinates and the destination coordinate. If any step fails, set `driveTimesAvailable: false` and proceed without drive times.

6. **Customer history:** Batch query: `prisma.job.groupBy({ by: ["technicianId"], where: { customerId, status: "completed", technicianId: { in: techIds } }, _count: true })`. Any tech with `_count > 0` gets `servedCustomerBefore: true`.

7. **Score computation:** For each tech:
   - `driveScore`: If drive times available, normalize: `1 - (driveMinutes / maxDriveMinutes)`. If `driveMinutes` is null for this tech (geocoding failed for their address), treat as `0` (worst score). If no drive times at all, this component is excluded.
   - `workloadScore`: `1 - (todayJobCount / maxJobCount)`. If all techs have 0 jobs, all get `1.0`.
   - `historyBonus`: `1.0` if `servedCustomerBefore`, else `0.0`.
   - Weights when drive times available: `drive: 0.50, workload: 0.30, history: 0.20`. For `urgent` priority: `drive: 0.60, workload: 0.20, history: 0.20`.
   - Weights when drive times unavailable: `workload: 0.60, history: 0.40`. For `urgent` priority: same (no drive data to boost).
   - Final: `score = driveScore * driveWeight + workloadScore * workloadWeight + historyBonus * historyWeight`

8. **Sort and return:** Sort `suggestions` descending by `score`. Return full `DispatchResult`.

**Error handling:** Entire function wrapped in try/catch. On error, log and return `{ suggestions: [], fallbackMode: false, driveTimesAvailable: false }` — the frontend will fall back to the manual dropdown.

---

## Backend — API Endpoint

### New route: `POST /api/dispatch/suggest`

Added to a new route file `backend/src/routes/dispatch.ts`, mounted at `/api/dispatch` in the Express app.

**Why a separate route file:** Dispatch is a distinct domain from job CRUD. Keeps `jobs.ts` from growing further.

**Request body (validated with Zod):**
```ts
const dispatchSuggestSchema = z.object({
  equipmentType: z.string().min(1),
  customerAddress: z.string().min(1),
  scheduledAt: z.string().datetime(),
  customerId: z.string().min(1),
  priority: z.enum(["low", "normal", "high", "urgent"]),
})
```

Matches the validation patterns in `jobs.ts` (`createJobSchema` uses `z.string().datetime()` and `z.enum()` for the same fields).

**Handler:**
1. `requireAuth` middleware (inherited from router)
2. Role guard: `req.user!.role === "customer"` → 403
3. Validate body with Zod → 400 on failure
4. Call `rankTechnicians({ ...body, organizationId: req.user!.organizationId })`
5. Return 200 with the `DispatchResult`

**Registration:** In `backend/src/index.ts` (or wherever routes are mounted), add:
```ts
import { dispatchRouter } from "./routes/dispatch.js"
app.use("/api/dispatch", requireAuth, dispatchRouter)
```

---

## Frontend — Dispatch Suggestion Panel

### New file: `frontend/src/components/jobs/dispatch-suggestions.tsx`

A component that replaces the technician dropdown inside the Create Job dialog when sufficient context is available.

**Props:**
```ts
interface DispatchSuggestionsProps {
  equipmentType: string | null
  customerAddress: string | null
  scheduledAt: string | null
  customerId: string | null
  priority: string
  selectedTechId: string | null
  onSelect: (technicianId: string | null) => void
  onSkip: () => void    // called when user clicks "Skip suggestions" — parent hides panel, shows dropdown
  onError: () => void   // called when API fetch fails — parent hides panel, shows dropdown as fallback
}
```

**Component states:**

| State | Condition | What renders |
|-------|-----------|-------------|
| Idle | `equipmentType` or `customerId` is null | Muted placeholder: "Select equipment type and customer to see technician suggestions" |
| Loading | API call in flight | 3 skeleton rows with shimmer animation (matching result row height) |
| Results | Suggestions returned, `fallbackMode: false` | Ranked tech rows with scores, drive times, badges |
| Fallback | Suggestions returned, `fallbackMode: true` | Warning banner ("⚠️ No techs with [equipmentType] skills — showing all available") + ranked rows with `skillMatch: false` indicator |
| Degraded | Suggestions returned, `driveTimesAvailable: false` | Same as Results but drive time column hidden; info note: "Drive times unavailable" |
| Empty | Suggestions returned, empty array | "No technicians available" message |
| Error | API call failed | Toast via Sonner, calls `onError()` so parent hides panel and shows the original plain `<Select>` dropdown as manual fallback |

**Row layout (per suggestion):**
- Avatar circle with initials (colored by index)
- Tech name (bold)
- Skill match checkmark: `✓ Furnace` (green) or `⚠ No [type] skill` (red, fallback only)
- Drive time: `🚗 12 min` (hidden in degraded mode)
- Today's workload: `📋 2 jobs today`
- Badges: `BEST MATCH` (green, top result only), `Returning` (amber, if `servedCustomerBefore`)
- Score: `Score: 92` (right-aligned, muted) — displayed as `Math.round(score * 100)`

**Interaction:**
- Click a row → highlights it (blue border + checkmark), calls `onSelect(technician.id)`
- Click the same row again → deselects, calls `onSelect(null)`
- "Skip suggestions" link at bottom → calls `onSkip()` so parent hides this panel and shows the original dropdown

**API call triggers:**
- Fires when both `equipmentType` and `customerId` are set
- Re-fires when either value changes
- Debounced by 300ms to avoid rapid calls while user is still selecting options
- Aborts previous in-flight request when a new one fires (via `AbortController`)

### Modified file: `frontend/src/components/jobs/create-job-dialog.tsx`

**Changes:**

1. Add state: `const [showSuggestions, setShowSuggestions] = useState(true)`
2. Derive `customerAddress` from the selected customer: look up the customer in the already-fetched `customers` array and concatenate `${customer.address}, ${customer.city}, ${customer.state} ${customer.postalCode}` (e.g., `"123 Main St, Denver, CO 80202"`). Full address gives Google Maps Geocoding the best accuracy.
3. Conditionally render: if `showSuggestions` is true, show `<DispatchSuggestions>` in place of the technician `<Select>`. Otherwise, show the original `<Select>`.
4. When `DispatchSuggestions` calls `onSelect(techId)`, update the form's `technicianId` value
5. Wire `onSkip` to set `showSuggestions` to false, revealing the original dropdown
6. Wire `onError` to set `showSuggestions` to false (same effect — fallback to manual)
7. When `equipmentType` or `customerId` changes while suggestions are hidden, reset `showSuggestions` to true (re-show suggestions with new context)

The form's submit handler is unchanged — it still sends `technicianId` to `POST /api/jobs` regardless of whether it was selected via suggestions or manual dropdown.

---

## Seed Data

### Modified file: `backend/prisma/seed.ts`

The existing seed data already includes 3 technicians and 3 customers with different skills and addresses, which is sufficient to demonstrate dispatch ranking:

| Technician | Skills | Vehicle |
|-----------|--------|---------|
| `seed-tech-1` Jordan Smith | furnace, ac, heat-pump | Truck 1 (`seed-vehicle-1`) |
| `seed-tech-2` Maria Garcia | ac, heat-pump | **None** (needs adding) |
| `seed-tech-3` Tyler Brooks | furnace | **None** (needs adding) |

| Customer | Address |
|----------|---------|
| `seed-customer-1` Acme Residence | 123 Main St, Denver, CO 80202 |
| `seed-customer-2` Sunrise Office Park | 456 Commerce Blvd, Boulder, CO 80301 |
| `seed-customer-3` Pine Valley HOA | 789 Pine Ridge Dr, Lakewood, CO 80226 |

**Changes needed:**

1. **Add vehicles for `seed-tech-2` and `seed-tech-3`** — dispatch shows vehicle info in suggestion rows:
   ```ts
   await prisma.vehicle.upsert({
     where: { id: "seed-vehicle-2" },
     create: { id: "seed-vehicle-2", organizationId: org.id, technicianId: "seed-tech-2", name: "Van 2" },
     update: {},
   })
   await prisma.vehicle.upsert({
     where: { id: "seed-vehicle-3" },
     create: { id: "seed-vehicle-3", organizationId: org.id, technicianId: "seed-tech-3", name: "Van 3" },
     update: {},
   })
   ```

2. **Add a scheduled job for `seed-tech-2`** so the demo shows workload variation and a prior location for drive time calculation:
   ```ts
   await prisma.job.upsert({
     where: { id: "seed-job-dispatch-demo" },
     create: {
       id: "seed-job-dispatch-demo",
       organizationId: org.id,
       customerId: "seed-customer-2",
       technicianId: "seed-tech-2",
       status: "scheduled",
       scheduledAt: new Date(/* earlier today */),
       symptomSummary: "AC unit making noise during operation",
       equipmentType: "ac",
       priority: "normal",
     },
     update: {},
   })
   ```

This gives the dispatch demo: Jordan (3 skills, 1 existing job, has vehicle), Maria (2 skills, 1 existing job, now has vehicle), Tyler (1 skill, 0 jobs, now has vehicle) — spread across Denver, Boulder, and Lakewood addresses for drive-time variation.

---

## Testing

### New file: `backend/src/__tests__/google-maps.test.ts`

Tests for the Google Maps utility module:

1. **geocodeAddress returns lat/lng on success** — mock `fetch` to return a valid geocoding response, verify correct coordinates extracted
2. **geocodeAddress returns null on bad address** — mock zero-results response, verify null returned
3. **geocodeAddress returns null when API key missing** — verify no fetch call made, null returned
4. **geocodeAddress caches results** — call twice with same address, verify fetch called only once
5. **getDriveTimesMatrix returns minutes array** — mock Distance Matrix response with multiple origins, verify correct minutes extracted for each
6. **getDriveTimesMatrix returns null for failed pairs** — mock mixed response (some OK, some ZERO_RESULTS), verify nulls in correct positions
7. **getDriveTimesMatrix returns nulls when API key missing** — verify no fetch call made, returns array of nulls matching origins length

### New file: `backend/src/__tests__/dispatch-suggestions.test.ts`

Tests for the dispatch suggestion service:

1. **Returns only skill-matched techs** — two techs, one with matching skill, verify only matching tech returned with `skillMatch: true`
2. **Fallback mode when no skill match** — two techs, neither has matching skill, verify both returned with `fallbackMode: true` and `skillMatch: false`
3. **Score computation with drive times** — mock Google Maps responses, verify scores computed correctly with 50/30/20 weights
4. **Urgent priority shifts weights** — same setup as above but with `priority: "urgent"`, verify drive weight increases to 0.60
5. **Graceful degradation without Google Maps** — no API key set, verify scores computed from workload + history only, `driveTimesAvailable: false`
6. **Customer history detection** — tech with completed job for this customer gets `servedCustomerBefore: true` and history bonus
7. **Empty org returns empty array** — no technicians, verify empty suggestions with no error
8. **Drive time null for one tech** — one tech's address fails geocoding, verify they get `driveMinutes: null` and lowest drive score

### New file: `backend/src/__tests__/dispatch-endpoint.test.ts`

Tests for the API endpoint:

1. **200 with ranked suggestions** — valid request returns suggestions array sorted by score
2. **403 for customer role** — customer user gets 403
3. **400 for missing required fields** — request without equipmentType returns 400
4. **Org scoping** — only returns techs from the requesting user's org

### New file: `frontend/src/components/jobs/__tests__/dispatch-suggestions.test.tsx`

Frontend component tests:

1. **Shows placeholder when inputs incomplete** — render with null equipmentType, verify placeholder text
2. **Shows loading skeleton during fetch** — render with valid inputs, verify skeleton before response
3. **Renders ranked suggestions** — mock API response, verify tech names, scores, drive times, badges rendered
4. **Click to select** — click a suggestion row, verify `onSelect` called with tech ID
5. **Fallback warning banner** — mock response with `fallbackMode: true`, verify warning banner rendered
6. **Skip suggestions** — click "Skip suggestions", verify callback fired
7. **Error falls back gracefully** — mock API error, verify toast shown

---

## File Map

### New Files
| File | Purpose |
|------|---------|
| `backend/src/services/google-maps.ts` | Geocoding + Distance Matrix utility with caching |
| `backend/src/services/dispatch-suggestions.ts` | Technician ranking service |
| `backend/src/routes/dispatch.ts` | `POST /api/dispatch/suggest` endpoint |
| `backend/src/__tests__/google-maps.test.ts` | Google Maps module tests |
| `backend/src/__tests__/dispatch-suggestions.test.ts` | Dispatch service tests |
| `backend/src/__tests__/dispatch-endpoint.test.ts` | Endpoint tests |
| `frontend/src/components/jobs/dispatch-suggestions.tsx` | Suggestion panel component |
| `frontend/src/components/jobs/__tests__/dispatch-suggestions.test.tsx` | Frontend component tests |

### Modified Files
| File | Changes |
|------|---------|
| `backend/src/index.ts` | Mount dispatch router at `/api/dispatch` |
| `backend/prisma/seed.ts` | Add vehicles for seed-tech-2/3, add dispatch demo job |
| `frontend/src/components/jobs/create-job-dialog.tsx` | Replace technician dropdown with suggestion panel (conditionally) |
| `frontend/src/api/types.ts` | Add `DispatchSuggestion` and `DispatchResult` response types |

---

## Out of Scope

- Dedicated dispatch board / drag-and-drop view (future enhancement)
- Bulk route optimization for a full day's schedule
- Real-time technician GPS tracking (would require mobile app changes)
- Time-slot conflict detection (would need calendar view)
- Technician availability / shift management
- Push notifications to technicians on assignment
- Distance Matrix caching (traffic varies; always fetch fresh)
- Geocoding of org default address (techs without prior jobs get null drive time)
