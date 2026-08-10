# Compliance Audit Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface the existing `ComplianceLog` model through an inline technician checklist (EPA 608 + safety ACK) on job cards, a per-job compliance timeline in the office view, and a new org-wide compliance audit page.

**Architecture:** One new backend route (`GET /api/compliance` — org-scoped with filters). Three new frontend components (`ComplianceForm`, `ComplianceTimeline`, `OfficeCompliance`). Wired into existing `TechnicianJobs.tsx`, `OfficeJobs.tsx`, `app-sidebar.tsx`, and `App.tsx`. No schema migration needed — `ComplianceLog` model and basic routes already exist.

**Tech Stack:** Express, Prisma, Zod, React, TypeScript, shadcn/ui (Checkbox, Select, Badge, Card)

**Spec:** `docs/superpowers/specs/2026-08-10-compliance-audit-design.md`

---

## File Map

**Create:**
- `backend/src/__tests__/compliance.test.ts` — tests for the new GET / route
- `frontend/src/components/compliance/compliance-utils.ts` — shared label/badge/summary helpers
- `frontend/src/components/compliance/ComplianceForm.tsx` — inline technician checklist
- `frontend/src/components/compliance/ComplianceTimeline.tsx` — per-job timeline (office)
- `frontend/src/pages/office/OfficeCompliance.tsx` — org-wide audit page

**Modify:**
- `backend/src/routes/compliance.ts` — add `GET /api/compliance` (after existing handlers)
- `frontend/src/api/types.ts` — add `ComplianceLog` interface
- `frontend/src/pages/technician/TechnicianJobs.tsx` — add `<ComplianceForm>` to expanded card
- `frontend/src/pages/office/OfficeJobs.tsx` — add `<ComplianceTimeline>` to expanded job
- `frontend/src/components/app-sidebar.tsx` — add Compliance nav item
- `frontend/src/App.tsx` — add `/office/compliance` route

---

## Chunk 1: Backend

### Task 1: New `GET /api/compliance` route + tests

**Files:**
- Modify: `backend/src/routes/compliance.ts`
- Create: `backend/src/__tests__/compliance.test.ts`

- [ ] **Step 1: Write failing tests**

Create `backend/src/__tests__/compliance.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest"
import express from "express"
import request from "supertest"

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    complianceLog: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
  },
}))

import { complianceRouter } from "../routes/compliance.js"
import { prisma } from "../lib/prisma.js"

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    ;(req as any).user = { id: "user-1", organizationId: "org-1", role: "office" }
    next()
  })
  app.use("/api/compliance", complianceRouter)
  return app
}

describe("GET /api/compliance", () => {
  beforeEach(() => { vi.clearAllMocks() })

  it("returns logs scoped to the org", async () => {
    vi.mocked(prisma.complianceLog.findMany).mockResolvedValue([
      {
        id: "log-1", jobId: "job-1", type: "safety_ack",
        payload: { items: ["PPE worn"] }, createdAt: new Date(),
        job: {
          id: "job-1", scheduledAt: new Date(), equipmentType: "ac",
          customer: { name: "Acme" },
          technician: { user: { name: "Tech A" } },
        },
      } as any,
    ])
    const app = buildApp()
    const res = await request(app).get("/api/compliance")
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body[0]).toHaveProperty("job")
  })

  it("filters by type when provided", async () => {
    vi.mocked(prisma.complianceLog.findMany).mockResolvedValue([])
    const app = buildApp()
    await request(app).get("/api/compliance?type=epa608_prompt")
    expect(prisma.complianceLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ type: "epa608_prompt" }) })
    )
  })

  it("filters by technicianId when provided", async () => {
    vi.mocked(prisma.complianceLog.findMany).mockResolvedValue([])
    const app = buildApp()
    await request(app).get("/api/compliance?technicianId=tech-1")
    expect(prisma.complianceLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          job: expect.objectContaining({ technicianId: "tech-1" }),
        }),
      })
    )
  })

  it("defaults to last 90 days when no date range given", async () => {
    vi.mocked(prisma.complianceLog.findMany).mockResolvedValue([])
    const app = buildApp()
    await request(app).get("/api/compliance")
    const call = vi.mocked(prisma.complianceLog.findMany).mock.calls[0][0] as any
    expect(call.where.createdAt.gte).toBeInstanceOf(Date)
    const diffDays = (Date.now() - call.where.createdAt.gte.getTime()) / (1000 * 60 * 60 * 24)
    expect(diffDays).toBeGreaterThan(88)
    expect(diffDays).toBeLessThan(92)
  })
})

describe("GET /api/compliance/job/:jobId", () => {
  beforeEach(() => { vi.clearAllMocks() })

  it("returns logs for a specific job", async () => {
    vi.mocked(prisma.complianceLog.findMany).mockResolvedValue([
      { id: "log-1", jobId: "job-1", type: "safety_ack", payload: {}, createdAt: new Date() } as any,
    ])
    const app = buildApp()
    const res = await request(app).get("/api/compliance/job/job-1")
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd /Users/stevenzakaria/flowsense/backend && npx vitest run src/__tests__/compliance.test.ts 2>&1 | head -20
```

Expected: FAIL (GET / handler not found).

- [ ] **Step 3: Add `GET /api/compliance` to `backend/src/routes/compliance.ts`**

Open the file. The existing handlers are `GET /job/:jobId` and `POST /`. Add the new handler AFTER both existing handlers (critical — `GET /` must come after `GET /job/:jobId` to avoid Express route shadowing).

**Do NOT add `requireAuth` or `requireSubscription` inline.** The compliance router is already mounted in `index.ts` with those middleware applied at the mount point (`app.use("/api/compliance", apiLimiter, requireAuth, requireSubscription, complianceRouter)`). Adding them again would be redundant. Also use `req.user!` (typed, not `(req as any).user`) to match the established pattern in the codebase.

Append after the existing `POST /` handler:

```typescript
complianceRouter.get("/", async (req, res) => {
  try {
    const { organizationId } = req.user!
    const { technicianId, type, from, to } = req.query as Record<string, string | undefined>

    const defaultFrom = new Date()
    defaultFrom.setDate(defaultFrom.getDate() - 90)

    const logs = await prisma.complianceLog.findMany({
      where: {
        job: {
          organizationId,
          ...(technicianId ? { technicianId } : {}),
        },
        ...(type ? { type } : {}),
        createdAt: {
          gte: from ? new Date(from) : defaultFrom,
          ...(to ? { lte: new Date(to) } : {}),
        },
      },
      include: {
        job: {
          select: {
            id: true,
            scheduledAt: true,
            equipmentType: true,
            customer: { select: { name: true } },
            technician: { select: { user: { select: { name: true } } } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    })

    res.json(logs)
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Failed to list compliance logs" })
  }
})
```

**Check the actual middleware import paths** by reading `backend/src/routes/equipment.ts` — the pattern for `requireAuth` and `requireSubscription` may differ (they might be passed in from `index.ts` rather than imported). If they come from `index.ts`, apply them there instead of in the route file.

- [ ] **Step 4: Run tests — verify they pass**

```bash
cd /Users/stevenzakaria/flowsense/backend && npx vitest run src/__tests__/compliance.test.ts
```

Fix any failures before proceeding.

- [ ] **Step 5: Run full backend test suite**

```bash
cd /Users/stevenzakaria/flowsense/backend && npx vitest run
```

Expected: All passing.

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/compliance.ts backend/src/__tests__/compliance.test.ts
git commit -m "feat: add org-scoped GET /api/compliance route with filters"
```

---

## Chunk 2: Frontend

### Task 2: Frontend API types

**Files:**
- Modify: `frontend/src/api/types.ts`

- [ ] **Step 1: Add `ComplianceLog` interface**

Open `frontend/src/api/types.ts`. Add:

```typescript
export interface ComplianceLog {
  id: string
  jobId: string
  type: "epa608_prompt" | "safety_ack" | "code_reminder" | "photo_audit" | "ai_disclaimer"
  payload: Record<string, unknown>
  createdAt: string
  job?: {
    id: string
    scheduledAt: string | null
    equipmentType: string | null
    customer: { name: string } | null
    technician: { user: { name: string } | null } | null
  }
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd /Users/stevenzakaria/flowsense/frontend && npx tsc --noEmit 2>&1 | head -20
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api/types.ts
git commit -m "feat: add ComplianceLog API type"
```

---

### Task 3: `ComplianceForm` component

**Files:**
- Create: `frontend/src/components/compliance/ComplianceForm.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { useState, useEffect } from "react"
import { api } from "@/api/client"
import type { ComplianceLog } from "@/api/types"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { CheckCircle2, Loader2, ShieldCheck } from "lucide-react"
import { toast } from "sonner"

interface Props {
  jobId: string
  equipmentType: string | null
  onLogged: () => void
}

const EPA_EQUIPMENT = ["ac", "heat-pump", "mini-split"]

const SAFETY_ITEMS = [
  "PPE worn",
  "Work area secured",
  "Lockout/tagout followed",
]

const CERT_LEVELS = [
  { value: "type1", label: "Type I" },
  { value: "type2", label: "Type II" },
  { value: "universal", label: "Universal" },
]

const REFRIGERANT_TYPES = ["R-22", "R-410A", "R-32", "R-134a", "Other"]

export function ComplianceForm({ jobId, equipmentType, onLogged }: Props) {
  const [loading, setLoading] = useState(true)
  const [alreadyLogged, setAlreadyLogged] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // EPA 608 fields
  const [certLevel, setCertLevel] = useState("")
  const [refrigerantType, setRefrigerantType] = useState("")
  const [lbsRecovered, setLbsRecovered] = useState("")
  const [lbsCharged, setLbsCharged] = useState("")

  // Safety ACK
  const [safetyChecked, setSafetyChecked] = useState<Record<string, boolean>>(
    Object.fromEntries(SAFETY_ITEMS.map((item) => [item, false]))
  )

  const showEpa = EPA_EQUIPMENT.includes(equipmentType ?? "")
  const allSafetyChecked = SAFETY_ITEMS.every((item) => safetyChecked[item])

  useEffect(() => {
    api.get<ComplianceLog[]>(`/api/compliance/job/${jobId}`)
      .then((logs) => {
        // safety_ack present = fully logged
        if (logs.some((l) => l.type === "safety_ack")) {
          setAlreadyLogged(true)
          onLogged()
        }
      })
      .catch(() => {}) // non-blocking — form still renders on error
      .finally(() => setLoading(false))
  }, [jobId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      const posts: Promise<unknown>[] = []

      // EPA 608 — only post if all four fields are filled
      if (showEpa && certLevel && refrigerantType && lbsRecovered && lbsCharged) {
        posts.push(
          api.post("/api/compliance", {
            jobId,
            type: "epa608_prompt",
            payload: {
              certLevel,
              refrigerantType,
              lbsRecovered: parseFloat(lbsRecovered),
              lbsCharged: parseFloat(lbsCharged),
            },
          })
        )
      }

      // Safety ACK — always post
      posts.push(
        api.post("/api/compliance", {
          jobId,
          type: "safety_ack",
          payload: { items: SAFETY_ITEMS.filter((item) => safetyChecked[item]) },
        })
      )

      await Promise.all(posts)
      setAlreadyLogged(true)
      onLogged()
    } catch {
      toast.error("Failed to submit compliance log. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return null

  if (alreadyLogged) {
    return (
      <div className="mx-3 mb-3 flex items-center gap-2 rounded-lg border border-border bg-muted px-3 py-2 text-xs">
        <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
        <span className="font-medium text-foreground">Compliance logged</span>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="mx-3 mb-3 rounded-lg border border-border bg-muted p-3 space-y-4">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-foreground">
        <ShieldCheck className="h-4 w-4" />
        Compliance Log
      </div>

      {showEpa && (
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">EPA 608 (optional)</div>
          <div className="grid grid-cols-2 gap-2">
            <Select value={certLevel} onValueChange={setCertLevel}>
              <SelectTrigger className="text-xs h-8"><SelectValue placeholder="Cert level" /></SelectTrigger>
              <SelectContent>
                {CERT_LEVELS.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={refrigerantType} onValueChange={setRefrigerantType}>
              <SelectTrigger className="text-xs h-8"><SelectValue placeholder="Refrigerant" /></SelectTrigger>
              <SelectContent>
                {REFRIGERANT_TYPES.map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              className="text-xs h-8" type="number" step="0.1" min="0"
              placeholder="Lbs recovered" value={lbsRecovered}
              onChange={(e) => setLbsRecovered(e.target.value)}
            />
            <Input
              className="text-xs h-8" type="number" step="0.1" min="0"
              placeholder="Lbs charged" value={lbsCharged}
              onChange={(e) => setLbsCharged(e.target.value)}
            />
          </div>
        </div>
      )}

      <div className="space-y-2">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Safety ACK (required)</div>
        {SAFETY_ITEMS.map((item) => (
          <div key={item} className="flex items-center gap-2">
            <Checkbox
              id={`safety-${item}`}
              checked={safetyChecked[item]}
              onCheckedChange={(checked) =>
                setSafetyChecked((prev) => ({ ...prev, [item]: !!checked }))
              }
            />
            <label htmlFor={`safety-${item}`} className="text-xs text-foreground cursor-pointer">{item}</label>
          </div>
        ))}
      </div>

      <Button
        type="submit"
        size="sm"
        className="w-full text-xs"
        disabled={!allSafetyChecked || submitting}
      >
        {submitting && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
        Submit compliance log
      </Button>
    </form>
  )
}
```

**Note:** Check that `Checkbox` is available in `frontend/src/components/ui/checkbox.tsx`. If not, it needs to be added with shadcn: `cd frontend && npx shadcn@latest add checkbox`. Check first with `ls frontend/src/components/ui/checkbox.tsx 2>/dev/null`.

- [ ] **Step 2: Check/install Checkbox component**

```bash
ls /Users/stevenzakaria/flowsense/frontend/src/components/ui/checkbox.tsx 2>/dev/null && echo "exists" || (cd /Users/stevenzakaria/flowsense/frontend && npx shadcn@latest add checkbox --yes)
```

- [ ] **Step 3: TypeScript check**

```bash
cd /Users/stevenzakaria/flowsense/frontend && npx tsc --noEmit 2>&1 | head -30
```

Fix any errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/compliance/ComplianceForm.tsx frontend/src/components/ui/
git commit -m "feat: add ComplianceForm inline technician checklist"
```

---

### Task 4: Wire `ComplianceForm` into `TechnicianJobs.tsx`

**Files:**
- Modify: `frontend/src/pages/technician/TechnicianJobs.tsx`

- [ ] **Step 1: Read the file**

Read `frontend/src/pages/technician/TechnicianJobs.tsx` to understand the expanded card structure. Find where the equipment context block ends and where the Ask AI button appears.

- [ ] **Step 2: Add import**

```typescript
import { ComplianceForm } from "@/components/compliance/ComplianceForm"
```

- [ ] **Step 3: Add `<ComplianceForm>` to the expanded card**

In the expanded job card JSX, add `<ComplianceForm>` AFTER the equipment context block and BEFORE the Ask AI button. Only show when job status is `in_progress` or `completed`:

```tsx
{(job.status === "in_progress" || job.status === "completed") && (
  <ComplianceForm
    jobId={job.id}
    equipmentType={job.equipmentType ?? null}
    onLogged={() => {/* no-op — ComplianceForm manages its own "logged" state */}}
  />
)}
```

- [ ] **Step 4: TypeScript check**

```bash
cd /Users/stevenzakaria/flowsense/frontend && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/technician/TechnicianJobs.tsx
git commit -m "feat: wire ComplianceForm into technician job card"
```

---

### Task 5: Shared compliance utils + `ComplianceTimeline` + wire into `OfficeJobs`

**Files:**
- Create: `frontend/src/components/compliance/compliance-utils.ts` — shared helpers (avoids duplication between Timeline and OfficeCompliance)
- Create: `frontend/src/components/compliance/ComplianceTimeline.tsx`
- Modify: `frontend/src/pages/office/OfficeJobs.tsx`

- [ ] **Step 1: Create `compliance-utils.ts`**

```typescript
import type { ComplianceLog } from "@/api/types"

export function typeLabel(type: ComplianceLog["type"]) {
  switch (type) {
    case "epa608_prompt": return "EPA 608"
    case "safety_ack": return "Safety"
    case "code_reminder": return "Code"
    default: return type
  }
}

export function typeBadgeVariant(type: ComplianceLog["type"]): "default" | "outline" | "secondary" {
  switch (type) {
    case "epa608_prompt": return "default"
    case "safety_ack": return "secondary"
    default: return "outline"
  }
}

export function summarizePayload(log: ComplianceLog) {
  const p = log.payload as Record<string, unknown>
  switch (log.type) {
    case "epa608_prompt":
      return [
        p.refrigerantType,
        p.lbsRecovered != null ? `${p.lbsRecovered} lbs recovered` : null,
        p.lbsCharged != null ? `${p.lbsCharged} lbs charged` : null,
        p.certLevel,
      ].filter(Boolean).join(" · ")
    case "safety_ack":
      return Array.isArray(p.items) ? (p.items as string[]).join(", ") : ""
    case "code_reminder":
      return Array.isArray(p.codes) ? (p.codes as string[]).join(", ") : ""
    default:
      return ""
  }
}

export function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.round(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.round(hrs / 24)}d ago`
}
```

- [ ] **Step 2: Create `ComplianceTimeline.tsx`**

```tsx
import { useState, useEffect } from "react"
import { api } from "@/api/client"
import type { ComplianceLog } from "@/api/types"
import { Badge } from "@/components/ui/badge"
import { ShieldCheck } from "lucide-react"
import { typeLabel, typeBadgeVariant, summarizePayload, timeAgo } from "./compliance-utils"

interface Props {
  jobId: string
}

export function ComplianceTimeline({ jobId }: Props) {
  const [logs, setLogs] = useState<ComplianceLog[]>([])

  useEffect(() => {
    api.get<ComplianceLog[]>(`/api/compliance/job/${jobId}`)
      .then(setLogs)
      .catch(() => {})
  }, [jobId])

  if (logs.length === 0) return null

  return (
    <div className="mt-3 border-t pt-3">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
        <ShieldCheck className="h-3.5 w-3.5" />
        Compliance
      </div>
      <div className="space-y-2">
        {logs.map((log) => (
          <div key={log.id} className="flex items-start gap-3 text-xs">
            <span className="text-muted-foreground w-14 flex-shrink-0 pt-0.5">{timeAgo(log.createdAt)}</span>
            <Badge variant={typeBadgeVariant(log.type)} className="text-xs flex-shrink-0">{typeLabel(log.type)}</Badge>
            <span className="text-muted-foreground">{summarizePayload(log)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Read `OfficeJobs.tsx`**

Read `frontend/src/pages/office/OfficeJobs.tsx` to find the expanded job detail section — where job info is rendered when a row is expanded.

- [ ] **Step 4: Wire `ComplianceTimeline` into `OfficeJobs.tsx`**

Add import:
```typescript
import { ComplianceTimeline } from "@/components/compliance/ComplianceTimeline"
```

In the expanded job detail JSX, add `<ComplianceTimeline jobId={job.id} />` after the existing job info content (notes, equipment, etc.).

- [ ] **Step 5: TypeScript check**

```bash
cd /Users/stevenzakaria/flowsense/frontend && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/compliance/compliance-utils.ts frontend/src/components/compliance/ComplianceTimeline.tsx frontend/src/pages/office/OfficeJobs.tsx
git commit -m "feat: add ComplianceTimeline and wire into office job detail"
```

---

### Task 6: `OfficeCompliance` page + routing + sidebar

**Files:**
- Create: `frontend/src/pages/office/OfficeCompliance.tsx`
- Modify: `frontend/src/components/app-sidebar.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Create `OfficeCompliance.tsx`**

```tsx
import { useState, useEffect } from "react"
import { api } from "@/api/client"
import type { ComplianceLog } from "@/api/types"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Loader2, ShieldCheck } from "lucide-react"
import { typeLabel, typeBadgeVariant, summarizePayload } from "@/components/compliance/compliance-utils"

interface ApiTechnician {
  id: string
  user: { name: string } | null
}

function defaultFrom() {
  const d = new Date()
  d.setDate(d.getDate() - 90)
  return d.toISOString().split("T")[0]
}

function defaultTo() {
  return new Date().toISOString().split("T")[0]
}

export default function OfficeCompliance() {
  const [logs, setLogs] = useState<ComplianceLog[]>([])
  const [technicians, setTechnicians] = useState<ApiTechnician[]>([])
  const [loading, setLoading] = useState(true)

  const [technicianId, setTechnicianId] = useState("")
  const [type, setType] = useState("")
  const [from, setFrom] = useState(defaultFrom())
  const [to, setTo] = useState(defaultTo())

  useEffect(() => {
    api.get<ApiTechnician[]>("/api/technicians").then(setTechnicians).catch(() => {})
  }, [])

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (technicianId) params.set("technicianId", technicianId)
    if (type) params.set("type", type)
    if (from) params.set("from", new Date(from).toISOString())
    if (to) params.set("to", new Date(to + "T23:59:59").toISOString())

    api.get<ComplianceLog[]>(`/api/compliance?${params}`)
      .then(setLogs)
      .catch(() => setLogs([]))
      .finally(() => setLoading(false))
  }, [technicianId, type, from, to])

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <ShieldCheck className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-semibold">Compliance Audit</h1>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <Select value={technicianId} onValueChange={setTechnicianId}>
          <SelectTrigger className="w-48"><SelectValue placeholder="All technicians" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">All technicians</SelectItem>
            {technicians.map((t) => (
              <SelectItem key={t.id} value={t.id}>{t.user?.name ?? "—"}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="w-40"><SelectValue placeholder="All types" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">All types</SelectItem>
            <SelectItem value="epa608_prompt">EPA 608</SelectItem>
            <SelectItem value="safety_ack">Safety</SelectItem>
            <SelectItem value="code_reminder">Code</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2">
          <Input type="date" className="w-40" value={from} onChange={(e) => setFrom(e.target.value)} />
          <span className="text-muted-foreground text-sm">to</span>
          <Input type="date" className="w-40" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-8">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading...
        </div>
      ) : logs.length === 0 ? (
        <p className="text-muted-foreground text-sm py-8">No compliance logs found for the selected filters.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-xs text-muted-foreground uppercase tracking-wide">
                <th className="px-4 py-3 text-left font-medium">Date</th>
                <th className="px-4 py-3 text-left font-medium">Job</th>
                <th className="px-4 py-3 text-left font-medium">Customer</th>
                <th className="px-4 py-3 text-left font-medium">Technician</th>
                <th className="px-4 py-3 text-left font-medium">Type</th>
                <th className="px-4 py-3 text-left font-medium">Summary</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                    {new Date(log.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                    {log.job?.scheduledAt ? new Date(log.job.scheduledAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}
                  </td>
                  <td className="px-4 py-3">{log.job?.customer?.name ?? "—"}</td>
                  <td className="px-4 py-3">{log.job?.technician?.user?.name ?? "—"}</td>
                  <td className="px-4 py-3">
                    <Badge variant={typeBadgeVariant(log.type)} className="text-xs">{typeLabel(log.type)}</Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground max-w-sm truncate">{summarizePayload(log)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Add Compliance to the sidebar**

In `frontend/src/components/app-sidebar.tsx`, read the file. The `navItems` array currently ends with `Revenue`. Add Compliance after Revenue:

```typescript
import { ShieldCheck } from "lucide-react"
```

Add to `navItems` after the Revenue entry:
```typescript
{ label: "Compliance", href: "/office/compliance", icon: ShieldCheck },
```

- [ ] **Step 3: Add route to `App.tsx`**

In `frontend/src/App.tsx`:

Add import:
```typescript
import OfficeCompliance from "./pages/office/OfficeCompliance"
```

Add route inside the office `<Route>` block (after the `reports` route):
```tsx
<Route path="compliance" element={<OfficeCompliance />} />
```

- [ ] **Step 4: TypeScript check**

```bash
cd /Users/stevenzakaria/flowsense/frontend && npx tsc --noEmit 2>&1 | head -30
```

Fix any errors.

- [ ] **Step 5: Run backend tests one final time**

```bash
cd /Users/stevenzakaria/flowsense/backend && npx vitest run 2>&1 | tail -5
```

Expected: All passing.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/office/OfficeCompliance.tsx frontend/src/components/app-sidebar.tsx frontend/src/App.tsx
git commit -m "feat: add OfficeCompliance audit page, sidebar link, and route"
```

---

## Done

Verify end-to-end:
1. **Technician view** — expand an in-progress or completed AC job, confirm the compliance form appears with EPA 608 + safety checkboxes; submit and verify "Compliance logged ✓" appears
2. **Re-open the job** — compliance form should show "Compliance logged ✓" immediately (safety_ack log found)
3. **Office → Jobs** — expand the same job, confirm the compliance timeline renders below job details
4. **Office → Compliance** — navigate to `/office/compliance`, confirm the audit table loads with the log just submitted; try filtering by technician and type
