# Predictive Analytics — Design Spec

**Date:** 2026-08-13
**Feature:** Feature 11 of 11 — Predictive Analytics
**Status:** Approved for implementation

---

## Overview

Expand the office dashboard with analytics sections below the existing stats cards and weekly chart. Two goals: (1) business intelligence — revenue and job volume trends, a next-month revenue forecast, and an AI-generated narrative summary; (2) operational intelligence — a rule-based at-risk customer list with AI-generated one-liner reasons per customer. No schema changes required.

---

## Data & API

### No schema changes

All analytics are computed on-demand from existing Job, Invoice, Equipment, and Customer records.

### Two new endpoints (added to `dashboard.ts`)

#### `GET /api/dashboard/analytics/data`

Fast DB-only endpoint (AI is called for `aiReason` per customer, but failures are silent).

**Auth:** `requireAuth + requireSubscription`. Office role enforced inline.

**Response 200:**
```typescript
{
  revenueTrend: { month: string; revenue: number }[]       // last 6 months, e.g. "2026-02"
  jobTrend:     { month: string; jobs: number }[]          // last 6 months completed jobs
  forecast:     { month: string; projectedRevenue: number } // next month, 3-month linear avg
  equipmentBreakdown: { type: string; count: number }[]    // top 5 equipment types, last 6 months
  atRisk: {
    customerId:  string
    name:        string
    address:     string
    flags:       ("overdue_service" | "warranty_expiring" | "no_recent_job")[]
    aiReason:    string | null
  }[]
}
```

**At-risk rules (any one triggers inclusion):**
- `overdue_service` — equipment where `lastServicedAt + serviceIntervalMonths months < today` (only when both fields are set)
- `warranty_expiring` — equipment with `warrantyExpiry` within 90 days from today
- `no_recent_job` — customer with at least 1 completed job in history but no completed job in the last 12 months

Each customer appears at most once in `atRisk` (deduplicated by `customerId`). All flags that apply are included.

`aiReason` is populated by a single Claude call with all at-risk customers in one prompt. If AI is not configured or the call fails, `aiReason` is `null` for all customers.

#### `GET /api/dashboard/analytics/insights`

Calls Claude with the org's 6-month revenue trend, job trend, equipment type breakdown, and at-risk customer count.

**Auth:** same as above.

**Response 200:**
```typescript
{ narrative: string | null }
```

`narrative` is `null` when `ANTHROPIC_API_KEY` is not set or the Claude call fails. The endpoint always returns 200 — callers treat `null` as "unavailable."

---

## Backend

### New file: `backend/src/services/analytics-ai.ts`

```typescript
import Anthropic from "@anthropic-ai/sdk"
import { AI_MODEL } from "../lib/ai-config.js"

const apiKey = process.env.ANTHROPIC_API_KEY
const anthropic = apiKey ? new Anthropic({ apiKey }) : null

export interface AtRiskCustomer {
  customerId: string
  name: string
  flags: string[]
}

export interface AnalyticsTrends {
  revenueTrend: { month: string; revenue: number }[]
  jobTrend: { month: string; jobs: number }[]
  equipmentBreakdown: { type: string; count: number }[]
  atRiskCount: number
}
```

**`getAtRiskReasons(customers: AtRiskCustomer[]): Promise<Record<string, string | null>>`**

- Silent-skip: if `anthropic` is null or `customers` is empty, return `{}` (empty map — callers default missing keys to `null`)
- Builds a prompt listing each customer with their flags, asks Claude for a JSON object mapping `customerId → one-sentence reason`
- Parses the JSON response; on any parse or API failure, logs the error and returns `{}`
- Reason strings should be ≤ 15 words (enforced via prompt instruction)

**`getAnalyticsNarrative(trends: AnalyticsTrends): Promise<string | null>`**

- Silent-skip: if `anthropic` is null, return `null`
- Builds a prompt with revenue trend, job trend, equipment breakdown, and at-risk count
- Returns the text content of Claude's response
- On API failure, logs the error and returns `null`

Both functions instantiate the Anthropic client locally (not imported from a shared module). This follows the established pattern across all AI services in this codebase.

### Modified file: `backend/src/routes/dashboard.ts`

Add two new routes after the existing `/chart` route:

**`dashboardRouter.get("/analytics/data", async (req, res) => { ... })`**

```typescript
// 1. Compute date bounds
const now = new Date()
const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1)
const twelveMonthsAgo = new Date(now)
twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1)
const ninetyDaysFromNow = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000)

// 2. DB queries (all in Promise.all):
//    a. Paid invoices last 6 months (issuedDate >= sixMonthsAgo) → group by month in JS
//    b. Completed jobs last 6 months (completedAt >= sixMonthsAgo) → group by month + equipmentType in JS
//    c. Equipment with lastServicedAt set + serviceIntervalMonths set (for overdue_service)
//    d. Equipment with warrantyExpiry between now and ninetyDaysFromNow (for warranty_expiring)
//    e. Customers with at least 1 completed job but none in last 12 months (for no_recent_job)

// 3. Build revenueTrend, jobTrend, equipmentBreakdown, forecast, atRisk list in JS

// 4. Call getAtRiskReasons for aiReason per customer

// 5. Return combined payload
```

Month grouping: use `YYYY-MM` string format derived from JS Date in the route handler (not raw SQL). Ensures consistent formatting across environments.

Forecast: compute 3-month average of `revenueTrend` (last 3 entries), project as next month. Month label derived from `new Date(now.getFullYear(), now.getMonth() + 1, 1)`.

**`dashboardRouter.get("/analytics/insights", async (req, res) => { ... })`**

Runs the same DB queries as `/analytics/data` to build `AnalyticsTrends`, then calls `getAnalyticsNarrative`. Always returns 200 with `{ narrative }`.

Both routes wrapped in try/catch returning `res.status(500).json({ error: ... })`.

### New file: `backend/src/__tests__/analytics.test.ts`

All route tests use `vi.mock` at top level; service tests use `vi.doMock` + `vi.resetModules` in a separate describe block or separate file if hoisting conflicts arise.

**Tests:**

1. `GET /analytics/data` — returns 200 with correct shape (`revenueTrend`, `jobTrend`, `forecast`, `equipmentBreakdown`, `atRisk`)
2. `GET /analytics/data` — `atRisk` includes customer whose equipment `lastServicedAt + serviceIntervalMonths` is in the past
3. `GET /analytics/data` — `atRisk` includes customer with `warrantyExpiry` within 90 days
4. `GET /analytics/data` — `atRisk` includes customer with completed job history but no job in 12+ months
5. `GET /analytics/data` — customer appears once even when multiple flags apply
6. `GET /analytics/insights` — returns 200 with `{ narrative: "..." }` when AI configured
7. `GET /analytics/insights` — returns 200 with `{ narrative: null }` when `ANTHROPIC_API_KEY` not set
8. `getAtRiskReasons` — returns empty map when `ANTHROPIC_API_KEY` not set
9. `getAnalyticsNarrative` — returns null when `ANTHROPIC_API_KEY` not set

---

## Frontend

### Modified file: `frontend/src/pages/office/OfficeDashboard.tsx`

**Two additional fetch calls on mount** (alongside the existing stats/chart fetches):

```typescript
// Fires immediately with existing calls
const analyticsData = await api.get<AnalyticsData>("/api/dashboard/analytics/data")

// Fires separately — does not block the data render
api.get<{ narrative: string | null }>("/api/dashboard/analytics/insights")
  .then(r => setNarrative(r.narrative))
  .catch(() => setNarrative(null))
```

**New state:**
- `analyticsData: AnalyticsData | null`
- `analyticsLoading: boolean`
- `narrative: string | null | undefined` — `undefined` = still loading, `null` = unavailable/failed

**New sections rendered below the existing weekly chart (in order):**

---

#### Revenue & Job Trends

Two side-by-side `recharts` `LineChart` components inside `ResponsiveContainer`:
- Left: "Revenue (last 6 months)" — X axis = month label, Y axis = dollar amount
- Right: "Jobs Completed (last 6 months)" — X axis = month label, Y axis = count

Below the charts: a single "Next Month Forecast" stat card showing projected revenue with an up (green) or down (red) arrow vs. current month's revenue.

While `analyticsLoading`: show skeleton placeholders at the same height.

---

#### Equipment Type Breakdown

Horizontal `recharts` `BarChart` (single series) showing top 5 equipment types by completed job count over the last 6 months. Rendered as a card with title "Top Equipment Types".

---

#### AI Insights

Always-visible card with a subtle sparkle (✦) icon in the header.

- While `narrative === undefined`: skeleton loader (two lines)
- When `narrative` is a string: paragraph of text
- When `narrative === null`: "AI insights not available — configure your Anthropic API key in Settings."

---

#### At-Risk Customers

Card with title "At-Risk Customers".

Table columns: Customer | Address | Flags | AI Reason

Flag badges (small, rounded):
- `overdue_service` → amber background
- `warranty_expiring` → orange background
- `no_recent_job` → blue background

`aiReason`: shown as small grey text below the flag badges in the same cell. Omitted (cell left empty below badges) if `null`.

If `atRisk` is empty: "No at-risk customers identified."

While `analyticsLoading`: skeleton rows.

---

### New types (inline in `OfficeDashboard.tsx` or `frontend/src/api/types.ts`)

```typescript
interface AnalyticsTrendPoint { month: string; revenue?: number; jobs?: number }
interface EquipmentBreakdownPoint { type: string; count: number }
interface AtRiskCustomer {
  customerId: string
  name: string
  address: string
  flags: ("overdue_service" | "warranty_expiring" | "no_recent_job")[]
  aiReason: string | null
}
interface AnalyticsData {
  revenueTrend: { month: string; revenue: number }[]
  jobTrend: { month: string; jobs: number }[]
  forecast: { month: string; projectedRevenue: number }
  equipmentBreakdown: EquipmentBreakdownPoint[]
  atRisk: AtRiskCustomer[]
}
```

---

## Error States

| Condition | Behaviour |
|---|---|
| `ANTHROPIC_API_KEY` not set | `aiReason: null` for all customers; `narrative: null` → "not available" message |
| Claude call fails | Same as above — silent, no error surfaced to user |
| `/analytics/data` fails | Toast error; analytics sections show "Failed to load" |
| `/analytics/insights` fails | `narrative` set to `null`; "not available" message shown |
| `atRisk` list is empty | Friendly empty state shown, no error |
| recharts not installed | recharts is already used in existing dashboard — no new dependency |

---

## Out of Scope

- Real ML / statistical forecasting models (scikit-learn, etc.)
- Persisting analytics snapshots or caching results
- Exporting analytics as CSV or PDF
- Per-technician performance analytics
- Customer lifetime value scoring
- Push notifications for at-risk customers
- Configurable date ranges for trends
