# Pre-Arrival Intelligence Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate AI-powered pre-arrival briefings (suggested parts, tools, risk flags) for technicians before they arrive at a job site, improving first-visit resolution rates.

**Architecture:** A new backend service (`pre-arrival.ts`) calls Claude Haiku with job + customer history context and writes structured JSON back to the job record. Auto-triggers on `pending→scheduled` status transition; manual regeneration via a new REST endpoint. Frontend enhances the technician job detail view with structured sections for the AI briefing data.

**Tech Stack:** `@anthropic-ai/sdk` (Claude Haiku), Express route handler, Prisma queries, React + Tailwind (frontend display), Vitest (testing)

**Spec:** `docs/superpowers/specs/2026-03-14-pre-arrival-intelligence-design.md`

---

## File Map

### New Files
| File | Responsibility |
|------|---------------|
| `backend/src/services/pre-arrival.ts` | AI briefing generation — fetches job/customer data, calls Claude Haiku, parses JSON response, updates job record |
| `backend/src/__tests__/pre-arrival.test.ts` | Unit tests for the pre-arrival service (5 test cases) |

### Modified Files
| File | Changes |
|------|---------|
| `backend/package.json` | Add `@anthropic-ai/sdk` dependency |
| `backend/.env.example` | Add `ANTHROPIC_API_KEY` documentation line |
| `backend/src/routes/jobs.ts` | Add `POST /:id/generate-pre-arrival` endpoint; add fire-and-forget `generatePreArrival()` call on `pending→scheduled` transition |
| `backend/prisma/seed.ts` | Add pre-arrival demo data to the default job upsert |
| `frontend/src/pages/technician/TechnicianJobs.tsx` | Replace generic "Job Notes" section with structured pre-arrival intelligence UI (briefing, parts, tools, risk flags, regenerate button) |

---

## Chunk 1: Backend Service & Tests

### Task 1: Install `@anthropic-ai/sdk` and update environment config

**Files:**
- Modify: `backend/package.json` (npm install adds it)
- Modify: `backend/.env.example:9` (add ANTHROPIC_API_KEY line)

- [ ] **Step 1: Install the Anthropic SDK**

```bash
cd /Users/stevenzakaria/flowsense/backend && npm install @anthropic-ai/sdk
```

Expected: `@anthropic-ai/sdk` appears in `dependencies` in `package.json`.

- [ ] **Step 2: Add `ANTHROPIC_API_KEY` to `.env.example`**

In `backend/.env.example`, add after the `RESEND_API_KEY` line:

```
# Optional — enables AI pre-arrival briefings (silent skip if not set)
ANTHROPIC_API_KEY=
```

- [ ] **Step 3: Commit**

```bash
git add backend/package.json backend/package-lock.json backend/.env.example
git commit -m "chore: add @anthropic-ai/sdk dependency and env config"
```

---

### Task 2: Write failing tests for the pre-arrival service

**Files:**
- Create: `backend/src/__tests__/pre-arrival.test.ts`
- Create: `backend/src/services/pre-arrival.ts` (stub only — enough to import)

The tests mock both the Anthropic SDK and Prisma. The service module follows the same "silent skip" pattern as `email.ts` — it checks for `ANTHROPIC_API_KEY` at module load and degrades gracefully.

- [ ] **Step 1: Create the minimal service stub**

Create `backend/src/services/pre-arrival.ts` with just the function signature so the test file can import it:

```ts
export async function generatePreArrival(jobId: string): Promise<void> {
  // TODO: implement
}
```

- [ ] **Step 2: Write the test file**

Create `backend/src/__tests__/pre-arrival.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Prisma
vi.mock("../lib/prisma.js", () => ({
  prisma: {
    job: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

// Mock the Anthropic SDK
vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      messages: {
        create: vi.fn(),
      },
    })),
  };
});

import { prisma } from "../lib/prisma.js";
import { generatePreArrival } from "../services/pre-arrival.js";

describe("generatePreArrival", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset env for each test
    vi.unstubAllEnvs();
  });

  it("skips when ANTHROPIC_API_KEY is not set", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");

    // Re-import to pick up env change — use dynamic import
    vi.resetModules();
    const { generatePreArrival: fn } = await import("../services/pre-arrival.js");

    await fn("job-1");

    // Should not call Prisma at all
    expect(prisma.job.findFirst).not.toHaveBeenCalled();
  });

  it("builds correct prompt with job details and customer history", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    vi.resetModules();

    // Re-mock after reset
    vi.doMock("../lib/prisma.js", () => ({
      prisma: {
        job: {
          findFirst: vi.fn().mockResolvedValue({
            id: "job-1",
            customerId: "cust-1",
            symptomSummary: "No cooling",
            equipmentType: "central-ac",
            serviceType: "repair",
            priority: "high",
            equipmentNotes: "Unit is 12 years old",
            customer: { name: "Jane Doe", address: "123 Main St", notes: null },
            technician: { name: "Jordan Smith" },
          }),
          findMany: vi.fn().mockResolvedValue([
            {
              symptomSummary: "Weak airflow",
              summary: "Replaced filter",
              actionsTaken: "Changed air filter",
              partsUsed: ["Air filter 20x25"],
              equipmentType: "central-ac",
              completedAt: new Date("2025-09-01"),
            },
          ]),
          update: vi.fn(),
        },
      },
    }));

    const mockCreate = vi.fn().mockResolvedValue({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            preArrivalNotes: "Test briefing",
            suggestedParts: ["Capacitor"],
            suggestedTools: ["Multimeter"],
            riskFlags: ["Repeat issue"],
          }),
        },
      ],
    });

    vi.doMock("@anthropic-ai/sdk", () => ({
      default: vi.fn().mockImplementation(() => ({
        messages: { create: mockCreate },
      })),
    }));

    const { generatePreArrival: fn } = await import("../services/pre-arrival.js");
    await fn("job-1");

    // Verify the Anthropic SDK was called
    expect(mockCreate).toHaveBeenCalledTimes(1);

    // Verify the call includes the model and system/user messages
    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.model).toBe("claude-haiku-4-20250514");
    expect(callArgs.max_tokens).toBe(800);
    expect(callArgs.system).toContain("HVAC");

    // Verify user message includes job context
    const userMsg = callArgs.messages[0].content;
    expect(userMsg).toContain("No cooling");
    expect(userMsg).toContain("central-ac");
    expect(userMsg).toContain("Jane Doe");
    // Verify it includes history
    expect(userMsg).toContain("Weak airflow");
  });

  it("parses valid JSON response and updates the job record", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    vi.resetModules();

    const mockUpdate = vi.fn();

    vi.doMock("../lib/prisma.js", () => ({
      prisma: {
        job: {
          findFirst: vi.fn().mockResolvedValue({
            id: "job-1",
            customerId: "cust-1",
            symptomSummary: "No heat",
            equipmentType: "furnace",
            serviceType: "repair",
            priority: "normal",
            equipmentNotes: null,
            customer: { name: "Acme", address: "123 St", notes: null },
            technician: null,
          }),
          findMany: vi.fn().mockResolvedValue([]),
          update: mockUpdate,
        },
      },
    }));

    vi.doMock("@anthropic-ai/sdk", () => ({
      default: vi.fn().mockImplementation(() => ({
        messages: {
          create: vi.fn().mockResolvedValue({
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  preArrivalNotes: "Furnace not igniting. Check igniter and flame sensor.",
                  suggestedParts: ["Hot surface igniter", "Flame sensor"],
                  suggestedTools: ["Multimeter", "Combustion analyzer"],
                  riskFlags: ["Gas appliance — verify gas shutoff location"],
                }),
              },
            ],
          }),
        },
      })),
    }));

    const { generatePreArrival: fn } = await import("../services/pre-arrival.js");
    await fn("job-1");

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "job-1" },
      data: {
        preArrivalNotes: "Furnace not igniting. Check igniter and flame sensor.",
        suggestedParts: ["Hot surface igniter", "Flame sensor"],
        suggestedTools: ["Multimeter", "Combustion analyzer"],
        riskFlags: ["Gas appliance — verify gas shutoff location"],
      },
    });
  });

  it("handles malformed JSON response without throwing", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    vi.resetModules();

    vi.doMock("../lib/prisma.js", () => ({
      prisma: {
        job: {
          findFirst: vi.fn().mockResolvedValue({
            id: "job-1",
            customerId: "cust-1",
            symptomSummary: "Test",
            equipmentType: "ac",
            serviceType: "repair",
            priority: "normal",
            equipmentNotes: null,
            customer: { name: "Test", address: "Test", notes: null },
            technician: null,
          }),
          findMany: vi.fn().mockResolvedValue([]),
          update: vi.fn(),
        },
      },
    }));

    vi.doMock("@anthropic-ai/sdk", () => ({
      default: vi.fn().mockImplementation(() => ({
        messages: {
          create: vi.fn().mockResolvedValue({
            content: [{ type: "text", text: "This is not valid JSON at all" }],
          }),
        },
      })),
    }));

    const mod = await import("../lib/prisma.js");
    const { generatePreArrival: fn } = await import("../services/pre-arrival.js");

    // Should NOT throw
    await expect(fn("job-1")).resolves.toBeUndefined();

    // Should NOT update the job with garbage
    expect(mod.prisma.job.update).not.toHaveBeenCalled();
  });

  it("handles API errors without throwing", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    vi.resetModules();

    vi.doMock("../lib/prisma.js", () => ({
      prisma: {
        job: {
          findFirst: vi.fn().mockResolvedValue({
            id: "job-1",
            customerId: "cust-1",
            symptomSummary: "Test",
            equipmentType: "ac",
            serviceType: "repair",
            priority: "normal",
            equipmentNotes: null,
            customer: { name: "Test", address: "Test", notes: null },
            technician: null,
          }),
          findMany: vi.fn().mockResolvedValue([]),
          update: vi.fn(),
        },
      },
    }));

    vi.doMock("@anthropic-ai/sdk", () => ({
      default: vi.fn().mockImplementation(() => ({
        messages: {
          create: vi.fn().mockRejectedValue(new Error("Network error")),
        },
      })),
    }));

    const { generatePreArrival: fn } = await import("../services/pre-arrival.js");

    // Should NOT throw
    await expect(fn("job-1")).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd /Users/stevenzakaria/flowsense/backend && npx vitest run src/__tests__/pre-arrival.test.ts
```

Expected: Tests fail because `generatePreArrival` is a stub that does nothing. Test 1 (skip when no key) might pass trivially; tests 2-5 should fail because the stub doesn't call Anthropic or update records.

- [ ] **Step 4: Commit failing tests**

```bash
git add backend/src/__tests__/pre-arrival.test.ts backend/src/services/pre-arrival.ts
git commit -m "test: add failing tests for pre-arrival service"
```

---

### Task 3: Implement the pre-arrival service

**Files:**
- Modify: `backend/src/services/pre-arrival.ts`

The implementation follows the same "silent skip" pattern as `email.ts` — check for `ANTHROPIC_API_KEY` at module level, log once, and return immediately from all calls if missing.

- [ ] **Step 1: Write the full implementation**

Replace the contents of `backend/src/services/pre-arrival.ts` with:

```ts
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "../lib/prisma.js";

// Silent skip pattern — consistent with email.ts / Resend
const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.log("[PreArrival] Skipped — no ANTHROPIC_API_KEY set");
}

const anthropic = apiKey ? new Anthropic({ apiKey }) : null;

interface PreArrivalResult {
  preArrivalNotes: string;
  suggestedParts: string[];
  suggestedTools: string[];
  riskFlags: string[];
}

export async function generatePreArrival(jobId: string): Promise<void> {
  if (!anthropic) return;

  try {
    // 1. Fetch the current job with customer and technician
    const job = await prisma.job.findFirst({
      where: { id: jobId },
      include: { customer: true, technician: true },
    });
    if (!job) {
      console.error(`[PreArrival] Job ${jobId} not found`);
      return;
    }

    // 2. Fetch customer's last 10 completed jobs
    const history = await prisma.job.findMany({
      where: { customerId: job.customerId, status: "completed" },
      orderBy: { completedAt: "desc" },
      take: 10,
      select: {
        symptomSummary: true,
        summary: true,
        actionsTaken: true,
        partsUsed: true,
        equipmentType: true,
        completedAt: true,
      },
    });

    // 3. Build the prompt
    const systemPrompt = `You are an HVAC service intelligence assistant. Analyze the job details and customer service history to generate a pre-arrival briefing for the technician. Respond with valid JSON only, matching this exact schema:

{
  "preArrivalNotes": "2-3 sentence briefing for the technician with actionable context",
  "suggestedParts": ["array of specific parts to bring based on symptoms and history"],
  "suggestedTools": ["array of specialized tools needed beyond standard toolkit"],
  "riskFlags": ["array of safety, compliance, or pattern warnings to be aware of"]
}

Return ONLY the JSON object. No markdown, no code fences, no explanation.`;

    const historyText = history.length > 0
      ? history
          .map(
            (h, i) =>
              `  ${i + 1}. [${h.completedAt?.toISOString().split("T")[0] ?? "unknown"}] ${h.equipmentType ?? "HVAC"}: ${h.symptomSummary ?? "N/A"}\n     Resolution: ${h.summary ?? h.actionsTaken ?? "N/A"}\n     Parts used: ${h.partsUsed.length > 0 ? h.partsUsed.join(", ") : "None"}`
          )
          .join("\n")
      : "  No previous service history.";

    const userPrompt = `## Current Job
- Equipment: ${job.equipmentType ?? "Not specified"}
- Service type: ${job.serviceType ?? "Not specified"}
- Priority: ${job.priority}
- Symptoms: ${job.symptomSummary ?? "Not provided"}
- Equipment notes: ${job.equipmentNotes ?? "None"}

## Customer
- Name: ${job.customer.name}
- Address: ${job.customer.address}
- Notes: ${job.customer.notes ?? "None"}

## Service History (last ${history.length} completed jobs)
${historyText}`;

    // 4. Call Claude Haiku
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-20250514",
      max_tokens: 800,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    // 5. Parse the response
    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      console.error("[PreArrival] No text content in response");
      return;
    }

    let parsed: PreArrivalResult;
    try {
      parsed = JSON.parse(textBlock.text) as PreArrivalResult;
    } catch {
      console.error("[PreArrival] Failed to parse JSON response:", textBlock.text.slice(0, 200));
      return;
    }

    // 6. Validate shape
    if (
      typeof parsed.preArrivalNotes !== "string" ||
      !Array.isArray(parsed.suggestedParts) ||
      !Array.isArray(parsed.suggestedTools) ||
      !Array.isArray(parsed.riskFlags)
    ) {
      console.error("[PreArrival] Response missing required fields");
      return;
    }

    // 7. Update the job record
    await prisma.job.update({
      where: { id: jobId },
      data: {
        preArrivalNotes: parsed.preArrivalNotes,
        suggestedParts: parsed.suggestedParts,
        suggestedTools: parsed.suggestedTools,
        riskFlags: parsed.riskFlags,
      },
    });

    console.log(`[PreArrival] Generated briefing for job ${jobId}`);
  } catch (error) {
    console.error("[PreArrival] Error generating briefing:", error);
    // Fire-and-forget safe — never throw
  }
}
```

- [ ] **Step 2: Run tests to verify they pass**

```bash
cd /Users/stevenzakaria/flowsense/backend && npx vitest run src/__tests__/pre-arrival.test.ts
```

Expected: All 5 tests pass.

- [ ] **Step 3: Run full backend test suite**

```bash
cd /Users/stevenzakaria/flowsense/backend && npx vitest run
```

Expected: All existing tests still pass (19 previous + 5 new = 24 total).

- [ ] **Step 4: Commit**

```bash
git add backend/src/services/pre-arrival.ts backend/src/__tests__/pre-arrival.test.ts
git commit -m "feat: implement pre-arrival AI briefing service with tests"
```

---

### Task 4: Add the `POST /:id/generate-pre-arrival` endpoint

**Files:**
- Modify: `backend/src/routes/jobs.ts:1-2` (add import)
- Modify: `backend/src/routes/jobs.ts` (append new route before end of file)

- [ ] **Step 1: Add the import**

At the top of `backend/src/routes/jobs.ts`, after the existing imports (line 9), add:

```ts
import { generatePreArrival } from "../services/pre-arrival.js";
```

- [ ] **Step 2: Add the endpoint**

Append the following route at the end of `backend/src/routes/jobs.ts` (after the existing `jobsRouter.patch` handler, before any closing code):

```ts
jobsRouter.post("/:id/generate-pre-arrival", async (req, res) => {
  try {
    // Role guard — only office and technician can regenerate
    if (req.user!.role === "customer") {
      return res.status(403).json({ error: "Customers cannot regenerate pre-arrival briefings" });
    }

    const job = await prisma.job.findFirst({
      where: { id: req.params.id, organizationId: req.user!.organizationId },
    });
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }

    await generatePreArrival(req.params.id);

    const updated = await prisma.job.findFirst({
      where: { id: req.params.id, organizationId: req.user!.organizationId },
      include: {
        customer: { select: { id: true, name: true, address: true, phone: true } },
        technician: { select: { id: true, name: true } },
      },
    });
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Failed to generate pre-arrival briefing" });
  }
});
```

- [ ] **Step 3: Run type check**

```bash
cd /Users/stevenzakaria/flowsense/backend && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/jobs.ts
git commit -m "feat: add POST /:id/generate-pre-arrival endpoint with role guard"
```

---

### Task 5: Wire auto-trigger on `pending → scheduled` transition

**Files:**
- Modify: `backend/src/routes/jobs.ts:248-260` (PATCH handler status validation block)

The spec requires: hoist `currentJob.status` into a variable before the update, then after `res.json()`, check if the transition was `pending → scheduled` and call `generatePreArrival()` as fire-and-forget (no await).

- [ ] **Step 1: Hoist `previousStatus` and add fire-and-forget call**

In the PATCH handler (`jobsRouter.patch("/:id", ...)`), the status validation block (around line 248-260) already fetches `currentJob`. Add a variable to capture the previous status:

Inside the PATCH handler, right after `const currentJob = await prisma.job.findFirst(...)` (around line 249-253), add a `previousStatus` variable:

```ts
// Existing line: const currentJob = await prisma.job.findFirst({ ... });
const previousStatus = currentJob?.status;
```

Then in the **regular update path** (after `sendStatusEmails(job);`, around line 316), add the fire-and-forget call:

```ts
if (previousStatus === "pending" && job.status === "scheduled") {
  generatePreArrival(req.params.id);
}
```

Note: Do NOT add this to the `completed` transaction path (lines ~300-303) — that path only executes when `status === "completed"`, so a `pending→scheduled` guard would be unreachable dead code.

- [ ] **Step 2: Run type check**

```bash
cd /Users/stevenzakaria/flowsense/backend && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Run full backend test suite**

```bash
cd /Users/stevenzakaria/flowsense/backend && npx vitest run
```

Expected: All 24 tests pass.

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/jobs.ts
git commit -m "feat: auto-trigger pre-arrival generation on pending→scheduled transition"
```

---

### Task 6: Update seed data with pre-arrival demo content

**Files:**
- Modify: `backend/prisma/seed.ts:114-128` (the default job upsert)

The seed's existing `upsert` for `default-job-1` uses `update: {}` which means re-seeding won't add the new fields. The spec says to add the pre-arrival fields to **both** the `create` and `update` blocks.

- [ ] **Step 1: Add pre-arrival fields to the job upsert**

In `backend/prisma/seed.ts`, modify the `prisma.job.upsert` call (around line 114) to include pre-arrival data in both `create` and `update`:

```ts
await prisma.job.upsert({
  where: { id: "default-job-1" },
  create: {
    id: "default-job-1",
    organizationId: org.id,
    customerId: customer.id,
    technicianId: tech.id,
    status: "scheduled",
    scheduledAt: new Date(Date.now() + 86400000),
    symptomSummary: "No heat, furnace not igniting",
    equipmentType: "furnace",
    priority: "high",
    preArrivalNotes:
      "Customer reports furnace not igniting. Check hot surface igniter and flame sensor first — these are the most common failure points. If igniter glows but no flame, inspect gas valve and pressure. Unit is high priority, likely a no-heat emergency.",
    suggestedParts: ["Hot surface igniter", "Flame sensor", "Gas valve"],
    suggestedTools: ["Multimeter", "Combustion analyzer", "Manometer"],
    riskFlags: ["Gas appliance — verify gas shutoff location before service"],
  },
  update: {
    preArrivalNotes:
      "Customer reports furnace not igniting. Check hot surface igniter and flame sensor first — these are the most common failure points. If igniter glows but no flame, inspect gas valve and pressure. Unit is high priority, likely a no-heat emergency.",
    suggestedParts: ["Hot surface igniter", "Flame sensor", "Gas valve"],
    suggestedTools: ["Multimeter", "Combustion analyzer", "Manometer"],
    riskFlags: ["Gas appliance — verify gas shutoff location before service"],
  },
});
```

- [ ] **Step 2: Run type check**

```bash
cd /Users/stevenzakaria/flowsense/backend && npx tsc --noEmit
```

Expected: No errors. The Prisma schema already has these fields.

- [ ] **Step 3: Commit**

```bash
git add backend/prisma/seed.ts
git commit -m "feat: add pre-arrival demo data to seed job"
```

---

## Chunk 2: Frontend Enhancement & Integration

### Task 7: Enhance TechnicianJobs.tsx with structured pre-arrival UI

**Files:**
- Modify: `frontend/src/pages/technician/TechnicianJobs.tsx`

This is the largest frontend change. The existing generic "Job Notes" section (lines 135-142) is replaced with four structured sections when AI data exists, plus a Regenerate button. The fallback (no AI data) still shows the generic notes.

- [ ] **Step 1: Add new imports**

At the top of `frontend/src/pages/technician/TechnicianJobs.tsx`, update the lucide-react import to include `Sparkles` and `RefreshCw`:

```ts
import {
  MapPin, Clock, ChevronDown, ChevronUp, Navigation, AlertTriangle,
  Wrench, CheckCircle2, Truck, User, Phone, Loader2, Sparkles, RefreshCw,
} from "lucide-react"
```

Also add `toast` from Sonner:

```ts
import { toast } from "sonner"
```

- [ ] **Step 2: Add regeneration state and handler to JobCard**

Inside the `JobCard` component function (around line 59), add state and handler for regeneration:

```ts
const [regenerating, setRegenerating] = useState(false)

async function handleRegenerate() {
  setRegenerating(true)
  try {
    const updated = await api.post<ApiJob>(`/api/jobs/${job.id}/generate-pre-arrival`, {})
    setJobs((prev) => prev.map((j) => (j.id === updated.id ? updated : j)))
    toast.success("Pre-arrival briefing regenerated")
  } catch (e) {
    toast.error("Failed to regenerate briefing")
    console.error("Regenerate failed:", e)
  } finally {
    setRegenerating(false)
  }
}
```

- [ ] **Step 3: Replace the "Job Notes" section with structured pre-arrival sections**

Replace the existing conditional block (lines 135-142):

```tsx
{(job.symptomSummary || job.equipmentNotes || job.preArrivalNotes) && (
  <div className="rounded-lg border border-border bg-secondary/50 p-3">
    <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Job Notes</span>
    <p className="mt-1.5 text-xs text-card-foreground leading-relaxed">
      {job.symptomSummary || job.equipmentNotes || job.preArrivalNotes || "No notes"}
    </p>
  </div>
)}
```

With the new structured layout:

```tsx
{/* Customer-provided notes (always show if present) */}
{(job.symptomSummary || job.equipmentNotes) && (
  <div className="rounded-lg border border-border bg-secondary/50 p-3">
    <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Customer Notes</span>
    <div className="mt-1.5 space-y-1">
      {job.symptomSummary && (
        <p className="text-xs text-card-foreground leading-relaxed">{job.symptomSummary}</p>
      )}
      {job.equipmentNotes && (
        <p className="text-xs text-muted-foreground leading-relaxed">{job.equipmentNotes}</p>
      )}
    </div>
  </div>
)}

{/* AI Pre-Arrival Briefing */}
{job.preArrivalNotes ? (
  <>
    <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          <span className="text-[10px] font-mono uppercase tracking-wider text-primary">AI Briefing</span>
          <Badge variant="outline" className="ml-1 rounded-sm px-1 py-0 text-[8px] text-primary/70 border-primary/30">AI-generated</Badge>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 gap-1 px-2 text-[10px] text-muted-foreground hover:text-primary"
          onClick={handleRegenerate}
          disabled={regenerating}
        >
          {regenerating ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          Regenerate
        </Button>
      </div>
      <p className="mt-2 text-xs text-card-foreground leading-relaxed">{job.preArrivalNotes}</p>
    </div>

    {job.suggestedParts.length > 0 && (
      <div className="rounded-lg border border-border bg-secondary/50 p-3">
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Suggested Parts</span>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {job.suggestedParts.map((part) => (
            <Badge key={part} variant="outline" className="rounded-sm text-[10px]">{part}</Badge>
          ))}
        </div>
      </div>
    )}

    {job.suggestedTools.length > 0 && (
      <div className="rounded-lg border border-border bg-secondary/50 p-3">
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Suggested Tools</span>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {job.suggestedTools.map((tool) => (
            <Badge key={tool} variant="outline" className="rounded-sm text-[10px]">{tool}</Badge>
          ))}
        </div>
      </div>
    )}

    {job.riskFlags.length > 0 && (
      <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
        <div className="flex items-center gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
          <span className="text-[10px] font-mono uppercase tracking-wider text-amber-600 dark:text-amber-400">Risk Flags</span>
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {job.riskFlags.map((flag) => (
            <Badge key={flag} variant="outline" className="rounded-sm text-[10px] border-amber-500/30 text-amber-600 dark:text-amber-400">{flag}</Badge>
          ))}
        </div>
      </div>
    )}
  </>
) : (
  /* Fallback: no AI data, show generic notes if present */
  !job.symptomSummary && !job.equipmentNotes && (
    <div className="rounded-lg border border-border bg-secondary/50 p-3">
      <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Job Notes</span>
      <p className="mt-1.5 text-xs text-muted-foreground">No notes available</p>
    </div>
  )
)}
```

- [ ] **Step 4: Run frontend type check**

```bash
cd /Users/stevenzakaria/flowsense/frontend && npx tsc --noEmit
```

Expected: No errors. `ApiJob` already has all 4 pre-arrival fields.

- [ ] **Step 5: Run frontend tests**

```bash
cd /Users/stevenzakaria/flowsense/frontend && npx vitest run
```

Expected: All 8 existing tests still pass (TechnicianJobs tests aren't affected since booking tests use CustomerBook).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/technician/TechnicianJobs.tsx
git commit -m "feat: add structured pre-arrival intelligence UI to technician job view"
```

---

### Task 8: Re-seed database and verify end-to-end

**Files:** None created/modified — this is verification only.

- [ ] **Step 1: Re-seed the database**

```bash
cd /Users/stevenzakaria/flowsense/backend && npx prisma db push --force-reset && npm run db:seed
```

Expected: Seed completes with "Seed complete!" and login credentials printed.

- [ ] **Step 2: Start dev servers and verify**

Start both backend and frontend dev servers. Navigate to the technician view (login as `tech@flowsense.demo / tech123`) and verify:

1. The scheduled job card shows the pre-arrival briefing section with the purple/primary "AI Briefing" header
2. Suggested Parts badges show: "Hot surface igniter", "Flame sensor", "Gas valve"
3. Suggested Tools badges show: "Multimeter", "Combustion analyzer", "Manometer"
4. Risk Flags section shows amber warning: "Gas appliance — verify gas shutoff location before service"
5. The Regenerate button is visible (will show "Skipped" in console since no API key is set)

- [ ] **Step 3: Run full test suite**

```bash
cd /Users/stevenzakaria/flowsense && cd backend && npx vitest run && cd ../frontend && npx vitest run
```

Expected: All tests pass (24 backend + 8 frontend = 32 total).

- [ ] **Step 4: Run both type checks**

```bash
cd /Users/stevenzakaria/flowsense/backend && npx tsc --noEmit && cd ../frontend && npx tsc --noEmit
```

Expected: No errors in either project.

---

## Task Dependencies

```
Task 1 (install SDK) ──→ Task 2 (write tests) ──→ Task 3 (implement service)
                                                          ↓
                                                   Task 4 (add endpoint) ──→ Task 5 (auto-trigger)
                                                                                     ↓
                                                                              Task 6 (seed data)
                                                                                     ↓
                                                                              Task 7 (frontend UI) ──→ Task 8 (verify)
```

Tasks 1-3 are sequential (need SDK before tests, need tests before implementation).
Tasks 4-5 depend on Task 3.
Task 6 is independent of Tasks 4-5 but logically follows.
Task 7 is independent of backend tasks but uses the same data shape.
Task 8 requires all prior tasks.

**Parallelizable:** Tasks 4+6 can run in parallel. Task 7 can run in parallel with Tasks 4-6.
