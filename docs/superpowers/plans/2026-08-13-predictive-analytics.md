# Predictive Analytics Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the office dashboard with business intelligence (revenue/job trends, forecast, AI narrative) and operational intelligence (rule-based at-risk customer list with AI one-liner reasons).

**Architecture:** Two new backend endpoints on `dashboardRouter` — `/analytics/data` (fast DB + silent AI) and `/analytics/insights` (AI narrative). A new `analytics-ai.ts` service handles all Claude calls. The frontend adds analytics sections below the existing weekly chart in `OfficeDashboard.tsx`, with `/analytics/data` in the existing `Promise.all` and `/analytics/insights` firing async separately.

**Tech Stack:** Express/Prisma/PostgreSQL (backend), React/TypeScript/recharts (frontend), Anthropic claude-haiku (AI), vitest/supertest (tests)

---

## Chunk 1: Backend service + tests

### Task 1: analytics-ai.ts service

**Files:**
- Create: `backend/src/services/analytics-ai.ts`
- Create: `backend/src/__tests__/analytics-service.test.ts`

**Context:**
- Follow the exact AI service pattern in `backend/src/services/concierge-ai.ts`: local `const anthropic = apiKey ? new Anthropic({ apiKey }) : null`
- `AI_MODEL` is imported from `backend/src/lib/ai-config.ts` (exports `export const AI_MODEL = "claude-haiku-4-20250514"`)
- Silent-skip: return null/empty-map if `anthropic` is null — never throw
- Service tests use `vi.doMock` + `vi.resetModules` to avoid hoisting issues

- [ ] **Step 1: Write the failing service tests**

Create `backend/src/__tests__/analytics-service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest"

describe("analytics-ai service", () => {
  beforeEach(() => {
    vi.resetModules()
    delete process.env.ANTHROPIC_API_KEY
  })

  it("getAtRiskReasons returns empty map when ANTHROPIC_API_KEY not set", async () => {
    vi.doMock("@anthropic-ai/sdk", () => ({ default: vi.fn() }))
    const { getAtRiskReasons } = await import("../services/analytics-ai.js")
    const result = await getAtRiskReasons([
      { customerId: "c1", name: "Alice", flags: ["overdue_service"] },
    ])
    expect(result).toEqual({})
  })

  it("getAtRiskReasons returns empty map when customers array is empty", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key"
    vi.doMock("@anthropic-ai/sdk", () => ({
      default: vi.fn().mockImplementation(() => ({})),
    }))
    const { getAtRiskReasons } = await import("../services/analytics-ai.js")
    const result = await getAtRiskReasons([])
    expect(result).toEqual({})
  })

  it("getAnalyticsNarrative returns null when ANTHROPIC_API_KEY not set", async () => {
    vi.doMock("@anthropic-ai/sdk", () => ({ default: vi.fn() }))
    const { getAnalyticsNarrative } = await import("../services/analytics-ai.js")
    const result = await getAnalyticsNarrative({
      revenueTrend: [],
      jobTrend: [],
      equipmentBreakdown: [],
      atRiskCount: 0,
    })
    expect(result).toBeNull()
  })

  it("getAtRiskReasons returns empty map on API failure", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key"
    vi.doMock("@anthropic-ai/sdk", () => ({
      default: vi.fn().mockImplementation(() => ({
        messages: {
          create: vi.fn().mockRejectedValue(new Error("API error")),
        },
      })),
    }))
    const { getAtRiskReasons } = await import("../services/analytics-ai.js")
    const result = await getAtRiskReasons([
      { customerId: "c1", name: "Alice", flags: ["overdue_service"] },
    ])
    expect(result).toEqual({})
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && npx vitest run src/__tests__/analytics-service.test.ts
```

Expected: FAIL — "Cannot find module '../services/analytics-ai.js'"

- [ ] **Step 3: Create analytics-ai.ts**

Create `backend/src/services/analytics-ai.ts`:

```typescript
import Anthropic from "@anthropic-ai/sdk"
import { AI_MODEL } from "../lib/ai-config.js"

const apiKey = process.env.ANTHROPIC_API_KEY
if (!apiKey) console.log("[AnalyticsAI] Skipped — no ANTHROPIC_API_KEY set")
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

export async function getAtRiskReasons(
  customers: AtRiskCustomer[]
): Promise<Record<string, string | null>> {
  if (!anthropic || customers.length === 0) return {}

  try {
    const customerList = customers
      .map((c) => `- ID: ${c.customerId}, Name: ${c.name}, Flags: ${c.flags.join(", ")}`)
      .join("\n")

    const response = await anthropic.messages.create({
      model: AI_MODEL,
      max_tokens: 512,
      messages: [
        {
          role: "user",
          content: `You are an HVAC business assistant. For each at-risk customer below, write a one-sentence reason (≤15 words) explaining why they are at risk. Return ONLY a JSON object mapping customerId to reason string.

Customers:
${customerList}

Return format: {"customerId1": "reason here", "customerId2": "reason here"}
Return ONLY the JSON object, no other text.`,
        },
      ],
    })

    const text = response.content[0].type === "text" ? response.content[0].text : ""
    const parsed = JSON.parse(text) as Record<string, string>
    return parsed
  } catch (e) {
    console.error("[AnalyticsAI] getAtRiskReasons failed:", e)
    return {}
  }
}

export async function getAnalyticsNarrative(
  trends: AnalyticsTrends
): Promise<string | null> {
  if (!anthropic) return null

  try {
    const revenueLines = trends.revenueTrend
      .map((r) => `  ${r.month}: $${r.revenue.toFixed(2)}`)
      .join("\n")
    const jobLines = trends.jobTrend
      .map((j) => `  ${j.month}: ${j.jobs} jobs`)
      .join("\n")
    const equipLines = trends.equipmentBreakdown
      .map((e) => `  ${e.type}: ${e.count} jobs`)
      .join("\n")

    const response = await anthropic.messages.create({
      model: AI_MODEL,
      max_tokens: 300,
      messages: [
        {
          role: "user",
          content: `You are an HVAC business analyst. Write a 3-5 sentence narrative summary of this HVAC company's recent performance. Be specific, mention actual numbers, and highlight what's notable. Do not mention that you are an AI.

Revenue (last 6 months):
${revenueLines || "  No data"}

Jobs completed (last 6 months):
${jobLines || "  No data"}

Top equipment types:
${equipLines || "  No data"}

At-risk customers: ${trends.atRiskCount}`,
        },
      ],
    })

    const text = response.content[0].type === "text" ? response.content[0].text : null
    return text
  } catch (e) {
    console.error("[AnalyticsAI] getAnalyticsNarrative failed:", e)
    return null
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && npx vitest run src/__tests__/analytics-service.test.ts
```

Expected: PASS — 4 tests

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/analytics-ai.ts backend/src/__tests__/analytics-service.test.ts
git commit -m "feat: add analytics-ai service with getAtRiskReasons and getAnalyticsNarrative"
```

---

## Chunk 2: Backend routes + tests

### Task 2: Analytics routes in dashboard.ts

**Files:**
- Modify: `backend/src/routes/dashboard.ts`
- Create: `backend/src/__tests__/analytics-routes.test.ts`

**Context:**
- Route tests use top-level `vi.mock` (NOT `vi.doMock`) — see `backend/src/__tests__/concierge-route.test.ts` for the pattern
- `dashboardRouter` is already mounted at `/api/dashboard` in `index.ts` with `requireAuth` and `requireSubscription` — these are already applied. Add inline office role check at the top of each new handler.
- The helper `getAnalyticsTrends` lives in `dashboard.ts` (not `analytics-ai.ts`) — it's a local function, not exported
- Month strings: manual format `` `${year}-${String(month + 1).padStart(2, "0")}` ``
- Forecast: average last 3 months of `revenueTrend`; if <3 entries average all; if empty return 0

- [ ] **Step 1: Write the failing route tests**

Create `backend/src/__tests__/analytics-routes.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    invoice: { findMany: vi.fn() },
    job: { findMany: vi.fn() },
    equipment: { findMany: vi.fn(), count: vi.fn() },
    customer: { findMany: vi.fn(), count: vi.fn() },
  },
}))

vi.mock("../services/analytics-ai.js", () => ({
  getAtRiskReasons: vi.fn().mockResolvedValue({}),
  getAnalyticsNarrative: vi.fn().mockResolvedValue("Business is trending upward this quarter."),
}))

import request from "supertest"
import express from "express"
import { dashboardRouter } from "../routes/dashboard.js"
import { prisma } from "../lib/prisma.js"
import { getAtRiskReasons, getAnalyticsNarrative } from "../services/analytics-ai.js"

const mockPrisma = prisma as unknown as {
  invoice: { findMany: ReturnType<typeof vi.fn> }
  job: { findMany: ReturnType<typeof vi.fn> }
  equipment: { findMany: ReturnType<typeof vi.fn>; count: ReturnType<typeof vi.fn> }
  customer: { findMany: ReturnType<typeof vi.fn>; count: ReturnType<typeof vi.fn> }
}

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    ;(req as express.Request & { user: unknown }).user = {
      organizationId: "org1",
      role: "office",
    }
    next()
  })
  app.use("/", dashboardRouter)
  return app
}

function setupDefaultMocks() {
  mockPrisma.invoice.findMany.mockResolvedValue([])
  mockPrisma.job.findMany.mockResolvedValue([])
  mockPrisma.equipment.findMany.mockResolvedValue([])
  mockPrisma.equipment.count.mockResolvedValue(0)
  mockPrisma.customer.findMany.mockResolvedValue([])
  mockPrisma.customer.count.mockResolvedValue(0)
}

describe("GET /analytics/data", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupDefaultMocks()
  })

  it("returns 200 with correct shape", async () => {
    const res = await request(makeApp()).get("/analytics/data")
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty("revenueTrend")
    expect(res.body).toHaveProperty("jobTrend")
    expect(res.body).toHaveProperty("forecast")
    expect(res.body).toHaveProperty("equipmentBreakdown")
    expect(res.body).toHaveProperty("atRisk")
    expect(Array.isArray(res.body.revenueTrend)).toBe(true)
    expect(Array.isArray(res.body.jobTrend)).toBe(true)
    expect(Array.isArray(res.body.atRisk)).toBe(true)
  })

  it("atRisk includes customer with overdue equipment (lastServicedAt + serviceIntervalMonths in the past)", async () => {
    const pastDate = new Date()
    pastDate.setMonth(pastDate.getMonth() - 24) // serviced 24 months ago
    mockPrisma.equipment.findMany.mockImplementation((args: { where?: { warrantyExpiry?: unknown; lastServicedAt?: unknown; serviceIntervalMonths?: unknown } }) => {
      // overdue query: lastServicedAt not null + serviceIntervalMonths not null
      if (args?.where?.lastServicedAt && args?.where?.serviceIntervalMonths) {
        return Promise.resolve([
          {
            id: "eq1",
            customerId: "cust1",
            lastServicedAt: pastDate,
            serviceIntervalMonths: 12,
            customer: { id: "cust1", name: "Bob", address: "123 Main St" },
          },
        ])
      }
      return Promise.resolve([])
    })
    const res = await request(makeApp()).get("/analytics/data")
    expect(res.status).toBe(200)
    const atRisk = res.body.atRisk as Array<{ customerId: string; flags: string[] }>
    const customer = atRisk.find((c) => c.customerId === "cust1")
    expect(customer).toBeDefined()
    expect(customer?.flags).toContain("overdue_service")
  })

  it("atRisk includes customer with warrantyExpiry within 90 days", async () => {
    const soonDate = new Date()
    soonDate.setDate(soonDate.getDate() + 30)
    mockPrisma.equipment.findMany.mockImplementation((args: { where?: { warrantyExpiry?: unknown; lastServicedAt?: unknown } }) => {
      if (args?.where?.warrantyExpiry) {
        return Promise.resolve([
          {
            id: "eq2",
            customerId: "cust2",
            warrantyExpiry: soonDate,
            customer: { id: "cust2", name: "Carol", address: "456 Oak Ave" },
          },
        ])
      }
      return Promise.resolve([])
    })
    const res = await request(makeApp()).get("/analytics/data")
    expect(res.status).toBe(200)
    const atRisk = res.body.atRisk as Array<{ customerId: string; flags: string[] }>
    const customer = atRisk.find((c) => c.customerId === "cust2")
    expect(customer).toBeDefined()
    expect(customer?.flags).toContain("warranty_expiring")
  })

  it("atRisk includes customer with no completed job in 12+ months", async () => {
    mockPrisma.customer.findMany.mockResolvedValue([
      { id: "cust3", name: "Dave", address: "789 Pine Rd" },
    ])
    const res = await request(makeApp()).get("/analytics/data")
    expect(res.status).toBe(200)
    const atRisk = res.body.atRisk as Array<{ customerId: string; flags: string[] }>
    const customer = atRisk.find((c) => c.customerId === "cust3")
    expect(customer).toBeDefined()
    expect(customer?.flags).toContain("no_recent_job")
  })

  it("customer appears once even when multiple flags apply", async () => {
    const pastDate = new Date()
    pastDate.setMonth(pastDate.getMonth() - 24)
    const soonDate = new Date()
    soonDate.setDate(soonDate.getDate() + 30)
    mockPrisma.equipment.findMany.mockResolvedValue([
      {
        id: "eq3",
        customerId: "cust4",
        lastServicedAt: pastDate,
        serviceIntervalMonths: 12,
        warrantyExpiry: soonDate,
        customer: { id: "cust4", name: "Eve", address: "101 Elm St" },
      },
    ])
    const res = await request(makeApp()).get("/analytics/data")
    expect(res.status).toBe(200)
    const atRisk = res.body.atRisk as Array<{ customerId: string }>
    const matches = atRisk.filter((c) => c.customerId === "cust4")
    expect(matches.length).toBe(1)
  })

  it("equipment with null lastServicedAt does NOT trigger overdue_service", async () => {
    mockPrisma.equipment.findMany.mockResolvedValue([])
    const res = await request(makeApp()).get("/analytics/data")
    expect(res.status).toBe(200)
    expect(res.body.atRisk).toEqual([])
  })

  it("forecast.projectedRevenue averages 2 available months when only 2 months of data exist", async () => {
    const now = new Date()
    const m1 = new Date(now.getFullYear(), now.getMonth() - 1, 15)
    const m2 = new Date(now.getFullYear(), now.getMonth() - 2, 15)
    mockPrisma.invoice.findMany.mockResolvedValue([
      { issuedDate: m1, amount: 1000 },
      { issuedDate: m2, amount: 2000 },
    ])
    const res = await request(makeApp()).get("/analytics/data")
    expect(res.status).toBe(200)
    // average of 1000 and 2000 = 1500
    expect(res.body.forecast.projectedRevenue).toBeCloseTo(1500, 0)
  })

  it("forecast.projectedRevenue is 0 when revenueTrend is empty", async () => {
    mockPrisma.invoice.findMany.mockResolvedValue([])
    const res = await request(makeApp()).get("/analytics/data")
    expect(res.status).toBe(200)
    expect(res.body.forecast.projectedRevenue).toBe(0)
  })
})

describe("GET /analytics/insights", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupDefaultMocks()
  })

  it("returns 200 with narrative string when AI configured", async () => {
    ;(getAnalyticsNarrative as ReturnType<typeof vi.fn>).mockResolvedValue("Revenue is trending upward.")
    const res = await request(makeApp()).get("/analytics/insights")
    expect(res.status).toBe(200)
    expect(typeof res.body.narrative).toBe("string")
  })

  it("returns 200 with narrative null when AI not configured", async () => {
    ;(getAnalyticsNarrative as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    const res = await request(makeApp()).get("/analytics/insights")
    expect(res.status).toBe(200)
    expect(res.body.narrative).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && npx vitest run src/__tests__/analytics-routes.test.ts
```

Expected: FAIL — routes don't exist yet

- [ ] **Step 3: Add getAnalyticsTrends helper and two routes to dashboard.ts**

Add to `backend/src/routes/dashboard.ts` — append after the existing `/chart` route. First add the import at the top:

```typescript
import { getAtRiskReasons, getAnalyticsNarrative } from "../services/analytics-ai.js"
import type { AnalyticsTrends } from "../services/analytics-ai.js"
```

Then add the helper function (NOT exported — local to dashboard.ts):

```typescript
async function getAnalyticsTrends(
  organizationId: string,
  sixMonthsAgo: Date
): Promise<AnalyticsTrends> {
  const twelveMonthsAgo = new Date()
  twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1)

  const [invoices, completedJobs, overdueCount, warrantyCount, noRecentJobCount] = await Promise.all([
    prisma.invoice.findMany({
      where: {
        organizationId,
        status: "paid",
        issuedDate: { gte: sixMonthsAgo },
      },
      select: { issuedDate: true, amount: true },
    }),
    prisma.job.findMany({
      where: {
        organizationId,
        status: "completed",
        completedAt: { gte: sixMonthsAgo },
      },
      select: { completedAt: true, equipmentType: true },
    }),
    // Counts equipment that has a service interval set (not confirmed overdue —
    // actual due-date check happens in JS in the route handler). Used as an
    // approximation for the AI narrative count only.
    prisma.equipment.count({
      where: {
        organizationId,
        lastServicedAt: { not: null },
        serviceIntervalMonths: { not: null },
      },
    }),
    prisma.equipment.count({
      where: {
        organizationId,
        warrantyExpiry: {
          gte: new Date(),
          lte: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
        },
      },
    }),
    prisma.customer.count({
      where: {
        organizationId,
        jobs: {
          some: { status: "completed" },
          none: { status: "completed", completedAt: { gte: twelveMonthsAgo } },
        },
      },
    }),
  ])

  // Group invoices by month
  const revenueMap = new Map<string, number>()
  for (const inv of invoices) {
    const d = new Date(inv.issuedDate)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    revenueMap.set(key, (revenueMap.get(key) ?? 0) + inv.amount)
  }
  const revenueTrend = Array.from(revenueMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, revenue]) => ({ month, revenue }))

  // Group jobs by month
  const jobMap = new Map<string, number>()
  const equipMap = new Map<string, number>()
  for (const job of completedJobs) {
    if (job.completedAt) {
      const d = new Date(job.completedAt)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
      jobMap.set(key, (jobMap.get(key) ?? 0) + 1)
    }
    if (job.equipmentType) {
      equipMap.set(job.equipmentType, (equipMap.get(job.equipmentType) ?? 0) + 1)
    }
  }
  const jobTrend = Array.from(jobMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, jobs]) => ({ month, jobs }))
  const equipmentBreakdown = Array.from(equipMap.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([type, count]) => ({ type, count }))

  const atRiskCount = overdueCount + warrantyCount + noRecentJobCount

  return { revenueTrend, jobTrend, equipmentBreakdown, atRiskCount }
}
```

Then add the two routes:

```typescript
// GET /api/dashboard/analytics/data
dashboardRouter.get("/analytics/data", async (req, res) => {
  if (req.user!.role !== "office") return res.status(403).json({ error: "Forbidden" })
  try {
    const now = new Date()
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1)
    const twelveMonthsAgo = new Date(now)
    twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1)
    const ninetyDaysFromNow = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000)
    const orgId = req.user!.organizationId

    const [trends, overdueEquipment, warrantyEquipment, noRecentJobCustomers] =
      await Promise.all([
        getAnalyticsTrends(orgId, sixMonthsAgo),
        // Full detail: overdue equipment
        prisma.equipment.findMany({
          where: {
            organizationId: orgId,
            lastServicedAt: { not: null },
            serviceIntervalMonths: { not: null },
          },
          select: {
            customerId: true,
            lastServicedAt: true,
            serviceIntervalMonths: true,
            customer: { select: { id: true, name: true, address: true } },
          },
        }),
        // Full detail: warranty expiring
        prisma.equipment.findMany({
          where: {
            organizationId: orgId,
            warrantyExpiry: { gte: now, lte: ninetyDaysFromNow },
          },
          select: {
            customerId: true,
            customer: { select: { id: true, name: true, address: true } },
          },
        }),
        // Customers with past completed jobs but none in last 12 months
        prisma.customer.findMany({
          where: {
            organizationId: orgId,
            jobs: {
              some: { status: "completed" },
              none: { status: "completed", completedAt: { gte: twelveMonthsAgo } },
            },
          },
          select: { id: true, name: true, address: true },
        }),
      ])

    // Compute forecast
    const { revenueTrend, jobTrend, equipmentBreakdown } = trends
    const forecastEntries = revenueTrend.slice(-3)
    const projectedRevenue =
      forecastEntries.length === 0
        ? 0
        : forecastEntries.reduce((sum, e) => sum + e.revenue, 0) / forecastEntries.length
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    const forecastMonth = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, "0")}`

    // Build at-risk map (deduplicated by customerId)
    const atRiskMap = new Map<
      string,
      { customerId: string; name: string; address: string; flags: string[] }
    >()

    const addFlag = (
      customerId: string,
      name: string,
      address: string,
      flag: string
    ) => {
      const existing = atRiskMap.get(customerId)
      if (existing) {
        if (!existing.flags.includes(flag)) existing.flags.push(flag)
      } else {
        atRiskMap.set(customerId, { customerId, name, address, flags: [flag] })
      }
    }

    for (const eq of overdueEquipment) {
      if (!eq.lastServicedAt || !eq.serviceIntervalMonths) continue
      const dueDate = new Date(eq.lastServicedAt)
      dueDate.setMonth(dueDate.getMonth() + eq.serviceIntervalMonths)
      if (dueDate < now) {
        addFlag(eq.customerId, eq.customer.name, eq.customer.address, "overdue_service")
      }
    }
    for (const eq of warrantyEquipment) {
      addFlag(eq.customerId, eq.customer.name, eq.customer.address, "warranty_expiring")
    }
    for (const c of noRecentJobCustomers) {
      addFlag(c.id, c.name, c.address, "no_recent_job")
    }

    const atRiskList = Array.from(atRiskMap.values())

    // AI reasons (silent, one call for all customers)
    const reasons = await getAtRiskReasons(
      atRiskList.map((c) => ({ customerId: c.customerId, name: c.name, flags: c.flags }))
    )
    const atRisk = atRiskList.map((c) => ({
      ...c,
      aiReason: reasons[c.customerId] ?? null,
    }))

    res.json({
      revenueTrend,
      jobTrend,
      forecast: { month: forecastMonth, projectedRevenue },
      equipmentBreakdown,
      atRisk,
    })
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Failed to get analytics" })
  }
})

// GET /api/dashboard/analytics/insights
dashboardRouter.get("/analytics/insights", async (req, res) => {
  if (req.user!.role !== "office") return res.status(403).json({ error: "Forbidden" })
  try {
    const now = new Date()
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1)
    const trends = await getAnalyticsTrends(req.user!.organizationId, sixMonthsAgo)
    // Note: trends.atRiskCount is an approximation (may overcount customers with
    // multiple flags). Acceptable for a narrative summary — not a precise report.
    const narrative = await getAnalyticsNarrative(trends)
    res.json({ narrative })
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Failed to get insights" })
  }
})
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && npx vitest run src/__tests__/analytics-routes.test.ts
```

Expected: PASS — 10 tests

- [ ] **Step 5: Run full test suite to check for regressions**

```bash
cd backend && npx vitest run
```

Expected: all tests pass

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/dashboard.ts backend/src/__tests__/analytics-routes.test.ts
git commit -m "feat: add analytics/data and analytics/insights endpoints to dashboardRouter"
```

---

## Chunk 3: Frontend

### Task 3: Analytics sections in OfficeDashboard.tsx + frontend types

**Files:**
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/pages/office/OfficeDashboard.tsx`

**Context:**
- `recharts` is already installed and used. `LineChart`, `Line`, `BarChart`, `Bar`, `XAxis`, `YAxis`, `CartesianGrid`, `Tooltip`, `ResponsiveContainer` are all available from `recharts`.
- The existing dashboard uses `Promise.all` in `fetchAll` callback — add the analytics data fetch to that same array.
- `narrative` state is `string | null | undefined`: `undefined` = loading, `null` = unavailable, `string` = ready.
- The insights fetch fires separately (not in the `Promise.all`) so charts render without waiting for AI.
- Skeleton: use a `<div className="h-4 bg-muted rounded animate-pulse" />` pattern for loading states.
- Dollar formatting: `$${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` or simpler `$${amount.toFixed(0)}` for chart labels.

- [ ] **Step 1: Add new types to frontend/src/api/types.ts**

Append to `frontend/src/api/types.ts`:

```typescript
export interface EquipmentBreakdownPoint {
  type: string
  count: number
}

export interface AtRiskCustomer {
  customerId: string
  name: string
  address: string
  flags: ("overdue_service" | "warranty_expiring" | "no_recent_job")[]
  aiReason: string | null
}

export interface AnalyticsData {
  revenueTrend: { month: string; revenue: number }[]
  jobTrend: { month: string; jobs: number }[]
  forecast: { month: string; projectedRevenue: number }
  equipmentBreakdown: EquipmentBreakdownPoint[]
  atRisk: AtRiskCustomer[]
}
```

- [ ] **Step 2: Update OfficeDashboard.tsx with new state, fetching, and sections**

Replace `OfficeDashboard.tsx` with the full updated file. Key changes from the current version:

1. Add imports for recharts and new types
2. Add `analyticsData`, `analyticsLoading`, `narrative` state
3. Add `analyticsData` fetch to `Promise.all` in `fetchAll`; fire insights fetch separately
4. Add four new sections below the existing `<RecentJobs>` component

Full replacement content for `frontend/src/pages/office/OfficeDashboard.tsx`:

```tsx
import { useState, useEffect, useCallback } from "react"
import { api } from "@/api/client"
import type {
  DashboardStats,
  ChartDataPoint,
  ApiJob,
  ApiTechnician,
  AnalyticsData,
} from "@/api/types"
import { StatCards } from "@/components/dashboard/stat-cards"
import { RecentJobs } from "@/components/dashboard/recent-jobs"
import { TechStatus } from "@/components/dashboard/tech-status"
import { JobChart } from "@/components/dashboard/job-chart"
import { CreateJobDialog } from "@/components/jobs/create-job-dialog"
import { AddTechnicianDialog } from "@/components/technicians/add-technician-dialog"
import { AddCustomerDialog } from "@/components/customers/add-customer-dialog"
import { MaintenanceDueWidget } from "@/components/equipment/MaintenanceDueWidget"
import { RecurringDraftsWidget } from "@/components/recurring-jobs/RecurringDraftsWidget"
import { PageError } from "@/components/page-error"
import { Button } from "@/components/ui/button"
import { Link } from "react-router-dom"
import { Loader2, Wrench, UserX, TrendingUp, TrendingDown } from "lucide-react"
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts"

export default function OfficeDashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [chartData, setChartData] = useState<ChartDataPoint[]>([])
  const [jobs, setJobs] = useState<ApiJob[]>([])
  const [technicians, setTechnicians] = useState<ApiTechnician[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [jobDialogOpen, setJobDialogOpen] = useState(false)
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(true)
  const [narrative, setNarrative] = useState<string | null | undefined>(undefined)

  const fetchAll = useCallback(() => {
    setLoading(true)
    setAnalyticsLoading(true)
    setError(null)
    setNarrative(undefined)

    Promise.all([
      api.get<DashboardStats>("/api/dashboard/stats"),
      api.get<ChartDataPoint[]>("/api/dashboard/chart"),
      api.get<ApiJob[]>("/api/jobs"),
      api.get<ApiTechnician[]>("/api/technicians"),
      api.get<AnalyticsData>("/api/dashboard/analytics/data"),
    ])
      .then(([s, c, j, t, a]) => {
        setStats(s)
        setChartData(c)
        setJobs(j)
        setTechnicians(t)
        setAnalyticsData(a)
      })
      .catch((e: unknown) => setError((e as Error).message ?? "Failed to load dashboard"))
      .finally(() => {
        setLoading(false)
        setAnalyticsLoading(false)
      })

    // Insights fires separately — does not block the rest
    api
      .get<{ narrative: string | null }>("/api/dashboard/analytics/insights")
      .then((r) => setNarrative(r.narrative))
      .catch(() => setNarrative(null))
  }, [])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  if (loading) return (
    <div className="flex items-center gap-2 py-16 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" /> Loading dashboard…
    </div>
  )
  if (error) return <PageError message={error} onRetry={fetchAll} />

  // Forecast comparison: projected vs current month revenue
  const currentMonthRevenue = analyticsData?.revenueTrend.at(-1)?.revenue ?? 0
  const projectedRevenue = analyticsData?.forecast.projectedRevenue ?? 0
  const forecastUp = projectedRevenue >= currentMonthRevenue

  return (
    <div className="space-y-7">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Office Dashboard
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Operations overview for FlowSense HVAC services
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" className="rounded-xl" onClick={() => setJobDialogOpen(true)}>
            <Wrench className="h-4 w-4" />
            New Job
          </Button>
          <AddCustomerDialog onCreated={() => {}} />
          <AddTechnicianDialog onCreated={(tech) => setTechnicians((prev) => [tech, ...prev])} />
        </div>
      </div>

      <StatCards stats={stats} loading={loading} />
      <MaintenanceDueWidget />
      <RecurringDraftsWidget />

      {(() => {
        const unassigned = jobs.filter((j) => j.status === "pending" && !j.technicianId)
        if (!unassigned.length) return null
        return (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/8 px-4 py-3">
            <div className="flex items-center gap-2.5">
              <UserX className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
                {unassigned.length} job{unassigned.length !== 1 ? "s" : ""} need{unassigned.length === 1 ? "s" : ""} a technician assigned
              </p>
            </div>
            <Link
              to="/office/jobs"
              className="shrink-0 rounded-lg bg-amber-500/20 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-500/30 transition-colors dark:text-amber-300"
            >
              Review jobs →
            </Link>
          </div>
        )
      })()}

      <div className="grid gap-7 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <JobChart data={chartData} loading={loading} />
        </div>
        <div className="lg:col-span-2">
          <TechStatus technicians={technicians} jobs={jobs} loading={loading} />
        </div>
      </div>

      <RecentJobs jobs={jobs} loading={loading} />

      {/* ── Revenue & Job Trends ── */}
      <div className="rounded-xl border bg-card p-5">
        <h2 className="mb-4 text-base font-semibold">Revenue & Job Trends (Last 6 Months)</h2>
        {analyticsLoading ? (
          <div className="space-y-2">
            <div className="h-40 bg-muted rounded animate-pulse" />
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <p className="mb-2 text-sm text-muted-foreground">Revenue</p>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={analyticsData?.revenueTrend ?? []}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number) => [`$${v.toFixed(2)}`, "Revenue"]} />
                  <Line type="monotone" dataKey="revenue" stroke="#0d9488" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div>
              <p className="mb-2 text-sm text-muted-foreground">Jobs Completed</p>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={analyticsData?.jobTrend ?? []}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip formatter={(v: number) => [v, "Jobs"]} />
                  <Line type="monotone" dataKey="jobs" stroke="#6366f1" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Forecast */}
        {!analyticsLoading && analyticsData && (
          <div className="mt-4 flex items-center gap-3 rounded-lg border bg-muted/40 px-4 py-3">
            {forecastUp ? (
              <TrendingUp className="h-4 w-4 text-green-600 dark:text-green-400" />
            ) : (
              <TrendingDown className="h-4 w-4 text-red-500 dark:text-red-400" />
            )}
            <div>
              <p className="text-sm font-medium">
                Next Month Forecast ({analyticsData.forecast.month})
              </p>
              <p className="text-xs text-muted-foreground">
                ${projectedRevenue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} projected revenue
                {" "}
                <span className={forecastUp ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"}>
                  ({forecastUp ? "▲" : "▼"} vs this month)
                </span>
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── Equipment Type Breakdown ── */}
      <div className="rounded-xl border bg-card p-5">
        <h2 className="mb-4 text-base font-semibold">Top Equipment Types</h2>
        {analyticsLoading ? (
          <div className="h-40 bg-muted rounded animate-pulse" />
        ) : (analyticsData?.equipmentBreakdown.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">No completed jobs in the last 6 months.</p>
        ) : (
          <ResponsiveContainer width="100%" height={180}>
            <BarChart
              data={analyticsData?.equipmentBreakdown ?? []}
              layout="vertical"
              margin={{ left: 16 }}
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
              <YAxis type="category" dataKey="type" tick={{ fontSize: 11 }} width={90} />
              <Tooltip formatter={(v: number) => [v, "Jobs"]} />
              <Bar dataKey="count" fill="#0d9488" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── AI Insights ── */}
      <div className="rounded-xl border bg-card p-5">
        <h2 className="mb-3 flex items-center gap-2 text-base font-semibold">
          <span>✦</span> AI Insights
        </h2>
        {narrative === undefined ? (
          <div className="space-y-2">
            <div className="h-4 w-3/4 bg-muted rounded animate-pulse" />
            <div className="h-4 w-1/2 bg-muted rounded animate-pulse" />
          </div>
        ) : narrative === null ? (
          <p className="text-sm text-muted-foreground">
            AI insights not available — configure your Anthropic API key in Settings.
          </p>
        ) : (
          <p className="text-sm text-foreground leading-relaxed">{narrative}</p>
        )}
      </div>

      {/* ── At-Risk Customers ── */}
      <div className="rounded-xl border bg-card p-5">
        <h2 className="mb-4 text-base font-semibold">At-Risk Customers</h2>
        {analyticsLoading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-8 bg-muted rounded animate-pulse" />
            ))}
          </div>
        ) : (analyticsData?.atRisk.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">No at-risk customers identified.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="pb-2 pr-4 font-medium">Customer</th>
                  <th className="pb-2 pr-4 font-medium">Address</th>
                  <th className="pb-2 font-medium">Flags / AI Reason</th>
                </tr>
              </thead>
              <tbody>
                {analyticsData?.atRisk.map((c) => (
                  <tr key={c.customerId} className="border-b last:border-0">
                    <td className="py-2.5 pr-4 font-medium">{c.name}</td>
                    <td className="py-2.5 pr-4 text-muted-foreground">{c.address}</td>
                    <td className="py-2.5">
                      <div className="flex flex-wrap gap-1 mb-1">
                        {c.flags.includes("overdue_service") && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                            overdue service
                          </span>
                        )}
                        {c.flags.includes("warranty_expiring") && (
                          <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-800 dark:bg-orange-900/40 dark:text-orange-300">
                            warranty expiring
                          </span>
                        )}
                        {c.flags.includes("no_recent_job") && (
                          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
                            no recent job
                          </span>
                        )}
                      </div>
                      {c.aiReason && (
                        <p className="text-xs text-muted-foreground">{c.aiReason}</p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <CreateJobDialog
        open={jobDialogOpen}
        onOpenChange={setJobDialogOpen}
        onCreated={() => {
          setJobDialogOpen(false)
          fetchAll()
        }}
      />
    </div>
  )
}
```

- [ ] **Step 3: Run TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 4: Start dev server and manually verify the analytics sections render**

```bash
cd frontend && npm run dev
```

Open http://localhost:5173, log in as an office user, check that:
- Revenue & Job Trends section appears below Recent Jobs
- Top Equipment Types section appears
- AI Insights section shows skeleton then text (or "not available" message)
- At-Risk Customers section shows table or empty state
- No console errors

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/types.ts frontend/src/pages/office/OfficeDashboard.tsx
git commit -m "feat: add predictive analytics sections to office dashboard"
```

---

## Final verification

- [ ] **Run all backend tests**

```bash
cd backend && npx vitest run
```

Expected: all tests pass (previous tests unaffected)

- [ ] **Final commit if any fixup needed**

```bash
git add -A
git commit -m "fix: predictive analytics final fixups"
```
