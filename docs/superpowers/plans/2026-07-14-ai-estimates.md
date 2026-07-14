# AI Pricebook + Smart Estimates Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an AI-powered Good/Better/Best estimate system with a pricebook catalog, allowing technicians to create AI-drafted proposals in the field that customers can approve on-device or via a portal link with digital signature and optional Stripe deposit.

**Architecture:** New `PricebookItem`, `Estimate`, and `EstimateLine` Prisma models back three new Express routers (`/api/pricebook`, `/api/estimates`, `/api/jobs/:jobId/estimates`). A new Claude service (`estimate-ai.ts`) handles both org-signup seeding (~40 HVAC items) and per-job estimate generation (Good/Better/Best tiers). The frontend adds an admin Pricebook tab in Settings, a tech-facing estimate builder (three-tab view with catalog drawer), and a public customer approval page at `/customer/estimates/:token`.

**Tech Stack:** Prisma migrations, Express + Zod validation, Anthropic SDK (claude-haiku-4-20250514 from `ai-config.ts`), React + shadcn/ui, react-signature-canvas (for on-device signing), Stripe PaymentIntents (deposit)

---

## Chunk 1: Data Layer

### Task 1: Schema migration — PricebookItem, Estimate, EstimateLine

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: migration via `npx prisma migrate dev`

- [ ] **Step 1: Add models to schema**

Open `backend/prisma/schema.prisma`. After the `Invoice` model, add:

```prisma
model PricebookItem {
  id             String   @id @default(cuid())
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  name           String
  description    String?
  category       String   // cooling | heating | parts | labor | maintenance
  unit           String?
  unitPrice      Float
  locked         Boolean  @default(false)
  source         String   @default("admin") // "admin" | "ai"
  active         Boolean  @default(true)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  lines          EstimateLine[]

  @@index([organizationId])
}

model Estimate {
  id             String   @id @default(cuid())
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  jobId          String
  job            Job      @relation(fields: [jobId], references: [id], onDelete: Cascade)
  token          String   @unique @default(cuid())
  status         String   @default("draft") // draft | sent | approved | declined | expired
  selectedTier   String?  // good | better | best
  signatureData  String?
  signedAt       DateTime?
  depositAmount  Float?
  depositPaidAt  DateTime?
  stripePaymentIntentId String?
  sentAt         DateTime?
  approvedAt     DateTime?
  expiresAt      DateTime?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  lines          EstimateLine[]

  @@index([jobId])
  @@index([organizationId])
  @@index([token])
}

model EstimateLine {
  id              String   @id @default(cuid())
  estimateId      String
  estimate        Estimate @relation(fields: [estimateId], references: [id], onDelete: Cascade)
  pricebookItemId String?
  pricebookItem   PricebookItem? @relation(fields: [pricebookItemId], references: [id])
  tier            String   // good | better | best
  name            String
  quantity        Float    @default(1)
  unitPrice       Float
  locked          Boolean  @default(false)
  source          String   @default("manual") // "ai" | "manual"
}
```

- [ ] **Step 2: Add fields and relations to existing models**

In the `Organization` model, add after `onboardingDismissed`:

```prisma
  estimateDepositThreshold Float  @default(500)
  estimateDepositPercent   Int    @default(25)
  pricebookItems           PricebookItem[]
  estimates                Estimate[]
```

In the `Job` model, add after `invoices`:

```prisma
  estimates    Estimate[]
```

- [ ] **Step 3: Run migration**

```bash
cd backend && npx prisma migrate dev --name add-pricebook-and-estimates
```

Expected: new migration file created in `backend/prisma/migrations/`, `✓ Your database is now in sync with your schema.`

- [ ] **Step 4: Verify generated types**

```bash
npx prisma generate
```

Expected: `✓ Generated Prisma Client`

- [ ] **Step 5: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/
git commit -m "feat: add PricebookItem, Estimate, EstimateLine schema + org deposit fields"
```

---

### Task 2: Pricebook routes + tests

**Files:**
- Create: `backend/src/routes/pricebook.ts`
- Create: `backend/src/__tests__/pricebook.test.ts`
- Modify: `backend/src/index.ts`

- [ ] **Step 1: Write failing tests**

Create `backend/src/__tests__/pricebook.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    pricebookItem: {
      findMany: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { prisma } from "../lib/prisma.js";
import { pricebookRouter } from "../routes/pricebook.js";
import express from "express";
import request from "supertest";

function makeApp(role: string) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { id: "user-1", organizationId: "org-1", role };
    next();
  });
  app.use("/api/pricebook", pricebookRouter);
  return app;
}

describe("GET /api/pricebook", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns active items for org", async () => {
    const items = [{ id: "item-1", name: "Refrigerant recharge", active: true }];
    (prisma.pricebookItem.findMany as any).mockResolvedValue(items);

    const res = await request(makeApp("office")).get("/api/pricebook");
    expect(res.status).toBe(200);
    expect(res.body).toEqual(items);
    expect(prisma.pricebookItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: "org-1", active: true } })
    );
  });
});

describe("POST /api/pricebook", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates item for admin", async () => {
    const item = { id: "item-2", name: "Capacitor", category: "cooling", unitPrice: 140 };
    (prisma.pricebookItem.create as any).mockResolvedValue(item);

    const res = await request(makeApp("office")).post("/api/pricebook").send({
      name: "Capacitor",
      category: "cooling",
      unitPrice: 140,
    });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Capacitor");
  });

  it("returns 403 for technician role", async () => {
    const res = await request(makeApp("technician")).post("/api/pricebook").send({
      name: "X",
      category: "cooling",
      unitPrice: 10,
    });
    expect(res.status).toBe(403);
  });
});

describe("PATCH /api/pricebook/:id", () => {
  beforeEach(() => vi.clearAllMocks());

  it("updates item for admin", async () => {
    (prisma.pricebookItem.findFirst as any).mockResolvedValue({ id: "item-1", organizationId: "org-1" });
    (prisma.pricebookItem.update as any).mockResolvedValue({ id: "item-1", unitPrice: 200 });

    const res = await request(makeApp("office")).patch("/api/pricebook/item-1").send({ unitPrice: 200 });
    expect(res.status).toBe(200);
  });

  it("returns 404 when item not in org", async () => {
    (prisma.pricebookItem.findFirst as any).mockResolvedValue(null);
    const res = await request(makeApp("office")).patch("/api/pricebook/bad-id").send({ unitPrice: 1 });
    expect(res.status).toBe(404);
  });

  it("returns 403 for technician", async () => {
    const res = await request(makeApp("technician")).patch("/api/pricebook/item-1").send({ unitPrice: 1 });
    expect(res.status).toBe(403);
  });
});

describe("DELETE /api/pricebook/:id", () => {
  beforeEach(() => vi.clearAllMocks());

  it("soft-deletes item (sets active: false)", async () => {
    (prisma.pricebookItem.findFirst as any).mockResolvedValue({ id: "item-1", organizationId: "org-1" });
    (prisma.pricebookItem.update as any).mockResolvedValue({ id: "item-1", active: false });

    const res = await request(makeApp("office")).delete("/api/pricebook/item-1");
    expect(res.status).toBe(200);
    expect(prisma.pricebookItem.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { active: false } })
    );
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd backend && npx vitest run src/__tests__/pricebook.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Create pricebook route**

Create `backend/src/routes/pricebook.ts`:

```typescript
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { z } from "zod";

export const pricebookRouter = Router();

const requireAdmin = (req: any, res: any, next: any) => {
  if (req.user?.role !== "office") return res.status(403).json({ error: "Forbidden" });
  next();
};

const itemSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  category: z.enum(["cooling", "heating", "parts", "labor", "maintenance"]),
  unit: z.string().optional(),
  unitPrice: z.number().positive(),
  locked: z.boolean().optional(),
});

const updateItemSchema = itemSchema.partial();

// GET /api/pricebook
pricebookRouter.get("/", async (req, res) => {
  try {
    const items = await prisma.pricebookItem.findMany({
      where: { organizationId: req.user!.organizationId, active: true },
      orderBy: [{ category: "asc" }, { name: "asc" }],
    });
    res.json(items);
  } catch {
    res.status(500).json({ error: "Failed to fetch pricebook" });
  }
});

// POST /api/pricebook
pricebookRouter.post("/", requireAdmin, async (req, res) => {
  const parsed = itemSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid data", details: parsed.error.flatten() });

  try {
    const item = await prisma.pricebookItem.create({
      data: { ...parsed.data, organizationId: req.user!.organizationId, source: "admin" },
    });
    res.status(201).json(item);
  } catch {
    res.status(500).json({ error: "Failed to create item" });
  }
});

// PATCH /api/pricebook/:id
pricebookRouter.patch("/:id", requireAdmin, async (req, res) => {
  const existing = await prisma.pricebookItem.findFirst({
    where: { id: req.params.id, organizationId: req.user!.organizationId },
  });
  if (!existing) return res.status(404).json({ error: "Item not found" });

  const parsed = updateItemSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid data", details: parsed.error.flatten() });

  try {
    const item = await prisma.pricebookItem.update({ where: { id: req.params.id }, data: parsed.data });
    res.json(item);
  } catch {
    res.status(500).json({ error: "Failed to update item" });
  }
});

// DELETE /api/pricebook/:id
pricebookRouter.delete("/:id", requireAdmin, async (req, res) => {
  const existing = await prisma.pricebookItem.findFirst({
    where: { id: req.params.id, organizationId: req.user!.organizationId },
  });
  if (!existing) return res.status(404).json({ error: "Item not found" });

  try {
    const item = await prisma.pricebookItem.update({ where: { id: req.params.id }, data: { active: false } });
    res.json(item);
  } catch {
    res.status(500).json({ error: "Failed to delete item" });
  }
});
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd backend && npx vitest run src/__tests__/pricebook.test.ts
```

Expected: PASS (4/4)

- [ ] **Step 5: Wire router into index.ts**

In `backend/src/index.ts`, add near the other imports:

```typescript
import { pricebookRouter } from "./routes/pricebook.js";
```

And near the other `app.use` route registrations (after the existing ones):

```typescript
app.use("/api/pricebook", apiLimiter, requireAuth, requireSubscription, pricebookRouter);
```

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/pricebook.ts backend/src/__tests__/pricebook.test.ts backend/src/index.ts
git commit -m "feat: add pricebook CRUD routes with admin-only write protection"
```

---

### Task 3: AI estimate service (seeding + generation)

**Files:**
- Create: `backend/src/services/estimate-ai.ts`
- Create: `backend/src/__tests__/estimate-ai.test.ts`
- Modify: `backend/src/routes/auth.ts` (fire-and-forget seeding on register)

- [ ] **Step 1: Write failing tests**

Create `backend/src/__tests__/estimate-ai.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    pricebookItem: {
      count: vi.fn(),
      createMany: vi.fn(),
    },
    job: {
      findFirst: vi.fn(),
    },
    pricebookItem: {
      count: vi.fn(),
      createMany: vi.fn(),
      findMany: vi.fn(),
    },
    estimate: {
      create: vi.fn(),
    },
  },
}));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    messages = { create: vi.fn() };
  },
}));

import { prisma } from "../lib/prisma.js";
import { seedPricebook, generateEstimate } from "../services/estimate-ai.js";

describe("seedPricebook", () => {
  beforeEach(() => vi.clearAllMocks());

  it("skips when ANTHROPIC_API_KEY is not set", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.resetModules();
    const { seedPricebook: fn } = await import("../services/estimate-ai.js");
    await fn("org-1");
    expect(prisma.pricebookItem.count).not.toHaveBeenCalled();
  });

  it("skips when org already has pricebook items", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    vi.resetModules();
    const { seedPricebook: fn } = await import("../services/estimate-ai.js");
    (prisma.pricebookItem.count as any).mockResolvedValue(5);
    await fn("org-1");
    expect(prisma.pricebookItem.createMany).not.toHaveBeenCalled();
  });
});

describe("generateEstimate", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns error when AI not configured", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.resetModules();
    const { generateEstimate: fn } = await import("../services/estimate-ai.js");
    const result = await fn("job-1", "org-1");
    expect(result).toEqual({ error: "not_configured" });
  });

  it("returns error when job not found", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    vi.resetModules();
    const { generateEstimate: fn } = await import("../services/estimate-ai.js");
    (prisma.job.findFirst as any).mockResolvedValue(null);
    const result = await fn("job-999", "org-1");
    expect(result).toEqual({ error: "failed" });
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd backend && npx vitest run src/__tests__/estimate-ai.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Create estimate-ai service**

Create `backend/src/services/estimate-ai.ts`:

```typescript
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "../lib/prisma.js";
import { AI_MODEL } from "../lib/ai-config.js";

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.log("[EstimateAI] Skipped — no ANTHROPIC_API_KEY set");
}

const anthropic = apiKey ? new Anthropic({ apiKey }) : null;

// ─── Pricebook Seeding ───────────────────────────────────────────────────────

export async function seedPricebook(organizationId: string): Promise<void> {
  if (!anthropic) return;

  // Idempotent: skip if already seeded
  const existing = await prisma.pricebookItem.count({ where: { organizationId } });
  if (existing > 0) return;

  try {
    const response = await anthropic.messages.create({
      model: AI_MODEL,
      max_tokens: 4096,
      system: `You are an HVAC business consultant. Generate a starter pricebook for a new HVAC company. 
Return a JSON array of exactly 40 items covering common HVAC services. Each item must have:
- name: string (clear service name)
- description: string (brief description)
- category: "cooling" | "heating" | "parts" | "labor" | "maintenance"
- unit: string (e.g. "per visit", "each", "per lb", "per hour")
- unitPrice: number (typical market price in USD, whole dollars)

Cover these categories:
- Cooling (8 items): refrigerant recharge, capacitor replacement, coil cleaning, fan motor replacement, compressor replacement, refrigerant leak detection, condenser cleaning, evaporator coil replacement
- Heating (8 items): heat exchanger inspection, igniter replacement, flame sensor replacement, gas valve replacement, blower motor replacement, furnace tune-up, pilot light service, draft inducer motor
- Parts (8 items): R-410A refrigerant per lb, run capacitor, start capacitor, contactor, 1-inch filter, 4-inch filter, belt, thermostat
- Labor (8 items): diagnostic fee, standard labor per hour, after-hours labor per hour, travel fee, emergency dispatch fee, system commissioning, permit fee allowance, warranty callback
- Maintenance (8 items): AC tune-up, furnace tune-up, full system inspection, duct cleaning, dryer vent cleaning, IAQ inspection, UV light installation, smart thermostat installation

Return ONLY valid JSON array, no markdown, no explanation.`,
      messages: [{ role: "user", content: "Generate the HVAC pricebook." }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const items = JSON.parse(text) as Array<{
      name: string;
      description: string;
      category: string;
      unit: string;
      unitPrice: number;
    }>;

    await prisma.pricebookItem.createMany({
      data: items.map((item) => ({
        ...item,
        organizationId,
        source: "ai",
        locked: false,
        active: true,
      })),
    });

    console.log(`[EstimateAI] Seeded ${items.length} pricebook items for org ${organizationId}`);
  } catch (err) {
    console.error("[EstimateAI] Seeding failed:", err);
  }
}

// ─── Estimate Generation ─────────────────────────────────────────────────────

type EstimateResult =
  | { estimateId: string }
  | { error: "not_configured" }
  | { error: "failed" }
  | { error: "job_not_found" };

export async function generateEstimate(jobId: string, organizationId: string): Promise<EstimateResult> {
  if (!anthropic) return { error: "not_configured" };

  const job = await prisma.job.findFirst({
    where: { id: jobId, organizationId },
    include: {
      customer: {
        include: {
          jobs: {
            orderBy: { createdAt: "desc" },
            take: 5,
            select: { title: true, notes: true, completedAt: true },
          },
        },
      },
    },
  });

  if (!job) return { error: "job_not_found" };

  const pricebookItems = await prisma.pricebookItem.findMany({
    where: { organizationId, active: true },
    orderBy: { category: "asc" },
  });

  const pricebookJson = JSON.stringify(
    pricebookItems.map((i) => ({ id: i.id, name: i.name, category: i.category, unitPrice: i.unitPrice, unit: i.unit }))
  );

  const jobHistory = job.customer.jobs
    .map((j) => `- ${j.title}${j.notes ? `: ${j.notes}` : ""}`)
    .join("\n");

  try {
    const response = await anthropic.messages.create({
      model: AI_MODEL,
      max_tokens: 4096,
      system: `You are an expert HVAC estimator. Given a job description and a pricebook, generate a Good/Better/Best estimate.

TIER LOGIC:
- For REPAIR jobs (refrigerant, electrical faults, leaks): Good = fix now. Better = fix + address wear items. Best = fix + full tune-up.
- For REPLACEMENT jobs (motors, compressors, coils): Good = OEM-equivalent part, 90-day warranty. Better = OEM part, 1-year warranty. Best = premium part + 2-year warranty.

PRICEBOOK: ${pricebookJson}

Return a JSON object with this structure:
{
  "good": [{ "pricebookItemId": "...", "quantity": 1, "name": "...", "unitPrice": 0 }],
  "better": [{ "pricebookItemId": "...", "quantity": 1, "name": "...", "unitPrice": 0 }],
  "best": [{ "pricebookItemId": "...", "quantity": 1, "name": "...", "unitPrice": 0 }]
}

Rules:
- Use pricebookItemId from the pricebook when available; set to null for items not in the pricebook
- name and unitPrice must match the pricebook item exactly when pricebookItemId is set
- Each tier must build on the previous (better includes everything in good, best includes everything in better)
- Include 2-6 line items per tier
- If pricebook is empty, use reasonable HVAC market prices and set pricebookItemId to null

Return ONLY valid JSON, no markdown.`,
      messages: [
        {
          role: "user",
          content: `Job: ${job.title}
Notes: ${job.notes ?? "None"}
Customer equipment history:\n${jobHistory || "No prior history"}`,
        },
      ],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "{}";
    const tiers = JSON.parse(text) as {
      good: Array<{ pricebookItemId: string | null; quantity: number; name: string; unitPrice: number }>;
      better: Array<{ pricebookItemId: string | null; quantity: number; name: string; unitPrice: number }>;
      best: Array<{ pricebookItemId: string | null; quantity: number; name: string; unitPrice: number }>;
    };

    const estimate = await prisma.estimate.create({
      data: {
        organizationId,
        jobId,
        status: "draft",
        lines: {
          create: [
            ...tiers.good.map((l) => ({ ...l, tier: "good", source: "ai", locked: false })),
            ...tiers.better.map((l) => ({ ...l, tier: "better", source: "ai", locked: false })),
            ...tiers.best.map((l) => ({ ...l, tier: "best", source: "ai", locked: false })),
          ],
        },
      },
      include: { lines: true },
    });

    return { estimateId: estimate.id };
  } catch (err) {
    console.error("[EstimateAI] Generation failed:", err);
    return { error: "failed" };
  }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd backend && npx vitest run src/__tests__/estimate-ai.test.ts
```

Expected: PASS (4/4)

- [ ] **Step 5: Hook seeding into auth register**

In `backend/src/routes/auth.ts`, add import at the top:

```typescript
import { seedPricebook } from "../services/estimate-ai.js";
```

After the existing `createStripeCustomer` fire-and-forget call (look for `stripeService.createCustomerForOrg` or similar), add:

```typescript
// Fire-and-forget pricebook seeding
seedPricebook(newOrg.id).catch((err) =>
  console.error("[Register] Pricebook seeding error:", err)
);
```

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/estimate-ai.ts backend/src/__tests__/estimate-ai.test.ts backend/src/routes/auth.ts
git commit -m "feat: add AI pricebook seeding on signup and estimate generation service"
```

---

### Task 4: Estimates routes + tests

**Files:**
- Create: `backend/src/routes/estimates.ts`
- Create: `backend/src/__tests__/estimates.test.ts`
- Modify: `backend/src/index.ts`

- [ ] **Step 1: Write failing tests**

Create `backend/src/__tests__/estimates.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    estimate: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    estimateLine: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    job: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    organization: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("../services/estimate-ai.js", () => ({
  generateEstimate: vi.fn(),
}));

vi.mock("../services/email.js", () => ({
  sendEmail: vi.fn(),
}));

import { prisma } from "../lib/prisma.js";
import { generateEstimate } from "../services/estimate-ai.js";
import { estimatesRouter } from "../routes/estimates.js";
import express from "express";
import request from "supertest";

function makeApp(role = "technician") {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { id: "user-1", organizationId: "org-1", role };
    next();
  });
  app.use("/api/estimates", estimatesRouter);
  return app;
}

describe("POST /api/estimates/generate", () => {
  beforeEach(() => vi.clearAllMocks());

  it("generates estimate from jobId", async () => {
    (generateEstimate as any).mockResolvedValue({ estimateId: "est-1" });
    (prisma.estimate.findFirst as any).mockResolvedValue({
      id: "est-1",
      status: "draft",
      lines: [],
    });

    const res = await request(makeApp()).post("/api/estimates/generate").send({ jobId: "job-1" });
    expect(res.status).toBe(201);
    expect(res.body.id).toBe("est-1");
  });

  it("returns 400 when jobId missing", async () => {
    const res = await request(makeApp()).post("/api/estimates/generate").send({});
    expect(res.status).toBe(400);
  });

  it("returns 503 when AI not configured", async () => {
    (generateEstimate as any).mockResolvedValue({ error: "not_configured" });
    const res = await request(makeApp()).post("/api/estimates/generate").send({ jobId: "job-1" });
    expect(res.status).toBe(503);
  });
});

describe("GET /:token (public router)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns estimate for valid token", async () => {
    const est = { id: "est-1", token: "tok-1", status: "sent", expiresAt: null, lines: [], job: {} };
    (prisma.estimate.findFirst as any).mockResolvedValue(est);
    // publicEstimatesRouter is mounted at /:token
    const app2 = express();
    app2.use(express.json());
    app2.use("/", publicEstimatesRouter);
    const res = await request(app2).get("/tok-1");
    expect(res.status).toBe(200);
  });

  it("returns 404 for unknown token", async () => {
    (prisma.estimate.findFirst as any).mockResolvedValue(null);
    const app2 = express();
    app2.use(express.json());
    app2.use("/", publicEstimatesRouter);
    const res = await request(app2).get("/bad");
    expect(res.status).toBe(404);
  });

  it("returns 410 for expired estimate", async () => {
    const est = { id: "est-1", token: "tok-1", status: "sent", expiresAt: new Date("2020-01-01"), lines: [] };
    (prisma.estimate.findFirst as any).mockResolvedValue(est);
    const app2 = express();
    app2.use(express.json());
    app2.use("/", publicEstimatesRouter);
    const res = await request(app2).get("/tok-1");
    expect(res.status).toBe(410);
  });
});

describe("POST /api/estimates/token/:token/approve", () => {
  beforeEach(() => vi.clearAllMocks());

  it("approves estimate and updates job status", async () => {
    const est = {
      id: "est-1",
      jobId: "job-1",
      status: "sent",
      expiresAt: null,
      organizationId: "org-1",
      lines: [{ tier: "better", name: "Recharge", unitPrice: 160, quantity: 1 }],
    };
    (prisma.estimate.findFirst as any).mockResolvedValue(est);
    (prisma.estimate.update as any).mockResolvedValue({ ...est, status: "approved" });
    (prisma.job.update as any).mockResolvedValue({});

    const res = await request(makeApp()).post("/api/estimates/token/tok-1/approve").send({
      tier: "better",
      signatureData: "sig-data",
    });
    expect(res.status).toBe(200);
    expect(prisma.estimate.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "approved" }) })
    );
  });

  it("returns 409 when already approved", async () => {
    const est = { id: "est-1", status: "approved", expiresAt: null };
    (prisma.estimate.findFirst as any).mockResolvedValue(est);
    const res = await request(makeApp()).post("/api/estimates/token/tok-1/approve").send({
      tier: "better",
      signatureData: "x",
    });
    expect(res.status).toBe(409);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd backend && npx vitest run src/__tests__/estimates.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Create estimates route**

Create `backend/src/routes/estimates.ts`:

```typescript
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { generateEstimate } from "../services/estimate-ai.js";
import { sendEmail } from "../services/email.js";
import { z } from "zod";

export const estimatesRouter = Router();

const requireOfficeOrTech = (req: any, res: any, next: any) => {
  if (!req.user) return res.status(401).json({ error: "Unauthorized" });
  next();
};

// POST /api/estimates/generate
estimatesRouter.post("/generate", requireOfficeOrTech, async (req, res) => {
  const { jobId } = req.body;
  if (!jobId) return res.status(400).json({ error: "jobId is required" });

  const result = await generateEstimate(jobId, req.user!.organizationId);

  if ("error" in result) {
    if (result.error === "not_configured") return res.status(503).json({ error: "AI not configured" });
    if (result.error === "job_not_found") return res.status(404).json({ error: "Job not found" });
    return res.status(500).json({ error: "Failed to generate estimate" });
  }

  const estimate = await prisma.estimate.findFirst({
    where: { id: result.estimateId },
    include: { lines: { include: { pricebookItem: true } } },
  });

  res.status(201).json(estimate);
});

// GET /api/estimates/:id
estimatesRouter.get("/:id", requireOfficeOrTech, async (req, res) => {
  const estimate = await prisma.estimate.findFirst({
    where: { id: req.params.id, organizationId: req.user!.organizationId },
    include: { lines: { include: { pricebookItem: true } } },
  });
  if (!estimate) return res.status(404).json({ error: "Estimate not found" });
  res.json(estimate);
});

// PATCH /api/estimates/:id — update lines
estimatesRouter.patch("/:id", requireOfficeOrTech, async (req, res) => {
  const estimate = await prisma.estimate.findFirst({
    where: { id: req.params.id, organizationId: req.user!.organizationId },
  });
  if (!estimate) return res.status(404).json({ error: "Estimate not found" });
  if (estimate.status !== "draft") return res.status(400).json({ error: "Only draft estimates can be edited" });

  const linesSchema = z.array(
    z.object({
      pricebookItemId: z.string().nullable().optional(),
      tier: z.enum(["good", "better", "best"]),
      name: z.string().min(1),
      quantity: z.number().positive(),
      unitPrice: z.number().nonnegative(),
      locked: z.boolean().optional(),
      source: z.string().optional(),
    })
  );

  const parsed = linesSchema.safeParse(req.body.lines);
  if (!parsed.success) return res.status(400).json({ error: "Invalid lines", details: parsed.error.flatten() });

  await prisma.estimateLine.deleteMany({ where: { estimateId: req.params.id, locked: false } });
  await prisma.estimateLine.createMany({
    data: parsed.data.map((l) => ({ ...l, estimateId: req.params.id })),
  });

  const updated = await prisma.estimate.findFirst({
    where: { id: req.params.id },
    include: { lines: true },
  });
  res.json(updated);
});

// POST /api/estimates/:id/send
estimatesRouter.post("/:id/send", requireOfficeOrTech, async (req, res) => {
  const estimate = await prisma.estimate.findFirst({
    where: { id: req.params.id, organizationId: req.user!.organizationId },
    include: { job: { include: { customer: true } } },
  });
  if (!estimate) return res.status(404).json({ error: "Estimate not found" });

  const sentAt = new Date();
  const expiresAt = new Date(sentAt.getTime() + 48 * 60 * 60 * 1000);

  const updated = await prisma.estimate.update({
    where: { id: req.params.id },
    data: { status: "sent", sentAt, expiresAt },
  });

  const portalUrl = `${process.env.FRONTEND_URL ?? "http://localhost:5173"}/customer/estimates/${estimate.token}`;

  try {
    await sendEmail({
      to: estimate.job.customer.email ?? "",
      subject: `Your estimate from FlowSense — expires in 48 hours`,
      html: `<p>Hi ${estimate.job.customer.name},</p>
<p>Your estimate for <strong>${estimate.job.title}</strong> is ready to review.</p>
<p><a href="${portalUrl}">View Your Estimate</a></p>
<p>This link expires in 48 hours.</p>`,
    });
  } catch {
    console.error("[Estimates] Failed to send estimate email");
  }

  res.json(updated);
});

// ─── Public token endpoints (no auth middleware) ──────────────────────────────

// GET /api/estimates/token/:token
estimatesRouter.get("/token/:token", async (req, res) => {
  const estimate = await prisma.estimate.findFirst({
    where: { token: req.params.token },
    include: {
      lines: { include: { pricebookItem: true } },
      job: { select: { title: true, address: true } },
    },
  });

  if (!estimate) return res.status(404).json({ error: "Estimate not found" });

  if (estimate.expiresAt && estimate.expiresAt < new Date()) {
    return res.status(410).json({ error: "This estimate has expired — please contact us to request a new one." });
  }

  res.json(estimate);
});

const approveSchema = z.object({
  tier: z.enum(["good", "better", "best"]),
  signatureData: z.string().min(1),
});

// POST /api/estimates/token/:token/approve
estimatesRouter.post("/token/:token/approve", async (req, res) => {
  const estimate = await prisma.estimate.findFirst({
    where: { token: req.params.token },
    include: { lines: true },
  });

  if (!estimate) return res.status(404).json({ error: "Estimate not found" });
  if (estimate.status === "approved") return res.status(409).json({ error: "This estimate has already been approved." });
  if (estimate.expiresAt && estimate.expiresAt < new Date()) {
    return res.status(410).json({ error: "Estimate has expired." });
  }

  const parsed = approveSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid data", details: parsed.error.flatten() });

  const { tier, signatureData } = parsed.data;

  const org = await prisma.organization.findUnique({
    where: { id: estimate.organizationId },
    select: { estimateDepositThreshold: true, estimateDepositPercent: true },
  });

  const tierLines = estimate.lines.filter((l) => l.tier === tier);
  const total = tierLines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
  const depositAmount =
    org && total >= org.estimateDepositThreshold
      ? Math.round((total * org.estimateDepositPercent) / 100)
      : null;

  const updated = await prisma.estimate.update({
    where: { id: estimate.id },
    data: {
      status: "approved",
      selectedTier: tier,
      signatureData,
      signedAt: new Date(),
      approvedAt: new Date(),
      depositAmount,
    },
  });

  // Update job status to in_progress
  await prisma.job.update({
    where: { id: estimate.jobId },
    data: { status: "in_progress" },
  });

  res.json(updated);
});

// POST /api/estimates/token/:token/deposit — create Stripe payment intent
estimatesRouter.post("/token/:token/deposit", async (req, res) => {
  const estimate = await prisma.estimate.findFirst({
    where: { token: req.params.token },
  });

  if (!estimate) return res.status(404).json({ error: "Estimate not found" });
  if (!estimate.depositAmount) return res.status(400).json({ error: "No deposit required for this estimate" });

  // Stripe PaymentIntent creation — import stripe service when available
  // For now return the deposit amount so frontend can handle
  res.json({ depositAmountCents: Math.round(estimate.depositAmount * 100) });
});
```

- [ ] **Step 4: Add job estimates list route**

In `backend/src/routes/jobs.ts`, add near the end (before `export`):

```typescript
// GET /api/jobs/:jobId/estimates
jobsRouter.get("/:jobId/estimates", async (req, res) => {
  try {
    const estimates = await prisma.estimate.findMany({
      where: { jobId: req.params.jobId, organizationId: req.user!.organizationId },
      include: { lines: true },
      orderBy: { createdAt: "desc" },
    });
    res.json(estimates);
  } catch {
    res.status(500).json({ error: "Failed to fetch estimates" });
  }
});
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
cd backend && npx vitest run src/__tests__/estimates.test.ts
```

Expected: PASS (5/5)

- [ ] **Step 6: Wire routers into index.ts**

The public token endpoints need a **separate router** so they can be mounted at `/api/estimates/token` without the path prefix colliding. The routes inside that router must be at `/:token`, `/:token/approve`, and `/:token/deposit` (no `/token/` prefix inside the handler).

In `backend/src/routes/estimates.ts`, add a second exported router at the bottom:

```typescript
export const publicEstimatesRouter = Router();

// GET /api/estimates/token/:token → mounted at /api/estimates/token → path seen by router: /:token
publicEstimatesRouter.get("/:token", async (req, res) => {
  const estimate = await prisma.estimate.findFirst({
    where: { token: req.params.token },
    include: {
      lines: { include: { pricebookItem: true } },
      job: { select: { title: true, address: true } },
    },
  });
  if (!estimate) return res.status(404).json({ error: "Estimate not found" });
  if (estimate.expiresAt && estimate.expiresAt < new Date()) {
    return res.status(410).json({ error: "This estimate has expired — please contact us to request a new one." });
  }
  res.json(estimate);
});

publicEstimatesRouter.post("/:token/approve", async (req, res) => {
  const estimate = await prisma.estimate.findFirst({
    where: { token: req.params.token },
    include: { lines: true },
  });
  if (!estimate) return res.status(404).json({ error: "Estimate not found" });
  if (estimate.status === "approved") return res.status(409).json({ error: "This estimate has already been approved." });
  if (estimate.expiresAt && estimate.expiresAt < new Date()) {
    return res.status(410).json({ error: "Estimate has expired." });
  }

  const parsed = approveSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid data", details: parsed.error.flatten() });

  const { tier, signatureData } = parsed.data;

  const org = await prisma.organization.findUnique({
    where: { id: estimate.organizationId },
    select: { estimateDepositThreshold: true, estimateDepositPercent: true },
  });

  const tierLines = estimate.lines.filter((l) => l.tier === tier);
  const total = tierLines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
  const depositAmount =
    org && total >= org.estimateDepositThreshold
      ? Math.round((total * org.estimateDepositPercent) / 100)
      : null;

  const updated = await prisma.estimate.update({
    where: { id: estimate.id },
    data: { status: "approved", selectedTier: tier, signatureData, signedAt: new Date(), approvedAt: new Date(), depositAmount },
  });
  await prisma.job.update({ where: { id: estimate.jobId }, data: { status: "in_progress" } });
  res.json(updated);
});

publicEstimatesRouter.post("/:token/deposit", async (req, res) => {
  const estimate = await prisma.estimate.findFirst({ where: { token: req.params.token } });
  if (!estimate) return res.status(404).json({ error: "Estimate not found" });
  if (!estimate.depositAmount) return res.status(400).json({ error: "No deposit required for this estimate" });
  res.json({ depositAmountCents: Math.round(estimate.depositAmount * 100) });
});
```

Remove the three `estimatesRouter.get/post("/token/...")` handlers from `estimatesRouter` (they are now in `publicEstimatesRouter`).

In `backend/src/index.ts`, add both imports:

```typescript
import { estimatesRouter, publicEstimatesRouter } from "./routes/estimates.js";
```

Register routes — public router first, at the `/token` sub-path:

```typescript
// Public — no auth required (knowledge of token is authorization)
app.use("/api/estimates/token", apiLimiter, publicEstimatesRouter);

// Auth-protected
app.use("/api/estimates", apiLimiter, requireAuth, requireSubscription, estimatesRouter);
```

Express path matching means `/api/estimates/token/tok-1` is handled by `publicEstimatesRouter` (mounted at `/api/estimates/token`), and the router sees `/:token` = `tok-1`. No collision.

- [ ] **Step 7: Commit**

```bash
git add backend/src/routes/estimates.ts backend/src/__tests__/estimates.test.ts backend/src/routes/jobs.ts backend/src/index.ts
git commit -m "feat: add estimate generation, send, approve, and deposit endpoints"
```

---

## Chunk 2: Frontend

### Task 5: Frontend API types

**Files:**
- Modify: `frontend/src/api/types.ts` (or create if not present at this path — check `frontend/src/lib/` first)

- [ ] **Step 1: Locate and read the types file**

```bash
find frontend/src -name "types.ts" | head -5
```

- [ ] **Step 2: Add types**

Add to the types file:

```typescript
export interface PricebookItem {
  id: string;
  organizationId: string;
  name: string;
  description?: string | null;
  category: "cooling" | "heating" | "parts" | "labor" | "maintenance";
  unit?: string | null;
  unitPrice: number;
  locked: boolean;
  source: "admin" | "ai";
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface EstimateLine {
  id: string;
  estimateId: string;
  pricebookItemId?: string | null;
  tier: "good" | "better" | "best";
  name: string;
  quantity: number;
  unitPrice: number;
  locked: boolean;
  source: "ai" | "manual";
}

export interface Estimate {
  id: string;
  organizationId: string;
  jobId: string;
  token: string;
  status: "draft" | "sent" | "approved" | "declined" | "expired";
  selectedTier?: "good" | "better" | "best" | null;
  signatureData?: string | null;
  signedAt?: string | null;
  depositAmount?: number | null;
  depositPaidAt?: string | null;
  stripePaymentIntentId?: string | null;
  sentAt?: string | null;
  approvedAt?: string | null;
  expiresAt?: string | null;
  createdAt: string;
  updatedAt: string;
  lines: EstimateLine[];
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/
git commit -m "feat: add PricebookItem, Estimate, EstimateLine frontend types"
```

---

### Task 6: Admin pricebook UI

**Files:**
- Create: `frontend/src/components/pricebook/pricebook-table.tsx`
- Create: `frontend/src/components/pricebook/pricebook-item-dialog.tsx`
- Create: `frontend/src/components/pricebook/pricebook-settings.tsx`
- Modify: `frontend/src/pages/office/OfficeSettings.tsx`

- [ ] **Step 1: Read OfficeSettings to understand tab pattern**

Read `frontend/src/pages/office/OfficeSettings.tsx` fully before writing.

- [ ] **Step 2: Create pricebook-table.tsx**

Create `frontend/src/components/pricebook/pricebook-table.tsx`:

```tsx
import { useState } from "react";
import { PricebookItem } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Lock, Sparkles, Pencil, Trash2 } from "lucide-react";
import { api } from "@/lib/api";

const CATEGORIES = ["All", "cooling", "heating", "parts", "labor", "maintenance"] as const;

interface Props {
  items: PricebookItem[];
  onEdit: (item: PricebookItem) => void;
  onDelete: (id: string) => void;
  onToggleLock: (id: string, locked: boolean) => void;
  onRefresh: () => void;
}

export function PricebookTable({ items, onEdit, onDelete, onToggleLock }: Props) {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("All");

  const filtered = items.filter((item) => {
    const matchesSearch = item.name.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = activeCategory === "All" || item.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
        <Input
          placeholder="Search services…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs h-8"
        />
        <span className="text-xs text-muted-foreground">{items.length} items</span>
      </div>

      {/* Category tabs */}
      <div className="flex border-b overflow-x-auto">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-4 py-2 text-sm whitespace-nowrap border-b-2 transition-colors ${
              activeCategory === cat
                ? "border-primary text-primary font-medium"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {cat.charAt(0).toUpperCase() + cat.slice(1)}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/20 text-xs text-muted-foreground uppercase tracking-wide">
              <th className="text-left px-4 py-3">Service / Part</th>
              <th className="text-left px-3 py-3">Category</th>
              <th className="text-right px-3 py-3">Unit Price</th>
              <th className="text-center px-3 py-3">Locked</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((item) => (
              <tr
                key={item.id}
                className={`border-t ${item.locked ? "bg-amber-50 dark:bg-amber-950/20" : ""}`}
              >
                <td className="px-4 py-3">
                  <div className="font-medium">{item.name}</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    {item.source === "ai" && (
                      <Badge variant="secondary" className="text-xs gap-1 py-0">
                        <Sparkles className="h-2.5 w-2.5" /> AI suggested
                      </Badge>
                    )}
                    {item.unit && <span className="text-xs text-muted-foreground">{item.unit}</span>}
                  </div>
                </td>
                <td className="px-3 py-3 text-muted-foreground capitalize">{item.category}</td>
                <td className="px-3 py-3 text-right font-medium">
                  ${item.unitPrice.toFixed(0)}
                </td>
                <td className="px-3 py-3 text-center">
                  <Switch
                    checked={item.locked}
                    onCheckedChange={(checked) => onToggleLock(item.id, checked)}
                    className="data-[state=checked]:bg-amber-500"
                  />
                </td>
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
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  No items found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="px-4 py-2 border-t bg-muted/10 text-xs text-muted-foreground flex gap-4">
        <span className="flex items-center gap-1"><Sparkles className="h-3 w-3" /> AI suggested = seeded on signup, admin can edit</span>
        <span className="flex items-center gap-1"><Lock className="h-3 w-3" /> Locked = techs cannot modify this line item on estimates</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create pricebook-item-dialog.tsx**

Create `frontend/src/components/pricebook/pricebook-item-dialog.tsx`:

```tsx
import { useEffect, useState } from "react";
import { PricebookItem } from "@/api/types";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

interface Props {
  open: boolean;
  item?: PricebookItem | null;
  onSave: (data: Partial<PricebookItem>) => void;
  onClose: () => void;
}

const CATEGORIES = ["cooling", "heating", "parts", "labor", "maintenance"] as const;

export function PricebookItemDialog({ open, item, onSave, onClose }: Props) {
  const [form, setForm] = useState({
    name: "",
    description: "",
    category: "cooling" as PricebookItem["category"],
    unit: "",
    unitPrice: "",
  });

  useEffect(() => {
    if (item) {
      setForm({
        name: item.name,
        description: item.description ?? "",
        category: item.category,
        unit: item.unit ?? "",
        unitPrice: String(item.unitPrice),
      });
    } else {
      setForm({ name: "", description: "", category: "cooling", unit: "", unitPrice: "" });
    }
  }, [item, open]);

  function handleSave() {
    onSave({
      name: form.name,
      description: form.description || undefined,
      category: form.category,
      unit: form.unit || undefined,
      unitPrice: parseFloat(form.unitPrice),
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{item ? "Edit Item" : "Add Item"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <Label>Name</Label>
            <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="grid gap-1.5">
            <Label>Description <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Category</Label>
              <Select
                value={form.category}
                onValueChange={(v) => setForm((f) => ({ ...f, category: v as PricebookItem["category"] }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Unit <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Input
                placeholder="e.g. per lb, each"
                value={form.unit}
                onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>Unit Price ($)</Label>
            <Input
              type="number"
              min="0"
              step="1"
              value={form.unitPrice}
              onChange={(e) => setForm((f) => ({ ...f, unitPrice: e.target.value }))}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={!form.name || !form.unitPrice}>
            {item ? "Save Changes" : "Add Item"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Create pricebook-settings.tsx**

Create `frontend/src/components/pricebook/pricebook-settings.tsx`:

```tsx
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { PricebookItem } from "@/api/types";
import { PricebookTable } from "./pricebook-table";
import { PricebookItemDialog } from "./pricebook-item-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus } from "lucide-react";
import { toast } from "sonner";

export function PricebookSettings() {
  const [items, setItems] = useState<PricebookItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<PricebookItem | null>(null);
  const [depositThreshold, setDepositThreshold] = useState("500");
  const [depositPercent, setDepositPercent] = useState("25");

  async function loadItems() {
    try {
      const data = await api.get<PricebookItem[]>("/api/pricebook");
      setItems(data);
    } catch {
      toast.error("Failed to load pricebook");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadItems(); }, []);

  async function handleSave(data: Partial<PricebookItem>) {
    try {
      if (editingItem) {
        await api.patch(`/api/pricebook/${editingItem.id}`, data);
        toast.success("Item updated");
      } else {
        await api.post("/api/pricebook", data);
        toast.success("Item added");
      }
      setDialogOpen(false);
      setEditingItem(null);
      loadItems();
    } catch {
      toast.error("Failed to save item");
    }
  }

  async function handleDelete(id: string) {
    try {
      await api.delete(`/api/pricebook/${id}`);
      toast.success("Item removed");
      loadItems();
    } catch {
      toast.error("Failed to remove item");
    }
  }

  async function handleToggleLock(id: string, locked: boolean) {
    try {
      await api.patch(`/api/pricebook/${id}`, { locked });
      loadItems();
    } catch {
      toast.error("Failed to update lock");
    }
  }

  async function handleSaveDepositSettings() {
    try {
      await api.patch("/api/organizations/me", {
        estimateDepositThreshold: parseFloat(depositThreshold),
        estimateDepositPercent: parseInt(depositPercent, 10),
      });
      toast.success("Deposit settings saved");
    } catch {
      toast.error("Failed to save deposit settings");
    }
  }

  if (loading) return <div className="py-8 text-center text-muted-foreground">Loading pricebook…</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Pricebook</h3>
          <p className="text-sm text-muted-foreground">Manage your service catalog. Used by AI to generate estimates.</p>
        </div>
        <Button size="sm" onClick={() => { setEditingItem(null); setDialogOpen(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Add Item
        </Button>
      </div>

      <PricebookTable
        items={items}
        onEdit={(item) => { setEditingItem(item); setDialogOpen(true); }}
        onDelete={handleDelete}
        onToggleLock={handleToggleLock}
        onRefresh={loadItems}
      />

      {/* Deposit settings */}
      <div className="border rounded-lg p-4 space-y-4">
        <div>
          <h4 className="font-medium text-sm">Deposit Settings</h4>
          <p className="text-xs text-muted-foreground">When an estimate exceeds the threshold, customers are prompted for a deposit.</p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="grid gap-1.5">
            <Label className="text-xs">Deposit Threshold ($)</Label>
            <Input
              type="number"
              value={depositThreshold}
              onChange={(e) => setDepositThreshold(e.target.value)}
              className="h-8"
            />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Deposit Percent (%)</Label>
            <Input
              type="number"
              value={depositPercent}
              onChange={(e) => setDepositPercent(e.target.value)}
              className="h-8"
            />
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={handleSaveDepositSettings}>Save Deposit Settings</Button>
      </div>

      <PricebookItemDialog
        open={dialogOpen}
        item={editingItem}
        onSave={handleSave}
        onClose={() => { setDialogOpen(false); setEditingItem(null); }}
      />
    </div>
  );
}
```

- [ ] **Step 5: Add Pricebook tab to OfficeSettings**

Read `OfficeSettings.tsx` to identify the tab structure, then add a new "Pricebook" tab using the same pattern as existing tabs. Import `PricebookSettings` and add:
- A new tab trigger: `<TabsTrigger value="pricebook">Pricebook</TabsTrigger>`
- A new tab content: `<TabsContent value="pricebook"><PricebookSettings /></TabsContent>`

- [ ] **Step 6: Update organizations PATCH to accept deposit fields**

In `backend/src/routes/organizations.ts`, extend the `updateOrgSchema` to include:

```typescript
  estimateDepositThreshold: z.number().positive().optional(),
  estimateDepositPercent: z.number().int().min(1).max(100).optional(),
```

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/pricebook/ frontend/src/pages/office/OfficeSettings.tsx backend/src/routes/organizations.ts
git commit -m "feat: add admin pricebook UI with table, add/edit dialog, and deposit settings"
```

---

### Task 7: Technician estimate builder

**Files:**
- Create: `frontend/src/components/estimates/catalog-drawer.tsx`
- Create: `frontend/src/components/estimates/estimate-builder.tsx`
- Modify: `frontend/src/pages/technician/TechnicianJobs.tsx`

- [ ] **Step 1: Read TechnicianJobs.tsx**

Read the full file to understand the job card structure and existing import patterns.

- [ ] **Step 2: Create catalog-drawer.tsx**

Create `frontend/src/components/estimates/catalog-drawer.tsx`:

```tsx
import { useState, useEffect } from "react";
import { PricebookItem } from "@/api/types";
import { api } from "@/lib/api";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (item: PricebookItem) => void;
}

export function CatalogDrawer({ open, onClose, onSelect }: Props) {
  const [items, setItems] = useState<PricebookItem[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (open) {
      api.get<PricebookItem[]>("/api/pricebook").then(setItems).catch(() => {});
    }
  }, [open]);

  const filtered = items.filter((item) =>
    item.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="bottom" className="h-[80vh]">
        <SheetHeader>
          <SheetTitle>Add from Catalog</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-3">
          <Input
            placeholder="Search catalog…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
          <div className="overflow-y-auto max-h-[calc(80vh-120px)] space-y-1">
            {filtered.map((item) => (
              <button
                key={item.id}
                onClick={() => { onSelect(item); onClose(); }}
                className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-muted/60 flex items-center justify-between"
              >
                <div>
                  <div className="text-sm font-medium">{item.name}</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    {item.source === "ai" && (
                      <Badge variant="secondary" className="text-xs gap-1 py-0">
                        <Sparkles className="h-2.5 w-2.5" /> AI suggested
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground capitalize">{item.category}</span>
                  </div>
                </div>
                <span className="text-sm font-semibold">${item.unitPrice.toFixed(0)}</span>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-8">No items found</p>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 3: Create estimate-builder.tsx**

Create `frontend/src/components/estimates/estimate-builder.tsx`:

```tsx
import { useState } from "react";
import { Estimate, EstimateLine, PricebookItem } from "@/api/types";
import { api } from "@/lib/api";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CatalogDrawer } from "./catalog-drawer";
import { Lock, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
  estimate: Estimate;
  jobTitle: string;
  jobNotes?: string | null;
  onPresent: (estimate: Estimate) => void;
  onSend: () => void;
}

type Tier = "good" | "better" | "best";

export function EstimateBuilder({ estimate, jobTitle, jobNotes, onPresent, onSend }: Props) {
  const [lines, setLines] = useState<EstimateLine[]>(estimate.lines);
  const [activeTab, setActiveTab] = useState<Tier>("good");
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [sending, setSending] = useState(false);

  const tierLines = (tier: Tier) => lines.filter((l) => l.tier === tier);
  const tierTotal = (tier: Tier) =>
    tierLines(tier).reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);

  function removeLine(id: string) {
    setLines((prev) => prev.filter((l) => l.id !== id));
  }

  function addFromCatalog(item: PricebookItem) {
    const newLine: EstimateLine = {
      id: `temp-${Date.now()}`,
      estimateId: estimate.id,
      pricebookItemId: item.id,
      tier: activeTab,
      name: item.name,
      quantity: 1,
      unitPrice: item.unitPrice,
      locked: item.locked,
      source: "manual",
    };
    setLines((prev) => [...prev, newLine]);
  }

  async function handlePresent() {
    try {
      await api.patch(`/api/estimates/${estimate.id}`, {
        lines: lines.filter((l) => !l.id.startsWith("temp-") || true), // include all
      });
      onPresent({ ...estimate, lines });
    } catch {
      toast.error("Failed to save estimate");
    }
  }

  async function handleSend() {
    setSending(true);
    try {
      await api.patch(`/api/estimates/${estimate.id}`, { lines });
      await api.post(`/api/estimates/${estimate.id}/send`, {});
      toast.success("Estimate sent to customer");
      onSend();
    } catch {
      toast.error("Failed to send estimate");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Job context */}
      <div className="px-4 py-3 bg-primary/8 border-b text-sm">
        <strong>{jobTitle}</strong>
        {jobNotes && <span className="text-muted-foreground"> · {jobNotes}</span>}
      </div>

      {/* AI note */}
      <div className="px-4 py-2 bg-indigo-50 dark:bg-indigo-950/30 border-b text-sm flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-indigo-500 shrink-0" />
        <span className="text-muted-foreground">AI generated this estimate. Review and adjust before presenting.</span>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as Tier)} className="flex-1 flex flex-col">
        <TabsList className="grid grid-cols-3 rounded-none border-b h-auto">
          {(["good", "better", "best"] as Tier[]).map((tier) => (
            <TabsTrigger key={tier} value={tier} className="capitalize py-3 rounded-none">
              {tier}
              <span className="ml-1.5 text-xs text-muted-foreground">${tierTotal(tier).toFixed(0)}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        {(["good", "better", "best"] as Tier[]).map((tier) => (
          <TabsContent key={tier} value={tier} className="flex-1 overflow-y-auto p-4 space-y-2 mt-0">
            {tierLines(tier).map((line) => (
              <div
                key={line.id}
                className="flex items-center justify-between py-2 border-b last:border-0"
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {line.locked && <Lock className="h-3.5 w-3.5 text-amber-500 shrink-0" />}
                  {line.source === "ai" && !line.locked && <Sparkles className="h-3.5 w-3.5 text-indigo-400 shrink-0" />}
                  <span className="text-sm truncate">{line.name}</span>
                </div>
                <div className="flex items-center gap-2 ml-3">
                  <span className="text-sm font-medium">${(line.unitPrice * line.quantity).toFixed(0)}</span>
                  {!line.locked && (
                    <button onClick={() => removeLine(line.id)} className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}

            <button
              onClick={() => setCatalogOpen(true)}
              className="w-full mt-2 py-2 border border-dashed rounded-lg text-sm text-muted-foreground hover:bg-muted/40"
            >
              + Add from catalog
            </button>

            <div className="pt-3 flex justify-between font-semibold">
              <span>Total</span>
              <span>${tierTotal(tier).toFixed(0)}</span>
            </div>
          </TabsContent>
        ))}
      </Tabs>

      {/* Actions */}
      <div className="px-4 py-3 border-t flex gap-2">
        <Button className="flex-1" onClick={handlePresent}>Present to Customer</Button>
        <Button variant="outline" onClick={handleSend} disabled={sending}>
          {sending ? "Sending…" : "Send Link"}
        </Button>
      </div>

      <CatalogDrawer open={catalogOpen} onClose={() => setCatalogOpen(false)} onSelect={addFromCatalog} />
    </div>
  );
}
```

- [ ] **Step 4: Add "Create Estimate" button to TechnicianJobs**

In `TechnicianJobs.tsx`:
1. Import `EstimateBuilder` and `Estimate` type
2. Add state: `const [estimateJob, setEstimateJob] = useState<ApiJob | null>(null)` and `const [estimate, setEstimate] = useState<Estimate | null>(null)`
3. Add a "Create Estimate" button on job cards where `status` is `scheduled`, `en_route`, or `in_progress`
4. On click: call `POST /api/estimates/generate` with `{ jobId }`, set the returned estimate
5. When estimate is ready, show `EstimateBuilder` in a `Sheet` or `Dialog`

The handler:

```tsx
async function handleCreateEstimate(job: ApiJob) {
  setEstimateJob(job);
  try {
    const est = await api.post<Estimate>("/api/estimates/generate", { jobId: job.id });
    setEstimate(est);
  } catch {
    toast.error("Failed to generate estimate. You can build one manually.");
    // Still open builder with empty estimate if needed
  }
}
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/estimates/ frontend/src/pages/technician/TechnicianJobs.tsx
git commit -m "feat: add estimate builder with AI draft, catalog drawer, and send link"
```

---

### Task 8: Customer estimate approval page

**Files:**
- Create: `frontend/src/components/estimates/estimate-tiers.tsx`
- Create: `frontend/src/components/estimates/estimate-approval.tsx`
- Create: `frontend/src/pages/customer/CustomerEstimate.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Create estimate-tiers.tsx**

Create `frontend/src/components/estimates/estimate-tiers.tsx`:

```tsx
import { Estimate, EstimateLine } from "@/api/types";

type Tier = "good" | "better" | "best";

interface Props {
  estimate: Estimate;
  onSelect: (tier: Tier) => void;
}

const TIER_SUBTITLES: Record<Tier, string> = {
  good: "Fix the immediate problem",
  better: "Fix + prevent next failure",
  best: "Full system tune-up",
};

export function EstimateTiers({ estimate, onSelect }: Props) {
  const tierLines = (tier: Tier): EstimateLine[] => estimate.lines.filter((l) => l.tier === tier);
  const tierTotal = (tier: Tier) => tierLines(tier).reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);

  return (
    <div className="space-y-4 max-w-sm mx-auto">
      <div className="text-center mb-6">
        <h2 className="font-bold text-lg">Choose your service option</h2>
        <p className="text-sm text-muted-foreground mt-1">{estimate.job?.title}</p>
      </div>

      {(["good", "better", "best"] as Tier[]).map((tier) => (
        <button
          key={tier}
          onClick={() => onSelect(tier)}
          className={`w-full text-left border-2 rounded-xl p-4 transition-colors relative ${
            tier === "better"
              ? "border-primary bg-primary/5"
              : "border-border hover:border-primary/50"
          }`}
        >
          {tier === "better" && (
            <span className="absolute -top-2.5 left-4 bg-primary text-primary-foreground text-xs font-bold px-2 py-0.5 rounded">
              MOST POPULAR
            </span>
          )}
          <div className="flex justify-between items-start">
            <div>
              <div className="font-bold capitalize">{tier}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{TIER_SUBTITLES[tier]}</div>
            </div>
            <div className="text-xl font-extrabold">${tierTotal(tier).toFixed(0)}</div>
          </div>
          <div className="mt-2 text-xs text-muted-foreground leading-relaxed">
            {tierLines(tier).map((l) => l.name).join(" · ")}
          </div>
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Create estimate-approval.tsx**

Create `frontend/src/components/estimates/estimate-approval.tsx`:

```tsx
import { useState, useRef } from "react";
import { Estimate, EstimateLine } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { toast } from "sonner";

type Tier = "good" | "better" | "best";

interface Props {
  estimate: Estimate;
  tier: Tier;
  token: string;
  onApproved: () => void;
}

export function EstimateApproval({ estimate, tier, token, onApproved }: Props) {
  const [signature, setSignature] = useState("");
  const [approving, setApproving] = useState(false);
  const [depositSkipped, setDepositSkipped] = useState(false);

  const tierLines = estimate.lines.filter((l) => l.tier === tier);
  const total = tierLines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);

  // Deposit check is computed from total (threshold comes from estimate if prepopulated)
  // For portal: we use the depositAmount on the estimate after approval, or estimate it from total
  const estimatedDeposit = Math.round(total * 0.25); // fallback — real value set on approve
  const showDeposit = total >= 500;

  async function handleApprove() {
    if (!signature.trim()) {
      toast.error("Please type your full name to sign");
      return;
    }
    setApproving(true);
    try {
      await api.post(`/api/estimates/token/${token}/approve`, {
        tier,
        signatureData: signature,
      });
      toast.success("Estimate approved!");
      onApproved();
    } catch (err: any) {
      if (err?.status === 409) {
        toast.error("This estimate has already been approved.");
      } else {
        toast.error("Failed to approve estimate");
      }
    } finally {
      setApproving(false);
    }
  }

  return (
    <div className="max-w-sm mx-auto space-y-4">
      <div className="text-center">
        <h2 className="font-bold text-lg">Confirm your selection</h2>
        <p className="text-sm text-muted-foreground capitalize">{tier} plan · ${total.toFixed(0)} total</p>
      </div>

      {/* Line items summary */}
      <div className="bg-muted/40 rounded-xl p-3 text-sm space-y-1.5">
        {tierLines.map((line) => (
          <div key={line.id} className="flex justify-between">
            <span className="text-muted-foreground">{line.name}</span>
            <span>${(line.unitPrice * line.quantity).toFixed(0)}</span>
          </div>
        ))}
        <div className="flex justify-between font-bold pt-2 border-t mt-2">
          <span>Total</span>
          <span>${total.toFixed(0)}</span>
        </div>
      </div>

      {/* Typed signature */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Full Name (legal signature)</label>
        <Input
          placeholder="Type your full name"
          value={signature}
          onChange={(e) => setSignature(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">By signing you authorize work to proceed at the quoted price</p>
      </div>

      {/* Optional deposit */}
      {showDeposit && !depositSkipped && (
        <div className="border border-amber-200 dark:border-amber-800 rounded-xl p-3 bg-amber-50 dark:bg-amber-950/20 space-y-2">
          <div className="text-sm font-semibold">Optional: Pay ${estimatedDeposit} deposit today (25%)</div>
          <p className="text-xs text-muted-foreground">Locks in your appointment. Balance due at completion.</p>
          <div className="flex gap-2">
            <Button size="sm" className="flex-1 bg-amber-500 hover:bg-amber-600 text-white">Pay Deposit</Button>
            <Button size="sm" variant="outline" className="flex-1" onClick={() => setDepositSkipped(true)}>
              Skip for now
            </Button>
          </div>
        </div>
      )}

      <Button className="w-full" onClick={handleApprove} disabled={approving}>
        {approving ? "Approving…" : "Approve & Begin Work"}
      </Button>
    </div>
  );
}
```

- [ ] **Step 3: Create CustomerEstimate.tsx**

Create `frontend/src/pages/customer/CustomerEstimate.tsx`:

```tsx
import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Estimate } from "@/api/types";
import { api } from "@/lib/api";
import { EstimateTiers } from "@/components/estimates/estimate-tiers";
import { EstimateApproval } from "@/components/estimates/estimate-approval";
import { AlertTriangle, CheckCircle } from "lucide-react";

type Step = "tiers" | "approval" | "done";
type Tier = "good" | "better" | "best";

export default function CustomerEstimate() {
  const { token } = useParams<{ token: string }>();
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("tiers");
  const [selectedTier, setSelectedTier] = useState<Tier>("better");

  useEffect(() => {
    if (!token) return;
    api
      .get<Estimate>(`/api/estimates/token/${token}`)
      .then((data) => {
        if (data.status === "approved") setStep("done");
        setEstimate(data);
      })
      .catch((err) => {
        if (err?.status === 410) {
          setError("This estimate has expired — please contact us to request a new one.");
        } else {
          setError("Estimate not found.");
        }
      })
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading estimate…</p>
      </div>
    );
  }

  if (error || !estimate) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 px-4 text-center">
        <AlertTriangle className="h-8 w-8 text-destructive" />
        <p className="text-sm">{error ?? "Something went wrong."}</p>
      </div>
    );
  }

  if (step === "done") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 px-4 text-center">
        <CheckCircle className="h-10 w-10 text-green-500" />
        <h2 className="font-bold text-lg">Estimate Approved</h2>
        <p className="text-sm text-muted-foreground">
          {estimate.status === "approved" && estimate.selectedTier
            ? `You selected the ${estimate.selectedTier} plan. Our team will be in touch soon.`
            : "Your approval has been recorded. Our team will be in touch soon."}
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 pt-8">
      {step === "tiers" && (
        <EstimateTiers
          estimate={estimate}
          onSelect={(tier) => { setSelectedTier(tier); setStep("approval"); }}
        />
      )}
      {step === "approval" && token && (
        <EstimateApproval
          estimate={estimate}
          tier={selectedTier}
          token={token}
          onApproved={() => setStep("done")}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Add route in App.tsx**

In `frontend/src/App.tsx`, import the new page:

```typescript
import CustomerEstimate from "./pages/customer/CustomerEstimate";
```

Add as a public route (no `RequireAuth` wrapper — token is the auth):

```tsx
<Route path="/customer/estimates/:token" element={<CustomerEstimate />} />
```

Place it before the catch-all `*` route.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/estimates/estimate-tiers.tsx frontend/src/components/estimates/estimate-approval.tsx frontend/src/pages/customer/CustomerEstimate.tsx frontend/src/App.tsx
git commit -m "feat: add customer estimate approval page (tier selection, typed signature, deposit prompt)"
```

---

## Final verification

- [ ] **Run all backend tests**

```bash
cd backend && npx vitest run
```

Expected: All pass

- [ ] **Start dev server and smoke test**

```bash
cd frontend && npm run dev
```

Manual checks:
1. Admin: Settings → Pricebook tab exists, shows items, can add/edit/delete/lock
2. Technician: Job card shows "Create Estimate" button on active jobs, tapping it shows builder with AI-generated tiers
3. Customer portal: `GET /customer/estimates/<token>` shows tier picker, selecting proceeds to signature step

- [ ] **Final commit**

```bash
git add -A
git commit -m "feat: complete AI Pricebook + Smart Estimates implementation"
```
