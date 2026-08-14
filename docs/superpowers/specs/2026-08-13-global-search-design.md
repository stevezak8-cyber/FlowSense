# Global Search — Design Spec

**Date:** 2026-08-13
**Feature:** Global search across jobs, customers, and equipment — instant results dropdown with inline preview panel
**Status:** Approved for implementation

---

## Overview

Office staff can search across all their data from the existing search input in the top header. As they type (debounced 300 ms), a dropdown appears grouped by entity type (Customers, Jobs, Equipment). Clicking a result opens an inline preview panel on the right side of the screen without navigating away. The preview shows the entity's key details, recent jobs where applicable, and a "View Full Profile" button that navigates to the relevant page. Keyboard navigation (↑↓ / Enter / Esc) is supported.

Search is office-only — technicians do not use the header layout and are not in scope.

---

## Backend

### New file: `backend/src/routes/search.ts`

Single endpoint:

**`GET /api/search?q=`** — requires JWT auth. Returns 403 if `req.user.role !== "office"` — technicians and customers are not in scope.

Query parameter:
- `q` — the search string. Return 400 if missing or fewer than 2 characters.

Response shape:
```typescript
{
  jobs: SearchJob[]
  customers: SearchCustomer[]
  equipment: SearchEquipment[]
}
```

Type definitions:
```typescript
interface SearchJob {
  id: string
  status: string
  scheduledAt: string
  equipmentType: string | null
  symptomSummary: string | null
  customer: { id: string; name: string; address: string }
  assignedTechnician: { name: string } | null
}

interface SearchCustomer {
  id: string
  name: string
  phone: string
  address: string
  email: string | null
}

interface SearchEquipment {
  id: string
  equipmentType: string
  make: string | null
  model: string | null
  serialNumber: string | null
  customer: { id: string; name: string }
}
```

Implementation:
1. Validate `q` — return 400 if missing or `q.trim().length < 2`
2. Run three Prisma queries in `Promise.all`, all scoped to `req.user.organizationId`:

```typescript
// Jobs — search symptomSummary, equipmentType, serviceType, actionsTaken, customer name
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
    id: true, status: true, scheduledAt: true,
    equipmentType: true, symptomSummary: true,
    customer: { select: { id: true, name: true, address: true } },
    technician: { select: { name: true } },
  },
  take: 5,
  orderBy: { scheduledAt: "desc" },
})

// Customers — search name, phone, address, email
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
})

// Equipment — search equipmentType, make, model, serialNumber, customer name
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
    id: true, equipmentType: true, make: true, model: true, serialNumber: true,
    customer: { select: { id: true, name: true } },
  },
  take: 5,
  orderBy: { createdAt: "desc" },
})
```

3. Return `{ jobs, customers, equipment }` — any category with zero results returns an empty array.

### Mount in `backend/src/index.ts`

```typescript
import { searchRouter } from "./routes/search.js"
app.use("/api/search", requireAuth, searchRouter)
```

### Tests: `backend/src/__tests__/search.test.ts`

5 tests:
1. Returns 400 for `q` shorter than 2 characters
2. Returns empty arrays for no matches
3. Returns matching customers by name
4. Returns matching jobs by equipment type
5. Results are scoped to the requesting org (another org's record not returned)

---

## Frontend

### New file: `frontend/src/components/search/GlobalSearch.tsx`

A self-contained component that owns the search input, dropdown, and preview panel. Replaces the existing static `<Input>` in `TopHeader`.

**State:**
- `query: string` — current input value
- `results: SearchResults | null` — API response
- `loading: boolean`
- `open: boolean` — dropdown visible
- `selectedIndex: number` — keyboard nav cursor (-1 = none)
- `preview: SearchPreviewItem | null` — currently previewed entity

**Debounce:** 300 ms after the last keystroke. If `query.trim().length < 2`, clear results and close dropdown.

**Search flow:**
1. User types in input
2. After 300 ms debounce, `GET /api/search?q={query}`
3. Results grouped into Customers / Jobs / Equipment sections in the dropdown
4. Clicking a result sets `preview` and closes the dropdown
5. Preview panel shows entity details; "View Full Profile" navigates via `useNavigate`

**Keyboard navigation:**
- `ArrowDown` / `ArrowUp` — move `selectedIndex` through the flat list of all results
- `Enter` — open preview for selected result
- `Escape` — close dropdown (first press) or preview panel (second press)

**Click outside:** `useEffect` with a `mousedown` listener on `document` closes both dropdown and preview.

**Preview panel content by entity type:**

*Customer preview:*
- Name, phone, email, address
- "View Full Customer Profile" → navigates to `/office/customers`
- No recent-jobs list — `GET /api/jobs` does not support a `customerId` filter for office users, and no new endpoint will be added for this

*Job preview:*
- Status badge, scheduled date, equipment type, symptom summary, assigned technician name, customer name
- "View Job" → navigates to `/office/jobs`

*Equipment preview:*
- Equipment type, make, model, serial number, customer name
- "View Customer" → navigates to `/office/customers`

**Navigation targets:** the app has no entity-specific detail routes (no `/office/customers/:id`, no `/office/jobs/:id`). Navigating to the list page is correct — the full detail view lives in the expanded row on those pages.

**Flat-list keyboard nav ordering:** when the user presses ↑/↓, the cursor moves through results in this order: all Customers first, then all Jobs, then all Equipment — matching the visual grouping in the dropdown.

### Modified file: `frontend/src/components/top-header.tsx`

Replace the static `<Input>` with `<GlobalSearch />`.

### New file: `frontend/src/api/types.ts` additions

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

---

## Error States

| Condition | Behaviour |
|---|---|
| `q` < 2 characters | No request sent; dropdown closes |
| Network error during search | Dropdown shows "Search unavailable" message; no toast |
| No results across all categories | Dropdown shows "No results for '{query}'" |
| API returns 400 | Treated as empty results |

---

## Out of Scope

- Technician-facing search
- Search history / recent searches
- Fuzzy / typo-tolerant matching
- Highlighting matched text in results
- Pagination beyond 5 results per category
- Searching invoices or conversations
- Saved searches or filters
