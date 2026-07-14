# Onboarding Flow Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Guide new FlowSense organizations from empty app to first dispatched job via a persistent sidebar checklist and smart empty states.

**Architecture:** One new backend route file (`onboarding.ts`) with two endpoints (GET /status, POST /dismiss). One new `onboardingDismissed` field on `Organization`. Frontend: `OnboardingContext` in `OfficeLayout`, `OnboardingChecklist` component in the sidebar, empty states on three pages, dialog-open via `?open=` query param, welcome toast on `?checkout=success`.

**Tech Stack:** Express/Prisma/PostgreSQL backend, React/TypeScript/Vite/Tailwind frontend, shadcn/ui, React Router, sonner toasts.

---

## Chunk 1: Backend

### Task 1: Schema migration — add `onboardingDismissed`

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: migration via `npm run db:migrate`

- [ ] **Step 1: Add field to schema**

In `backend/prisma/schema.prisma`, inside the `Organization` model after `trialEndsAt`:

```prisma
onboardingDismissed Boolean @default(false)
```

- [ ] **Step 2: Run migration**

```bash
cd /Users/stevenzakaria/flowsense/backend
npm run db:migrate -- --name add_onboarding_dismissed_to_organization
```

Expected: new migration file created and applied, Prisma Client regenerated.

- [ ] **Step 3: Verify**

```bash
npx prisma studio --browser none &
# Or just confirm migration file exists:
ls prisma/migrations/ | tail -3
```

- [ ] **Step 4: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/
git commit -m "feat: add onboardingDismissed field to Organization"
```

---

### Task 2: Onboarding routes + tests

**Files:**
- Create: `backend/src/routes/onboarding.ts`
- Create: `backend/src/__tests__/onboarding.test.ts`
- Modify: `backend/src/index.ts`

- [ ] **Step 1: Write failing tests**

Create `backend/src/__tests__/onboarding.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest"
import request from "supertest"
import express from "express"

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    organization: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}))

import { prisma } from "../lib/prisma.js"
import { onboardingRouter } from "../routes/onboarding.js"

function makeApp() {
  const app = express()
  app.use(express.json())
  // Simulate authenticate middleware
  app.use((req, _res, next) => {
    ;(req as { user?: object }).user = { id: "u1", organizationId: "org-1", role: "office" }
    next()
  })
  app.use("/api/onboarding", onboardingRouter)
  return app
}

describe("GET /api/onboarding/status", () => {
  beforeEach(() => vi.clearAllMocks())

  it("returns dismissed:true when org has onboardingDismissed=true", async () => {
    vi.mocked(prisma.organization.findUnique).mockResolvedValue({
      onboardingDismissed: true,
      phone: "555-1234",
      address: "123 Main St",
      _count: { technicians: 1, customers: 1, jobs: 1 },
    } as never)

    const res = await request(makeApp()).get("/api/onboarding/status")
    expect(res.status).toBe(200)
    expect(res.body.dismissed).toBe(true)
  })

  it("returns step completion derived from real data", async () => {
    vi.mocked(prisma.organization.findUnique).mockResolvedValue({
      onboardingDismissed: false,
      phone: "555-1234",
      address: "123 Main St",
      _count: { technicians: 1, customers: 0, jobs: 0 },
    } as never)

    const res = await request(makeApp()).get("/api/onboarding/status")
    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      dismissed: false,
      steps: {
        companyProfile: true,
        technician: true,
        customer: false,
        job: false,
      },
    })
  })
})

describe("POST /api/onboarding/dismiss", () => {
  it("sets onboardingDismissed=true and returns ok", async () => {
    vi.mocked(prisma.organization.update).mockResolvedValue({} as never)

    const res = await request(makeApp()).post("/api/onboarding/dismiss")
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })
    expect(prisma.organization.update).toHaveBeenCalledWith({
      where: { id: "org-1" },
      data: { onboardingDismissed: true },
    })
  })
})
```

- [ ] **Step 2: Run to verify they fail**

```bash
cd /Users/stevenzakaria/flowsense/backend
npx vitest run src/__tests__/onboarding.test.ts
```

Expected: FAIL (onboardingRouter not found)

- [ ] **Step 3: Implement `backend/src/routes/onboarding.ts`**

```typescript
import { Router } from "express"
import { prisma } from "../lib/prisma.js"
import type { AuthRequest } from "../middleware/types.js"

export const onboardingRouter = Router()

// GET /api/onboarding/status
onboardingRouter.get("/status", async (req, res) => {
  const { organizationId } = (req as AuthRequest).user

  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      onboardingDismissed: true,
      phone: true,
      address: true,
      _count: { select: { technicians: true, customers: true, jobs: true } },
    },
  })

  if (!org) return res.status(404).json({ error: "Organization not found" })

  res.json({
    dismissed: org.onboardingDismissed,
    steps: {
      companyProfile: !!(org.phone && org.address),
      technician: org._count.technicians > 0,
      customer: org._count.customers > 0,
      job: org._count.jobs > 0,
    },
  })
})

// POST /api/onboarding/dismiss
onboardingRouter.post("/dismiss", async (req, res) => {
  const { organizationId } = (req as AuthRequest).user
  await prisma.organization.update({
    where: { id: organizationId },
    data: { onboardingDismissed: true },
  })
  res.json({ ok: true })
})
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/__tests__/onboarding.test.ts
```

Expected: 3/3 pass.

- [ ] **Step 5: Wire into `backend/src/index.ts`**

Add import near the other route imports:
```typescript
import { onboardingRouter } from "./routes/onboarding.js"
```

Add mount after the billing routes:
```typescript
app.use("/api/onboarding", apiLimiter, requireAuth, requireSubscription, onboardingRouter)
```

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/onboarding.ts backend/src/__tests__/onboarding.test.ts backend/src/index.ts
git commit -m "feat: add onboarding status and dismiss endpoints"
```

---

## Chunk 2: Frontend foundation

### Task 3: `OnboardingStatus` type + `OnboardingContext`

**Files:**
- Modify: `frontend/src/api/types.ts`
- Create: `frontend/src/components/office/onboarding-context.tsx`
- Modify: `frontend/src/pages/office/OfficeLayout.tsx`

- [ ] **Step 1: Add type to `frontend/src/api/types.ts`**

Find the exports section and add:

```typescript
export interface OnboardingStatus {
  dismissed: boolean
  steps: {
    companyProfile: boolean
    technician: boolean
    customer: boolean
    job: boolean
  }
}
```

- [ ] **Step 2: Create `frontend/src/components/office/onboarding-context.tsx`**

```typescript
import { createContext, useContext, useState, useCallback } from "react"
import type { ReactNode } from "react"

interface OnboardingContextValue {
  refreshKey: number
  triggerRefresh: () => void
}

const OnboardingContext = createContext<OnboardingContextValue>({
  refreshKey: 0,
  triggerRefresh: () => {},
})

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [refreshKey, setRefreshKey] = useState(0)
  const triggerRefresh = useCallback(() => setRefreshKey((k) => k + 1), [])
  return (
    <OnboardingContext.Provider value={{ refreshKey, triggerRefresh }}>
      {children}
    </OnboardingContext.Provider>
  )
}

export function useOnboarding() {
  return useContext(OnboardingContext)
}
```

- [ ] **Step 3: Wrap `OfficeLayout` with `OnboardingProvider` and add welcome toast**

Open `frontend/src/pages/office/OfficeLayout.tsx`. It currently looks like:

```tsx
import { Outlet } from "react-router-dom"
import { AppSidebar } from "@/components/app-sidebar"
import { TopHeader } from "@/components/top-header"
import { TrialBanner } from "@/components/office/trial-banner"
import { SubscriptionCancelledScreen } from "@/components/office/subscription-cancelled-screen"

export default function OfficeLayout() {
  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar />
      <div className="flex flex-1 flex-col pl-[220px]">
        <TopHeader />
        <TrialBanner />
        <main className="flex-1 px-8 py-8">
          <Outlet />
        </main>
      </div>
      <SubscriptionCancelledScreen />
    </div>
  )
}
```

Update it to:

```tsx
import { useEffect } from "react"
import { Outlet, useSearchParams } from "react-router-dom"
import { toast } from "sonner"
import { AppSidebar } from "@/components/app-sidebar"
import { TopHeader } from "@/components/top-header"
import { TrialBanner } from "@/components/office/trial-banner"
import { SubscriptionCancelledScreen } from "@/components/office/subscription-cancelled-screen"
import { OnboardingProvider } from "@/components/office/onboarding-context"

export default function OfficeLayout() {
  const [searchParams, setSearchParams] = useSearchParams()

  useEffect(() => {
    if (searchParams.get("checkout") === "success") {
      toast.success("Welcome to FlowSense. Let's get your team set up.")
      setSearchParams((prev) => {
        prev.delete("checkout")
        return prev
      })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <OnboardingProvider>
      <div className="flex min-h-screen bg-background">
        <AppSidebar />
        <div className="flex flex-1 flex-col pl-[220px]">
          <TopHeader />
          <TrialBanner />
          <main className="flex-1 px-8 py-8">
            <Outlet />
          </main>
        </div>
        <SubscriptionCancelledScreen />
      </div>
    </OnboardingProvider>
  )
}
```

- [ ] **Step 4: TypeScript check**

```bash
cd /Users/stevenzakaria/flowsense/frontend && npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/types.ts frontend/src/components/office/onboarding-context.tsx frontend/src/pages/office/OfficeLayout.tsx
git commit -m "feat: add OnboardingStatus type, OnboardingContext, welcome toast"
```

---

### Task 4: `OnboardingChecklist` component

**Files:**
- Create: `frontend/src/components/office/onboarding-checklist.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { ChevronDown, ChevronUp, CheckCircle2, Circle } from "lucide-react"
import { api } from "@/api/client"
import type { OnboardingStatus } from "@/api/types"

interface Props {
  refreshKey: number
}

export function OnboardingChecklist({ refreshKey }: Props) {
  const navigate = useNavigate()
  const [status, setStatus] = useState<OnboardingStatus | null>(null)
  const [collapsed, setCollapsed] = useState(() =>
    localStorage.getItem("onboarding_checklist_collapsed") === "true"
  )
  const [hidden, setHidden] = useState(false)
  const [allDoneShown, setAllDoneShown] = useState(false)

  useEffect(() => {
    api
      .get<OnboardingStatus>("/api/onboarding/status")
      .then(setStatus)
      .catch(() => setHidden(true))
  }, [refreshKey])

  // Auto-dismiss when all steps complete
  useEffect(() => {
    if (!status || status.dismissed) return
    const allDone = Object.values(status.steps).every(Boolean)
    if (allDone && !allDoneShown) {
      setAllDoneShown(true)
      setTimeout(() => {
        setHidden(true)
        api.post("/api/onboarding/dismiss", {}).catch(() => {})
      }, 2000)
    }
  }, [status, allDoneShown])

  function toggleCollapse() {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem("onboarding_checklist_collapsed", String(next))
  }

  function dismiss() {
    setHidden(true)
    api.post("/api/onboarding/dismiss", {}).catch(() => {})
  }

  if (hidden || !status || status.dismissed) return null

  const steps = [
    { key: "companyProfile" as const, label: "Set up your company", href: "/office/settings" },
    { key: "technician" as const, label: "Add your first technician", href: "/office/technicians?open=add-technician" },
    { key: "customer" as const, label: "Add your first customer", href: "/office/customers?open=add-customer" },
    { key: "job" as const, label: "Create your first job", href: "/office/jobs?open=create-job" },
  ]

  const completedCount = steps.filter((s) => status.steps[s.key]).length
  const allDone = completedCount === steps.length

  if (allDone && allDoneShown) {
    return (
      <div className="mx-3 mb-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-300">
        You're all set! FlowSense is ready.
      </div>
    )
  }

  return (
    <div className="mx-3 mb-3 rounded-xl border border-border bg-sidebar-accent/40 text-[13px]">
      {/* Header */}
      <button
        onClick={toggleCollapse}
        className="flex w-full items-center justify-between px-3 py-2.5 font-medium text-foreground"
      >
        <span>Getting Started <span className="ml-1 text-muted-foreground font-normal">{completedCount}/{steps.length}</span></span>
        {collapsed ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronUp className="h-4 w-4 text-muted-foreground" />}
      </button>

      {!collapsed && (
        <>
          {/* Progress bar */}
          <div className="mx-3 mb-2 h-1.5 rounded-full bg-border">
            <div
              className="h-1.5 rounded-full bg-teal-500 transition-all"
              style={{ width: `${(completedCount / steps.length) * 100}%` }}
            />
          </div>

          {/* Steps */}
          <div className="px-1 pb-1">
            {steps.map((step) => {
              const done = status.steps[step.key]
              return (
                <button
                  key={step.key}
                  disabled={done}
                  onClick={() => !done && navigate(step.href)}
                  className={[
                    "flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors",
                    done
                      ? "cursor-default text-muted-foreground"
                      : "hover:bg-sidebar-accent text-foreground cursor-pointer",
                  ].join(" ")}
                >
                  {done
                    ? <CheckCircle2 className="h-4 w-4 shrink-0 text-teal-500" />
                    : <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />}
                  <span className={done ? "line-through" : ""}>{step.label}</span>
                </button>
              )
            })}
          </div>

          {/* Dismiss */}
          <div className="border-t border-border px-3 py-2 text-right">
            <button
              onClick={dismiss}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Dismiss
            </button>
          </div>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd /Users/stevenzakaria/flowsense/frontend && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/office/onboarding-checklist.tsx
git commit -m "feat: add OnboardingChecklist sidebar component"
```

---

### Task 5: Wire checklist into sidebar

**Files:**
- Modify: `frontend/src/components/app-sidebar.tsx`

- [ ] **Step 1: Read the current bottom of `app-sidebar.tsx`**

Read the full file to find where the bottom nav items (Settings, Billing) are rendered. The checklist goes above them.

- [ ] **Step 2: Add import and render `<OnboardingChecklist />`**

Add imports at the top:
```typescript
import { OnboardingChecklist } from "@/components/office/onboarding-checklist"
import { useOnboarding } from "@/components/office/onboarding-context"
```

Inside `AppSidebar`, read `refreshKey` from context:
```typescript
const { refreshKey } = useOnboarding()
```

Find the bottom section of the sidebar (where Settings and Billing buttons live) and add `<OnboardingChecklist refreshKey={refreshKey} />` immediately above it.

- [ ] **Step 3: TypeScript check**

```bash
cd /Users/stevenzakaria/flowsense/frontend && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/app-sidebar.tsx
git commit -m "feat: wire OnboardingChecklist into office sidebar"
```

---

## Chunk 3: Frontend pages

### Task 6: Empty states + dialog-open query param

**Files:**
- Modify: `frontend/src/components/technicians/add-technician-dialog.tsx` — add controlled open/onOpenChange props
- Modify: `frontend/src/components/customers/add-customer-dialog.tsx` — add controlled open/onOpenChange props
- Modify: `frontend/src/pages/office/OfficeTechnicians.tsx`
- Modify: `frontend/src/pages/office/OfficeCustomers.tsx`
- Modify: `frontend/src/pages/office/OfficeJobs.tsx`

For each page, two changes:
1. When the list is empty (and not loading), show an empty state with icon + message + action button
2. Read `?open=` query param on mount → call `setDialogOpen(true)` → clear the param from URL

Both `AddTechnicianDialog` and `AddCustomerDialog` are **uncontrolled** — they manage their own open state internally via a `DialogTrigger` button. To support programmatic opening from the query param, you must add `open` and `onOpenChange` props to each dialog component before modifying the pages.

#### Prerequisite: Make `AddTechnicianDialog` controlled

**File:** `frontend/src/components/technicians/add-technician-dialog.tsx`

1. Add `open?: boolean` and `onOpenChange?: (open: boolean) => void` to the `Props` interface.
2. Change the internal `const [open, setOpen] = useState(false)` to use the prop when provided:
   ```typescript
   const [internalOpen, setInternalOpen] = useState(false)
   const isOpen = props.open !== undefined ? props.open : internalOpen
   const setIsOpen = props.onOpenChange ?? setInternalOpen
   ```
3. Pass `open={isOpen}` and `onOpenChange={setIsOpen}` to the `<Dialog>` component.

#### Prerequisite: Make `AddCustomerDialog` controlled

**File:** `frontend/src/components/customers/add-customer-dialog.tsx`

Same pattern as above.

(`CreateJobDialog` in jobs is already controlled — no change needed there.)

#### OfficeTechnicians.tsx

- [ ] **Step 1: Add dialog state + query param + empty state**

Add `useSearchParams`, `useOnboarding` to imports. Add state `const [dialogOpen, setDialogOpen] = useState(false)`.

On mount, read param:
```typescript
const [searchParams, setSearchParams] = useSearchParams()
const { triggerRefresh } = useOnboarding()
useEffect(() => {
  if (searchParams.get("open") === "add-technician") {
    setDialogOpen(true)
    setSearchParams((prev) => { prev.delete("open"); return prev })
  }
}, []) // eslint-disable-line react-hooks/exhaustive-deps
```

Update `<AddTechnicianDialog>` to pass controlled props and call `triggerRefresh` on create:
```tsx
<AddTechnicianDialog
  open={dialogOpen}
  onOpenChange={setDialogOpen}
  onCreated={(tech) => {
    setTechnicians((prev) => [tech, ...prev])
    triggerRefresh()
  }}
/>
```

Add empty state when `!loading && technicians.length === 0`:
```tsx
<div className="flex flex-col items-center justify-center py-24 text-center">
  <Wrench className="mb-4 h-12 w-12 text-muted-foreground/40" />
  <h3 className="text-lg font-medium text-foreground">No technicians yet</h3>
  <p className="mt-1 text-sm text-muted-foreground">Add your first technician to start dispatching jobs.</p>
  <button
    onClick={() => setDialogOpen(true)}
    className="mt-6 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700"
  >
    Add Technician
  </button>
</div>
```

**Files to modify for this sub-task:**
- `frontend/src/components/technicians/add-technician-dialog.tsx` — add controlled props
- `frontend/src/pages/office/OfficeTechnicians.tsx` — query param + empty state

#### OfficeCustomers.tsx

Same pattern:
- Modify `frontend/src/components/customers/add-customer-dialog.tsx` — add `open`/`onOpenChange` props
- `?open=add-customer` → `setDialogOpen(true)`
- Call `triggerRefresh()` after customer created
- Empty state: Users icon, "No customers yet", "Add your first customer to create jobs.", Add Customer button

#### OfficeJobs.tsx

`CreateJobDialog` already accepts `open`/`onOpenChange` — no dialog change needed.
- `?open=create-job` → `setDialogOpen(true)`
- Call `triggerRefresh()` after job created
- Empty state: ClipboardList icon, "No jobs yet", "Create your first job to see it here.", Create Job button

- [ ] **Step 2: TypeScript check**

```bash
cd /Users/stevenzakaria/flowsense/frontend && npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/office/OfficeTechnicians.tsx frontend/src/pages/office/OfficeCustomers.tsx frontend/src/pages/office/OfficeJobs.tsx
git commit -m "feat: add empty states and ?open= dialog param to technicians, customers, jobs pages"
```

---

## Final verification

- [ ] Run all backend tests:
```bash
cd /Users/stevenzakaria/flowsense/backend && npx vitest run
```
Expected: all pass (including the 3 new onboarding tests).

- [ ] Run frontend TypeScript check:
```bash
cd /Users/stevenzakaria/flowsense/frontend && npx tsc --noEmit
```
Expected: no errors.
