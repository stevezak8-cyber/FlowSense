# Inventory Tracking Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a manually-maintained, org-scoped inventory system to FlowSense — office staff can track parts stock, and completing a job automatically decrements matched inventory items based on `Job.partsUsed`.

**Architecture:** A new `InventoryItem` Prisma model with a standard CRUD API (mirroring the existing `PricebookItem`/`pricebookRouter` pattern), managed from a new section on the Office Settings page (mirroring the existing Pricebook settings section). A pure matching function (`matchPartsToInventory`) decides which free-text `partsUsed` entries correspond to which inventory item, using case-insensitive exact-then-substring matching; it's wired into the existing job-completion transaction in `jobsRouter`'s `PATCH /:id` handler. Unmatched parts are recorded on the job (new `Job.unmatchedInventoryParts` field) and surfaced in the office jobs table's expandable row.

**Tech Stack:** Express, Prisma (PostgreSQL), Zod, Vitest + Supertest (backend); React, TypeScript (frontend). This is the first plan of three from `docs/superpowers/specs/2026-09-03-owner-ai-assistant-design.md` (Inventory Tracking → Core Assistant → Ad Publishing) — it ships as a standalone, useful feature with no dependency on the other two.

---

## Chunk 1: Inventory Data Model & CRUD API

### Task 1: Add `InventoryItem` Prisma model

**Files:**
- Modify: `backend/prisma/schema.prisma`

- [ ] **Step 1: Add the model and the `Organization` relation**

In `backend/prisma/schema.prisma`, add `inventoryItems InventoryItem[]` to the `Organization` model's relation list, right after `reviews JobReview[]` (currently the last line before the model's closing `}`, around line 62):

```prisma
  reviews                  JobReview[]
  inventoryItems           InventoryItem[]
}
```

Then add the new model after the `Organization` model closes (after line 63, before whatever model currently follows it):

```prisma
model InventoryItem {
  id                String       @id @default(cuid())
  organizationId    String
  organization      Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  name              String
  quantityOnHand    Int          @default(0)
  reorderThreshold  Int          @default(0)
  unit              String?
  createdAt         DateTime     @default(now())
  updatedAt         DateTime     @updatedAt

  @@index([organizationId])
}
```

Note: this intentionally deviates from the exact field defaults shown in the spec's Data Model section (`quantityOnHand Int` with no default, `reorderThreshold Int?` nullable, `unit String @default("unit")`) in favor of matching this codebase's existing `PricebookItem` conventions — `unit` as a plain nullable `String?` (no default string), and `reorderThreshold` defaulting to `0` rather than being nullable, so the low-stock comparison (`quantityOnHand <= reorderThreshold`) used later in this chunk's UI and in the future `get_inventory_status` tool never has to special-case `null`. This is a deliberate, equivalent choice, not an oversight.

- [ ] **Step 2: Generate the migration**

Run from `backend/`:
```bash
npx prisma migrate dev --name add_inventory_items
```
Expected: prompts complete without error, creates a new folder under `backend/prisma/migrations/` (e.g. `<timestamp>_add_inventory_items/migration.sql`), and regenerates the Prisma client. This requires a running local Postgres with `DATABASE_URL` set in `backend/.env` — see `README.md` for setup if not already configured.

- [ ] **Step 3: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations
git commit -m "feat: add InventoryItem model"
```

---

### Task 2: CRUD API for inventory items

**Files:**
- Create: `backend/src/routes/inventory.ts`
- Test: `backend/src/__tests__/inventory.test.ts`
- Modify: `backend/src/index.ts`

This follows the exact same shape as `backend/src/routes/pricebook.ts` (org-scoped CRUD, no customer relation) — read that file for reference if anything below is ambiguous. Unlike pricebook, deletes are **hard deletes** (no downstream records reference `InventoryItem`, unlike `PricebookItem` → `EstimateLine`).

- [ ] **Step 1: Write the failing test file**

Create `backend/src/__tests__/inventory.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest"
import express from "express"
import request from "supertest"

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    inventoryItem: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}))

import { inventoryRouter } from "../routes/inventory.js"
import { prisma } from "../lib/prisma.js"

function buildApp(role = "office") {
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    ;(req as any).user = { id: "user-1", organizationId: "org-1", role }
    next()
  })
  app.use("/api/inventory", inventoryRouter)
  return app
}

describe("GET /api/inventory", () => {
  beforeEach(() => { vi.clearAllMocks() })

  it("returns inventory items for the org, ordered by name", async () => {
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([
      { id: "inv-1", organizationId: "org-1", name: "Capacitor 45/5", quantityOnHand: 3, reorderThreshold: 2, unit: null, createdAt: new Date(), updatedAt: new Date() } as any,
    ])
    const res = await request(buildApp()).get("/api/inventory")
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body[0].name).toBe("Capacitor 45/5")
    expect(prisma.inventoryItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: "org-1" },
        orderBy: { name: "asc" },
      })
    )
  })
})

describe("POST /api/inventory", () => {
  beforeEach(() => { vi.clearAllMocks() })

  it("returns 403 when role is not office", async () => {
    const res = await request(buildApp("customer")).post("/api/inventory").send({ name: "Capacitor", quantityOnHand: 5 })
    expect(res.status).toBe(403)
  })

  it("returns 400 for missing required fields", async () => {
    const res = await request(buildApp()).post("/api/inventory").send({ name: "Capacitor" })
    expect(res.status).toBe(400)
  })

  it("creates an item and returns 201", async () => {
    vi.mocked(prisma.inventoryItem.create).mockResolvedValue({
      id: "inv-1", organizationId: "org-1", name: "Capacitor 45/5", quantityOnHand: 5, reorderThreshold: 0, unit: null, createdAt: new Date(), updatedAt: new Date(),
    } as any)
    const res = await request(buildApp()).post("/api/inventory").send({ name: "Capacitor 45/5", quantityOnHand: 5 })
    expect(res.status).toBe(201)
    expect(prisma.inventoryItem.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ organizationId: "org-1", name: "Capacitor 45/5", quantityOnHand: 5 }) })
    )
  })
})

describe("PATCH /api/inventory/:id", () => {
  beforeEach(() => { vi.clearAllMocks() })

  it("returns 404 when item not found in org", async () => {
    vi.mocked(prisma.inventoryItem.findFirst).mockResolvedValue(null)
    const res = await request(buildApp()).patch("/api/inventory/bad-id").send({ quantityOnHand: 10 })
    expect(res.status).toBe(404)
  })

  it("updates and returns the item", async () => {
    vi.mocked(prisma.inventoryItem.findFirst).mockResolvedValue({ id: "inv-1", organizationId: "org-1" } as any)
    vi.mocked(prisma.inventoryItem.update).mockResolvedValue({ id: "inv-1", quantityOnHand: 10 } as any)
    const res = await request(buildApp()).patch("/api/inventory/inv-1").send({ quantityOnHand: 10 })
    expect(res.status).toBe(200)
    expect(res.body.quantityOnHand).toBe(10)
  })
})

describe("DELETE /api/inventory/:id", () => {
  beforeEach(() => { vi.clearAllMocks() })

  it("returns 404 when item not found in org", async () => {
    vi.mocked(prisma.inventoryItem.findFirst).mockResolvedValue(null)
    const res = await request(buildApp()).delete("/api/inventory/bad-id")
    expect(res.status).toBe(404)
  })

  it("deletes and returns 204", async () => {
    vi.mocked(prisma.inventoryItem.findFirst).mockResolvedValue({ id: "inv-1", organizationId: "org-1" } as any)
    vi.mocked(prisma.inventoryItem.delete).mockResolvedValue({} as any)
    const res = await request(buildApp()).delete("/api/inventory/inv-1")
    expect(res.status).toBe(204)
  })
})
```

- [ ] **Step 2: Run the tests and verify they fail**

From `backend/`:
```bash
npx vitest run src/__tests__/inventory.test.ts
```
Expected: FAIL — `Cannot find module '../routes/inventory.js'` (the route file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `backend/src/routes/inventory.ts`:

```ts
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { z } from "zod";

export const inventoryRouter = Router();

const requireOffice = (req: any, res: any, next: any) => {
  if (req.user?.role !== "office") return res.status(403).json({ error: "Forbidden" });
  next();
};

const itemSchema = z.object({
  name: z.string().min(1),
  quantityOnHand: z.number().int().min(0),
  reorderThreshold: z.number().int().min(0).optional(),
  unit: z.string().optional(),
});

const updateItemSchema = itemSchema.partial();

inventoryRouter.get("/", async (req, res) => {
  try {
    const items = await prisma.inventoryItem.findMany({
      where: { organizationId: req.user!.organizationId },
      orderBy: { name: "asc" },
    });
    res.json(items);
  } catch {
    res.status(500).json({ error: "Failed to fetch inventory" });
  }
});

inventoryRouter.post("/", requireOffice, async (req, res) => {
  const parsed = itemSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid data", details: parsed.error.flatten() });

  try {
    const item = await prisma.inventoryItem.create({
      data: { ...parsed.data, organizationId: req.user!.organizationId },
    });
    res.status(201).json(item);
  } catch {
    res.status(500).json({ error: "Failed to create item" });
  }
});

inventoryRouter.patch("/:id", requireOffice, async (req, res) => {
  const existing = await prisma.inventoryItem.findFirst({
    where: { id: req.params.id, organizationId: req.user!.organizationId },
  });
  if (!existing) return res.status(404).json({ error: "Item not found" });

  const parsed = updateItemSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid data", details: parsed.error.flatten() });

  try {
    const item = await prisma.inventoryItem.update({ where: { id: req.params.id }, data: parsed.data });
    res.json(item);
  } catch {
    res.status(500).json({ error: "Failed to update item" });
  }
});

inventoryRouter.delete("/:id", requireOffice, async (req, res) => {
  const existing = await prisma.inventoryItem.findFirst({
    where: { id: req.params.id, organizationId: req.user!.organizationId },
  });
  if (!existing) return res.status(404).json({ error: "Item not found" });

  try {
    await prisma.inventoryItem.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch {
    res.status(500).json({ error: "Failed to delete item" });
  }
});
```

- [ ] **Step 4: Run the tests and verify they pass**

```bash
npx vitest run src/__tests__/inventory.test.ts
```
Expected: PASS — 8 tests.

- [ ] **Step 5: Register the route**

In `backend/src/index.ts`:

Add the import near the other route imports (next to `pricebookRouter`'s import):
```ts
import { inventoryRouter } from "./routes/inventory.js";
```

Add the mount line near `app.use("/api/pricebook", ...)`:
```ts
app.use("/api/inventory", apiLimiter, requireAuth, requireSubscription, inventoryRouter);
```

- [ ] **Step 6: Run the full backend test suite to confirm nothing broke**

```bash
npx vitest run
```
Expected: PASS on all pre-existing tests plus the new `inventory.test.ts` (note: `concierge-route.test.ts` and `customers-me.test.ts` have 2 pre-existing failures unrelated to this work — confirmed via `git stash` prior to this plan; don't treat those as regressions).

- [ ] **Step 7: Commit**

```bash
git add backend/src/routes/inventory.ts backend/src/__tests__/inventory.test.ts backend/src/index.ts
git commit -m "feat: add inventory CRUD API"
```

---

## Chunk 1 Review

Dispatch `plan-document-reviewer` subagent against this chunk before proceeding to Chunk 2 (see `writing-plans` skill's Plan Review Loop).

---

## Chunk 2: Auto-Decrement on Job Completion

### Task 3: Add `Job.unmatchedInventoryParts` field

**Files:**
- Modify: `backend/prisma/schema.prisma`

- [ ] **Step 1: Add the field**

In the `Job` model, add the new field right after `partsUsed String[] @default([])` (around line 208):

```prisma
  partsUsed         String[]    @default([])
  unmatchedInventoryParts String[] @default([]) // partsUsed entries with 0 or >1 InventoryItem matches at completion time
```

- [ ] **Step 2: Generate the migration**

From `backend/`:
```bash
npx prisma migrate dev --name add_job_unmatched_inventory_parts
```
Expected: creates a new migration folder, applies cleanly.

- [ ] **Step 3: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations
git commit -m "feat: add Job.unmatchedInventoryParts field"
```

---

### Task 4: `matchPartsToInventory` matching function

**Files:**
- Create: `backend/src/services/inventory-match.ts`
- Test: `backend/src/__tests__/inventory-match.test.ts`

This is a pure function — no DB or Express dependencies — so it's fully unit-testable in isolation. Matching rule (from the spec): for each `partsUsed` entry, try a case-insensitive **exact** match against `InventoryItem.name` first; if exactly one exact match, use it. Otherwise, try a case-insensitive **substring** match (in either direction — the part text contains the item name, or the item name contains the part text); if exactly one substring match, use it. Any other outcome (zero or multiple matches at either stage) leaves that part unmatched — no guessing.

- [ ] **Step 1: Write the failing test file**

Create `backend/src/__tests__/inventory-match.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { matchPartsToInventory } from "../services/inventory-match.js"

const items = [
  { id: "inv-1", name: "Capacitor 45/5" },
  { id: "inv-2", name: "Contactor" },
  { id: "inv-3", name: "Filter" },
]

describe("matchPartsToInventory", () => {
  it("returns empty result for empty partsUsed", () => {
    expect(matchPartsToInventory([], items)).toEqual({ decrements: [], unmatched: [] })
  })

  it("matches an exact (case-insensitive) name and counts one occurrence", () => {
    const result = matchPartsToInventory(["capacitor 45/5"], items)
    expect(result.decrements).toEqual([{ itemId: "inv-1", count: 1 }])
    expect(result.unmatched).toEqual([])
  })

  it("counts multiple occurrences of the same matched part", () => {
    const result = matchPartsToInventory(["Capacitor 45/5", "Capacitor 45/5"], items)
    expect(result.decrements).toEqual([{ itemId: "inv-1", count: 2 }])
  })

  it("falls back to a single substring match when there is no exact match", () => {
    const result = matchPartsToInventory(["new contactor - burned out"], items)
    expect(result.decrements).toEqual([{ itemId: "inv-2", count: 1 }])
  })

  it("leaves a part unmatched when there are zero matches", () => {
    const result = matchPartsToInventory(["Thermostat"], items)
    expect(result.decrements).toEqual([])
    expect(result.unmatched).toEqual(["Thermostat"])
  })

  it("leaves a part unmatched when there are multiple exact matches", () => {
    const duplicateNameItems = [{ id: "inv-6", name: "Filter" }, { id: "inv-7", name: "Filter" }]
    const result = matchPartsToInventory(["Filter"], duplicateNameItems)
    expect(result.decrements).toEqual([])
    expect(result.unmatched).toEqual(["Filter"])
  })

  it("leaves a part unmatched when substring matching is ambiguous", () => {
    const ambiguousItems = [{ id: "inv-4", name: "Filter 16x20" }, { id: "inv-5", name: "Filter 20x25" }]
    const result = matchPartsToInventory(["Filter"], ambiguousItems)
    expect(result.decrements).toEqual([])
    expect(result.unmatched).toEqual(["Filter"])
  })

  it("trims whitespace before matching", () => {
    const result = matchPartsToInventory(["  Filter  "], items)
    expect(result.decrements).toEqual([{ itemId: "inv-3", count: 1 }])
  })

  it("combines matched and unmatched parts in one call", () => {
    const result = matchPartsToInventory(["Filter", "Thermostat"], items)
    expect(result.decrements).toEqual([{ itemId: "inv-3", count: 1 }])
    expect(result.unmatched).toEqual(["Thermostat"])
  })
})
```

- [ ] **Step 2: Run the tests and verify they fail**

```bash
npx vitest run src/__tests__/inventory-match.test.ts
```
Expected: FAIL — `Cannot find module '../services/inventory-match.js'`.

- [ ] **Step 3: Write the implementation**

Create `backend/src/services/inventory-match.ts`:

```ts
export interface InventoryMatchItem {
  id: string;
  name: string;
}

export interface InventoryMatchResult {
  decrements: { itemId: string; count: number }[];
  unmatched: string[];
}

export function matchPartsToInventory(
  partsUsed: string[],
  items: InventoryMatchItem[]
): InventoryMatchResult {
  const decrementCounts = new Map<string, number>();
  const unmatched: string[] = [];

  for (const rawPart of partsUsed) {
    const part = rawPart.trim();
    if (!part) continue;
    const p = part.toLowerCase();

    const exact = items.filter((i) => i.name.trim().toLowerCase() === p);
    let matchedId: string | null = null;

    if (exact.length === 1) {
      matchedId = exact[0].id;
    } else if (exact.length === 0) {
      const substring = items.filter((i) => {
        const n = i.name.trim().toLowerCase();
        return p.includes(n) || n.includes(p);
      });
      if (substring.length === 1) matchedId = substring[0].id;
    }

    if (matchedId) {
      decrementCounts.set(matchedId, (decrementCounts.get(matchedId) ?? 0) + 1);
    } else {
      unmatched.push(part);
    }
  }

  const decrements = Array.from(decrementCounts.entries()).map(([itemId, count]) => ({ itemId, count }));
  return { decrements, unmatched };
}
```

- [ ] **Step 4: Run the tests and verify they pass**

```bash
npx vitest run src/__tests__/inventory-match.test.ts
```
Expected: PASS — 9 tests.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/inventory-match.ts backend/src/__tests__/inventory-match.test.ts
git commit -m "feat: add matchPartsToInventory matching function"
```

---

### Task 5: Wire the decrement into job completion

**Files:**
- Modify: `backend/src/routes/jobs.ts:1-24` (imports), `:426-462` (completion transaction)
- Test: `backend/src/__tests__/jobs-completion-inventory.test.ts`

- [ ] **Step 1: Write the failing test file**

Create `backend/src/__tests__/jobs-completion-inventory.test.ts`. This mocks the services `jobs.ts` imports that have side effects (email/SMS/push/notification sends) plus `prisma.$transaction`, so it can drive the real `PATCH /:id` handler through supertest without actually sending anything. It does *not* mock `../services/job-status.js` or `../templates/booking-confirmation.js` — both are side-effect-free at import time (pure functions/a template, no client init), so they don't need it, same as the precedent in `jobs-cancel.test.ts`, which mocks only `prisma` and `org-notifications.js` out of jobs.ts's full import list:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest"
import request from "supertest"
import express from "express"

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    job: { findFirst: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
    recurringJob: { update: vi.fn() },
    equipment: { update: vi.fn() },
  },
}))
vi.mock("../services/s3.js", () => ({ s3Available: false, getUploadUrl: vi.fn(), deleteObject: vi.fn() }))
vi.mock("../services/notifications.js", () => ({ broadcastToRole: vi.fn(), notifyInApp: vi.fn() }))
vi.mock("../services/email.js", () => ({
  sendEmail: vi.fn(), sendEnRouteEmail: vi.fn(), sendJobInProgressEmail: vi.fn(), sendJobCompletedEmail: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("../services/pre-arrival.js", () => ({ generatePreArrival: vi.fn() }))
vi.mock("../services/job-completion-ai.js", () => ({ generateCompletionSummary: vi.fn() }))
vi.mock("../services/push.js", () => ({ sendPushToUser: vi.fn() }))
vi.mock("../services/org-notifications.js", () => ({
  notifyOrgNewBooking: vi.fn(), notifyOrgStatusChange: vi.fn(), notifyOrgJobCompleted: vi.fn(), notifyOfficeCancellation: vi.fn(),
}))
vi.mock("../services/sms.js", () => ({
  sendBookingConfirmedSms: vi.fn(), sendEnRouteSms: vi.fn(), sendJobCompletedSms: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("../services/create-notification.js", () => ({ createNotification: vi.fn() }))

import { prisma } from "../lib/prisma.js"
import { jobsRouter } from "../routes/jobs.js"

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    ;(req as any).user = { id: "user-1", organizationId: "org-1", role: "office" }
    next()
  })
  app.use("/", jobsRouter)
  return app
}

describe("PATCH /:id — inventory decrement on completion", () => {
  beforeEach(() => vi.clearAllMocks())

  it("decrements matched inventory items and records unmatched parts on the job", async () => {
    vi.mocked(prisma.job.findFirst).mockResolvedValue({ id: "job-1", status: "in_progress", organizationId: "org-1" } as any)

    const mockTx = {
      inventoryItem: {
        findMany: vi.fn().mockResolvedValue([
          { id: "inv-1", name: "Capacitor 45/5", quantityOnHand: 3 },
          { id: "inv-2", name: "Contactor", quantityOnHand: 1 },
        ]),
        update: vi.fn().mockResolvedValue({}),
      },
      job: {
        update: vi.fn().mockResolvedValue({
          id: "job-1", customerId: "cust-1", equipmentId: null, recurringJobId: null,
          serviceType: "repair", equipmentType: "ac", status: "completed",
          customer: { id: "cust-1", name: "Alice", address: "123 St", email: null },
          technician: null, recurringJob: null,
        }),
      },
      invoice: { create: vi.fn().mockResolvedValue({}) },
    }
    vi.mocked(prisma.$transaction).mockImplementation((cb: any) => cb(mockTx))

    const res = await request(makeApp())
      .patch("/job-1")
      .send({ status: "completed", partsUsed: ["Capacitor 45/5", "Capacitor 45/5", "Filter"] })

    expect(res.status).toBe(200)
    expect(mockTx.inventoryItem.update).toHaveBeenCalledWith({
      where: { id: "inv-1" },
      data: { quantityOnHand: 1 },
    })
    expect(mockTx.inventoryItem.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "inv-2" } })
    )
    expect(mockTx.job.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ unmatchedInventoryParts: ["Filter"] }) })
    )
  })

  it("floors quantityOnHand at 0 and logs a warning instead of going negative", async () => {
    vi.mocked(prisma.job.findFirst).mockResolvedValue({ id: "job-1", status: "in_progress", organizationId: "org-1" } as any)
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

    const mockTx = {
      inventoryItem: {
        findMany: vi.fn().mockResolvedValue([{ id: "inv-1", name: "Capacitor 45/5", quantityOnHand: 1 }]),
        update: vi.fn().mockResolvedValue({}),
      },
      job: {
        update: vi.fn().mockResolvedValue({
          id: "job-1", customerId: "cust-1", equipmentId: null, recurringJobId: null,
          serviceType: "repair", equipmentType: "ac", status: "completed",
          customer: { id: "cust-1", name: "Alice", address: "123 St", email: null },
          technician: null, recurringJob: null,
        }),
      },
      invoice: { create: vi.fn().mockResolvedValue({}) },
    }
    vi.mocked(prisma.$transaction).mockImplementation((cb: any) => cb(mockTx))

    await request(makeApp())
      .patch("/job-1")
      .send({ status: "completed", partsUsed: ["Capacitor 45/5", "Capacitor 45/5"] })

    expect(mockTx.inventoryItem.update).toHaveBeenCalledWith({
      where: { id: "inv-1" },
      data: { quantityOnHand: 0 },
    })
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Capacitor 45/5"))
    warnSpy.mockRestore()
  })

  it("skips inventory lookup entirely when partsUsed is empty", async () => {
    vi.mocked(prisma.job.findFirst).mockResolvedValue({ id: "job-1", status: "in_progress", organizationId: "org-1" } as any)

    const mockTx = {
      inventoryItem: { findMany: vi.fn(), update: vi.fn() },
      job: {
        update: vi.fn().mockResolvedValue({
          id: "job-1", customerId: "cust-1", equipmentId: null, recurringJobId: null,
          serviceType: "repair", equipmentType: "ac", status: "completed",
          customer: { id: "cust-1", name: "Alice", address: "123 St", email: null },
          technician: null, recurringJob: null,
        }),
      },
      invoice: { create: vi.fn().mockResolvedValue({}) },
    }
    vi.mocked(prisma.$transaction).mockImplementation((cb: any) => cb(mockTx))

    await request(makeApp()).patch("/job-1").send({ status: "completed" })

    expect(mockTx.inventoryItem.findMany).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the tests and verify they fail**

```bash
npx vitest run src/__tests__/jobs-completion-inventory.test.ts
```
Expected: FAIL — `mockTx.inventoryItem` is never touched, `unmatchedInventoryParts` is not part of the update call (the hook doesn't exist yet).

- [ ] **Step 3: Write the implementation**

In `backend/src/routes/jobs.ts`, add the import near the other service imports (after the `job-status.js` import at line 4):

```ts
import { matchPartsToInventory } from "../services/inventory-match.js";
```

Then modify the completion transaction (currently `jobs.ts:426-462`) to compute and apply the decrement before the `tx.job.update` call, and fold `unmatchedInventoryParts` into `data`:

```ts
    // If completing, use transaction to also create invoice
    if (parsed.data.status === "completed") {
      const result = await prisma.$transaction(async (tx) => {
        const partsUsed = parsed.data.partsUsed ?? [];
        if (partsUsed.length > 0) {
          const inventoryItems = await tx.inventoryItem.findMany({
            where: { organizationId: req.user!.organizationId },
            select: { id: true, name: true, quantityOnHand: true },
          });
          const { decrements, unmatched } = matchPartsToInventory(partsUsed, inventoryItems);
          for (const { itemId, count } of decrements) {
            const item = inventoryItems.find((i) => i.id === itemId)!;
            const newQuantity = item.quantityOnHand - count;
            if (newQuantity < 0) {
              console.warn(
                `[Inventory] ${item.name} (${itemId}) would go negative (${newQuantity}) on job ${req.params.id} — clamped to 0`
              );
            }
            await tx.inventoryItem.update({
              where: { id: itemId },
              data: { quantityOnHand: Math.max(0, newQuantity) },
            });
          }
          data.unmatchedInventoryParts = unmatched;
        }

        const updatedJob = await tx.job.update({
          where: { id: req.params.id, organizationId: req.user!.organizationId },
          data,
          include: {
            customer: { select: { id: true, name: true, address: true, email: true } },
            technician: { select: { id: true, name: true } },
            recurringJob: { select: { intervalDays: true } },
          },
        });
```

The rest of the transaction block (`dueDate`, `laborHours`, `invoiceAmount`, `descriptionParts`, `tx.invoice.create`, `return updatedJob`) is unchanged.

- [ ] **Step 4: Run the tests and verify they pass**

```bash
npx vitest run src/__tests__/jobs-completion-inventory.test.ts
```
Expected: PASS — 3 tests.

- [ ] **Step 5: Run the full backend test suite**

```bash
npx vitest run
```
Expected: PASS on everything except the 2 pre-existing unrelated failures noted in Task 2 Step 6.

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/jobs.ts backend/src/__tests__/jobs-completion-inventory.test.ts
git commit -m "feat: decrement inventory on job completion"
```

---

## Chunk 2 Review

Dispatch `plan-document-reviewer` subagent against this chunk before proceeding to Chunk 3.

---

## Chunk 3: Frontend — Manage Inventory & Surface Unmatched Parts

### Task 6: Add frontend types

**Files:**
- Modify: `frontend/src/api/types.ts`

- [ ] **Step 1: Add the `InventoryItem` interface**

In `frontend/src/api/types.ts`, add this near `PricebookItem` (around line 289, right after its closing `}`):

```ts
export interface InventoryItem {
  id: string
  organizationId: string
  name: string
  quantityOnHand: number
  reorderThreshold: number
  unit?: string | null
  createdAt: string
  updatedAt: string
}
```

- [ ] **Step 2: Add `unmatchedInventoryParts` to `ApiJob`**

In the same file, add this field to `ApiJob` (around line 34), right after `partsUsed: string[]`:

```ts
  partsUsed: string[]
  unmatchedInventoryParts: string[]
```

- [ ] **Step 3: Typecheck**

From `frontend/`:
```bash
npx tsc --noEmit
```
Expected: no new errors (this repo has zero pre-existing frontend type errors as of this plan).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/api/types.ts
git commit -m "feat: add InventoryItem and unmatchedInventoryParts types"
```

---

### Task 7: Inventory management UI

**Files:**
- Create: `frontend/src/components/inventory/inventory-table.tsx`
- Create: `frontend/src/components/inventory/inventory-item-dialog.tsx`
- Create: `frontend/src/components/inventory/inventory-settings.tsx`
- Modify: `frontend/src/pages/office/OfficeSettings.tsx`

This trio mirrors `frontend/src/components/pricebook/pricebook-table.tsx`, `pricebook-item-dialog.tsx`, and `pricebook-settings.tsx` exactly — read those first if anything below is unclear. No backend call here has been left unimplemented; every one exists from Chunk 1. Matching this codebase's existing convention (no test files exist for the analogous pricebook UI components), this task has no automated frontend tests — verify manually in the browser at the end (Step 5).

- [ ] **Step 1: Create the table component**

Create `frontend/src/components/inventory/inventory-table.tsx`:

```tsx
import { useState } from "react"
import { InventoryItem } from "@/api/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { AlertTriangle, Pencil, Trash2 } from "lucide-react"

interface Props {
  items: InventoryItem[]
  onEdit: (item: InventoryItem) => void
  onDelete: (id: string) => void
}

export function InventoryTable({ items, onEdit, onDelete }: Props) {
  const [search, setSearch] = useState("")

  const filtered = items.filter((item) =>
    item.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
        <Input
          placeholder="Search parts…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs h-8"
        />
        <span className="text-xs text-muted-foreground">{items.length} items</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/20 text-xs text-muted-foreground uppercase tracking-wide">
              <th className="text-left px-4 py-3">Part</th>
              <th className="text-right px-3 py-3">On Hand</th>
              <th className="text-right px-3 py-3">Reorder At</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((item) => {
              const low = item.quantityOnHand <= item.reorderThreshold
              return (
                <tr key={item.id} className={`border-t ${low ? "bg-amber-50 dark:bg-amber-950/20" : ""}`}>
                  <td className="px-4 py-3">
                    <div className="font-medium">{item.name}</div>
                    {item.unit && <span className="text-xs text-muted-foreground">{item.unit}</span>}
                  </td>
                  <td className="px-3 py-3 text-right font-medium">
                    <div className="flex items-center justify-end gap-1.5">
                      {low && <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />}
                      {item.quantityOnHand}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right text-muted-foreground">{item.reorderThreshold}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 justify-end">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(item)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        onClick={() => onDelete(item.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              )
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                  No items found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="px-4 py-2 border-t bg-muted/10 text-xs text-muted-foreground flex items-center gap-1.5">
        <AlertTriangle className="h-3 w-3 text-amber-600" /> Highlighted rows are at or below their reorder threshold
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create the add/edit dialog**

Create `frontend/src/components/inventory/inventory-item-dialog.tsx`:

```tsx
import { useEffect, useState } from "react"
import { InventoryItem } from "@/api/types"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface Props {
  open: boolean
  item?: InventoryItem | null
  onSave: (data: Partial<InventoryItem>) => void
  onClose: () => void
}

export function InventoryItemDialog({ open, item, onSave, onClose }: Props) {
  const [form, setForm] = useState({
    name: "",
    quantityOnHand: "",
    reorderThreshold: "",
    unit: "",
  })

  useEffect(() => {
    if (item) {
      setForm({
        name: item.name,
        quantityOnHand: String(item.quantityOnHand),
        reorderThreshold: String(item.reorderThreshold),
        unit: item.unit ?? "",
      })
    } else {
      setForm({ name: "", quantityOnHand: "", reorderThreshold: "0", unit: "" })
    }
  }, [item, open])

  function handleSave() {
    onSave({
      name: form.name,
      quantityOnHand: parseInt(form.quantityOnHand, 10),
      reorderThreshold: form.reorderThreshold ? parseInt(form.reorderThreshold, 10) : 0,
      unit: form.unit || undefined,
    })
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{item ? "Edit Part" : "Add Part"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <Label>Name</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Capacitor 45/5"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Quantity On Hand</Label>
              <Input
                type="number"
                min="0"
                step="1"
                value={form.quantityOnHand}
                onChange={(e) => setForm((f) => ({ ...f, quantityOnHand: e.target.value }))}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Reorder Threshold</Label>
              <Input
                type="number"
                min="0"
                step="1"
                value={form.reorderThreshold}
                onChange={(e) => setForm((f) => ({ ...f, reorderThreshold: e.target.value }))}
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>
              Unit <span className="text-muted-foreground text-xs">(optional)</span>
            </Label>
            <Input
              placeholder="e.g. each, lb"
              value={form.unit}
              onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!form.name || form.quantityOnHand === ""}>
            {item ? "Save Changes" : "Add Part"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 3: Create the container component**

Create `frontend/src/components/inventory/inventory-settings.tsx`:

```tsx
import { useState, useEffect } from "react"
import { api } from "@/api/client"
import { InventoryItem } from "@/api/types"
import { InventoryTable } from "./inventory-table"
import { InventoryItemDialog } from "./inventory-item-dialog"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import { toast } from "sonner"

export function InventorySettings() {
  const [items, setItems] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null)

  async function loadItems() {
    try {
      const data = await api.get<InventoryItem[]>("/api/inventory")
      setItems(data)
    } catch {
      toast.error("Failed to load inventory")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadItems()
  }, [])

  async function handleSave(data: Partial<InventoryItem>) {
    try {
      if (editingItem) {
        await api.patch(`/api/inventory/${editingItem.id}`, data)
        toast.success("Part updated")
      } else {
        await api.post("/api/inventory", data)
        toast.success("Part added")
      }
      setDialogOpen(false)
      setEditingItem(null)
      loadItems()
    } catch {
      toast.error("Failed to save part")
    }
  }

  async function handleDelete(id: string) {
    try {
      await api.delete(`/api/inventory/${id}`)
      toast.success("Part removed")
      loadItems()
    } catch {
      toast.error("Failed to remove part")
    }
  }

  if (loading) {
    return <div className="py-8 text-center text-muted-foreground">Loading inventory…</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Inventory</h3>
          <p className="text-sm text-muted-foreground">
            Track parts on hand. Completing a job automatically decrements matched parts.
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setEditingItem(null)
            setDialogOpen(true)
          }}
        >
          <Plus className="h-4 w-4 mr-1" /> Add Part
        </Button>
      </div>

      <InventoryTable
        items={items}
        onEdit={(item) => {
          setEditingItem(item)
          setDialogOpen(true)
        }}
        onDelete={handleDelete}
      />

      <InventoryItemDialog
        open={dialogOpen}
        item={editingItem}
        onSave={handleSave}
        onClose={() => {
          setDialogOpen(false)
          setEditingItem(null)
        }}
      />
    </div>
  )
}
```

- [ ] **Step 4: Wire into Office Settings**

In `frontend/src/pages/office/OfficeSettings.tsx`, add the import next to the `PricebookSettings` import (line 14):

```tsx
import { InventorySettings } from "@/components/inventory/inventory-settings"
```

Then add a new `Card` section right after the Pricebook card closes (after the `</Card>` that follows the `<PricebookSettings />` block, currently around line 458, before the `{/* Payment Collection */}` comment):

```tsx
      {/* Inventory */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base font-semibold text-card-foreground">
            <Boxes className="h-4 w-4 text-muted-foreground" />
            Inventory
          </CardTitle>
        </CardHeader>
        <CardContent>
          <InventorySettings />
        </CardContent>
      </Card>
```

Add `Boxes` to the existing `lucide-react` import list at the top of the file (the same import that already includes `BookOpen`, `CreditCard`, etc., line 13).

- [ ] **Step 5: Manually verify in the browser**

Start the dev server and confirm the feature works end to end:
```bash
npm run dev
```
Navigate to `/office/settings`, scroll to the new "Inventory" card. Add a part (e.g. name "Capacitor 45/5", quantity 5, reorder threshold 2), confirm it appears in the table. Edit it, confirm the change persists on reload. Delete it, confirm it disappears.

- [ ] **Step 6: Typecheck**

```bash
npx tsc --noEmit
```
Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/inventory frontend/src/pages/office/OfficeSettings.tsx
git commit -m "feat: add inventory management UI to office settings"
```

---

### Task 8: Surface unmatched parts on the jobs table

**Files:**
- Modify: `frontend/src/components/jobs/jobs-table.tsx`

- [ ] **Step 1: Add the icon import**

In `frontend/src/components/jobs/jobs-table.tsx`, add `AlertTriangle` to the existing `lucide-react` import list (around line 14-26, which already includes `Trash2`):

```tsx
  Trash2,
  AlertTriangle,
} from "lucide-react"
```

- [ ] **Step 2: Add the warning block to the expanded row**

In the same file, inside the `{isExpanded && (...)}` block (starts around line 245), add this right after the `<ComplianceTimeline jobId={job.id} />` line (around line 262), before the `{job.photos && ...}` block:

```tsx
                    {job.unmatchedInventoryParts && job.unmatchedInventoryParts.length > 0 && (
                      <div className="mt-4 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/20">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                        <div>
                          <span className="font-medium text-amber-800 dark:text-amber-400">
                            Parts not matched to inventory:
                          </span>{" "}
                          <span className="text-amber-700 dark:text-amber-500">
                            {job.unmatchedInventoryParts.join(", ")}
                          </span>
                        </div>
                      </div>
                    )}
```

- [ ] **Step 3: Manually verify**

With the dev server running (from Task 7 Step 5), completing a job is a **technician** action, not an office one — `partsUsed` is only ever set via `frontend/src/components/jobs/completion-dialog.tsx`, wired up from `frontend/src/pages/technician/TechnicianJobs.tsx`. To exercise this end to end:
1. Log in as a technician (or use the demo technician login from `/login`) and find (or create, via the office view, then assign/move it to `in_progress`) a job in `in_progress` status.
2. Open that job in the technician app, complete it via the completion dialog, and in the parts-used field enter something that won't match any inventory item you created in Task 7 Step 5 (e.g. "Thermostat", assuming no such inventory item exists).
3. Log back in as office (or switch demo accounts), go to `/office/jobs`, find that job, and expand its row.
4. Confirm the amber warning appears listing "Thermostat".

- [ ] **Step 4: Typecheck**

```bash
npx tsc --noEmit
```
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/jobs/jobs-table.tsx
git commit -m "feat: surface unmatched inventory parts on job detail"
```

---

## Chunk 3 Review

Dispatch `plan-document-reviewer` subagent against this final chunk. Once approved, this plan is complete — Inventory Tracking ships as a standalone feature. The next plan (Core Owner AI Assistant) will build its `get_inventory_status` tool and low-stock proactive trigger against the `InventoryItem` model this plan created.
