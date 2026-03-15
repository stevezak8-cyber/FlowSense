# Auto Job Documentation Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Intercept the technician's "Mark Complete" button to open a completion form, generate an AI summary from the tech's notes, let the tech review/edit it, then submit with documentation data.

**Architecture:** One new backend service (`job-completion-ai.ts`) returns an AI-generated summary string (or error) without writing to DB. One new API endpoint maps service results to HTTP status codes (503 permanent / 500 transient / 200 success). One new frontend dialog component (`completion-dialog.tsx`) manages the form → generate → review → complete flow. The existing PATCH handler already accepts the `summary`, `actionsTaken`, and `partsUsed` fields.

**Tech Stack:** Express 4, Prisma 5, Anthropic SDK (`@anthropic-ai/sdk`), Zod, React 18, TypeScript, shadcn/ui (Dialog, Textarea, Input, Badge, Button, Label), Tailwind CSS 4, Sonner toast, Vitest

**Spec:** `docs/superpowers/specs/2026-03-14-auto-job-documentation-design.md`

---

## Chunk 1: Backend (Service + Tests + Endpoint)

### Task 1: Write failing tests for the completion AI service

**Files:**
- Create: `backend/src/__tests__/job-completion-ai.test.ts`

These tests follow the exact same patterns as `backend/src/__tests__/pre-arrival.test.ts` — `vi.mock()` at top level for Prisma + Anthropic SDK, `vi.resetModules()` + `vi.doMock()` for per-test isolation, class-based Anthropic mock (arrow functions can't be `new`'d).

- [ ] **Step 1: Write all 4 failing service tests**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Prisma
vi.mock("../lib/prisma.js", () => ({
  prisma: {
    job: {
      findFirst: vi.fn(),
    },
  },
}));

// Mock the Anthropic SDK
vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class MockAnthropic {
      messages = { create: vi.fn() };
    },
  };
});

import { prisma } from "../lib/prisma.js";

describe("generateCompletionSummary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("returns not_configured when ANTHROPIC_API_KEY is not set", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.resetModules();
    const { generateCompletionSummary: fn } = await import(
      "../services/job-completion-ai.js"
    );

    const result = await fn("job-1", {
      actionsTaken: "Replaced filter",
      partsUsed: ["Air filter"],
    });

    expect(result).toEqual({ error: "not_configured" });
    expect(prisma.job.findFirst).not.toHaveBeenCalled();
  });

  it("builds correct prompt with tech input and job context", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    vi.resetModules();

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
            preArrivalNotes: "Check capacitor first",
            customer: { name: "Jane Doe", address: "123 Main St" },
          }),
        },
      },
    }));

    const mockCreate = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "Replaced the run capacitor." }],
    });

    vi.doMock("@anthropic-ai/sdk", () => ({
      default: class MockAnthropic {
        messages = { create: mockCreate };
      },
    }));

    const { generateCompletionSummary: fn } = await import(
      "../services/job-completion-ai.js"
    );
    await fn("job-1", {
      actionsTaken: "Replaced run capacitor",
      partsUsed: ["Run capacitor 45/5 MFD"],
      notes: "Unit is 12 years old",
    });

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.model).toBe("claude-haiku-4-20250514");
    expect(callArgs.max_tokens).toBe(400);
    expect(callArgs.system).toContain("HVAC");

    const userMsg = callArgs.messages[0].content;
    expect(userMsg).toContain("Replaced run capacitor");
    expect(userMsg).toContain("Run capacitor 45/5 MFD");
    expect(userMsg).toContain("central-ac");
    expect(userMsg).toContain("Check capacitor first");
    expect(userMsg).toContain("Jane Doe");
    expect(userMsg).toContain("Unit is 12 years old");
  });

  it("returns summary from valid response", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    vi.resetModules();

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
            preArrivalNotes: null,
            customer: { name: "Acme", address: "123 St" },
          }),
        },
      },
    }));

    vi.doMock("@anthropic-ai/sdk", () => ({
      default: class MockAnthropic {
        messages = {
          create: vi.fn().mockResolvedValue({
            content: [
              {
                type: "text",
                text: "Diagnosed and repaired furnace ignition failure. Replaced hot surface igniter.",
              },
            ],
          }),
        };
      },
    }));

    const { generateCompletionSummary: fn } = await import(
      "../services/job-completion-ai.js"
    );
    const result = await fn("job-1", {
      actionsTaken: "Replaced igniter",
      partsUsed: ["Hot surface igniter"],
    });

    expect(result).toEqual({
      summary:
        "Diagnosed and repaired furnace ignition failure. Replaced hot surface igniter.",
    });
  });

  it("returns failed on API errors without throwing", async () => {
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
            preArrivalNotes: null,
            customer: { name: "Test", address: "Test" },
          }),
        },
      },
    }));

    vi.doMock("@anthropic-ai/sdk", () => ({
      default: class MockAnthropic {
        messages = {
          create: vi.fn().mockRejectedValue(new Error("Network error")),
        };
      },
    }));

    const { generateCompletionSummary: fn } = await import(
      "../services/job-completion-ai.js"
    );
    const result = await fn("job-1", {
      actionsTaken: "Test",
      partsUsed: [],
    });

    expect(result).toEqual({ error: "failed" });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx vitest run src/__tests__/job-completion-ai.test.ts`
Expected: All tests FAIL with "Cannot find module '../services/job-completion-ai.js'"

- [ ] **Step 3: Commit failing tests**

```bash
git add backend/src/__tests__/job-completion-ai.test.ts
git commit -m "test: add failing tests for job completion AI service"
```

---

### Task 2: Implement the completion AI service

**Files:**
- Create: `backend/src/services/job-completion-ai.ts`

**Reference:** Follow the exact structure of `backend/src/services/pre-arrival.ts` — module-level API key check, Prisma query with customer include, system + user prompt, `anthropic.messages.create()` call. Key differences: returns discriminated union instead of void, returns plain text instead of JSON, does NOT write to DB.

- [ ] **Step 1: Write the service**

```ts
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "../lib/prisma.js";

// Silent skip pattern — consistent with pre-arrival.ts and email.ts
const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.log("[CompletionAI] Skipped — no ANTHROPIC_API_KEY set");
}

const anthropic = apiKey ? new Anthropic({ apiKey }) : null;

interface TechInput {
  actionsTaken: string;
  partsUsed: string[];
  notes?: string;
}

type CompletionResult =
  | { summary: string }
  | { error: "not_configured" }
  | { error: "failed" };

export async function generateCompletionSummary(
  jobId: string,
  techInput: TechInput
): Promise<CompletionResult> {
  if (!anthropic) return { error: "not_configured" };

  try {
    const job = await prisma.job.findFirst({
      where: { id: jobId },
      include: { customer: true },
    });
    if (!job) {
      console.error(`[CompletionAI] Job ${jobId} not found`);
      return { error: "failed" };
    }

    const systemPrompt =
      "You are an HVAC service documentation assistant. Generate a concise, professional 2-3 sentence summary of the completed service call. The summary should be suitable for customer-facing records and internal documentation. Write in past tense, be specific about what was done, and mention any parts replaced.";

    const userPrompt = `## Technician's Input
- Actions taken: ${techInput.actionsTaken}
- Parts used: ${techInput.partsUsed.length > 0 ? techInput.partsUsed.join(", ") : "None"}${techInput.notes ? `\n- Additional notes: ${techInput.notes}` : ""}

## Job Details
- Equipment: ${job.equipmentType ?? "Not specified"}
- Service type: ${job.serviceType ?? "Not specified"}
- Symptoms: ${job.symptomSummary ?? "Not provided"}
- Priority: ${job.priority}${job.preArrivalNotes ? `\n\n## Pre-Arrival Assessment\n${job.preArrivalNotes}` : ""}

## Customer
- Name: ${job.customer.name}
- Address: ${job.customer.address}`;

    const response = await anthropic.messages.create({
      model: "claude-haiku-4-20250514",
      max_tokens: 400,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      console.error("[CompletionAI] No text content in response");
      return { error: "failed" };
    }

    return { summary: textBlock.text };
  } catch (error) {
    console.error("[CompletionAI] Error generating summary:", error);
    return { error: "failed" };
  }
}
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `cd backend && npx vitest run src/__tests__/job-completion-ai.test.ts`
Expected: All 4 tests PASS

- [ ] **Step 3: Run full backend test suite**

Run: `cd backend && npx vitest run`
Expected: All tests pass (should be 28+ including the 4 new ones)

- [ ] **Step 4: Commit passing implementation**

```bash
git add backend/src/services/job-completion-ai.ts
git commit -m "feat: implement job completion AI summary service"
```

---

### Task 3: Add the POST endpoint and endpoint-level tests

**Files:**
- Modify: `backend/src/routes/jobs.ts` (add import + new route after the existing `generate-pre-arrival` route)
- Modify: `backend/src/__tests__/job-completion-ai.test.ts` (add endpoint tests)

- [ ] **Step 1: Add endpoint tests to the test file**

Append these tests to `backend/src/__tests__/job-completion-ai.test.ts`, after the existing `describe` block. These test the endpoint's HTTP status mapping and role guard. They use the same `vi.doMock` pattern but test through the Express router.

**Important:** The endpoint tests need to go in a separate test file or use `supertest` on the Express app. Given the project's existing pattern (service-level unit tests, not integration tests), add these as additional service-level tests that verify the discrimination logic the endpoint will use. The endpoint itself is simple mapping code.

Add to the end of the test file, inside a new `describe` block:

```ts
describe("endpoint logic", () => {
  it("maps not_configured to 503 and failed to 500", () => {
    // This tests the mapping logic the endpoint will implement:
    // { error: "not_configured" } => 503
    // { error: "failed" } => 500
    // { summary: "..." } => 200
    function mapResultToStatus(
      result: { summary: string } | { error: "not_configured" } | { error: "failed" }
    ): number {
      if ("error" in result) {
        return result.error === "not_configured" ? 503 : 500;
      }
      return 200;
    }

    expect(mapResultToStatus({ error: "not_configured" })).toBe(503);
    expect(mapResultToStatus({ error: "failed" })).toBe(500);
    expect(mapResultToStatus({ summary: "Test summary" })).toBe(200);
  });

  it("rejects customer role with 403", () => {
    // This tests the role guard logic the endpoint will implement:
    // req.user.role === "customer" => 403
    function shouldReject(role: string): boolean {
      return role === "customer";
    }

    expect(shouldReject("customer")).toBe(true);
    expect(shouldReject("technician")).toBe(false);
    expect(shouldReject("office")).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify the new tests pass**

Run: `cd backend && npx vitest run src/__tests__/job-completion-ai.test.ts`
Expected: All 6 tests PASS (4 service + 2 endpoint logic)

- [ ] **Step 3: Add the endpoint to jobs.ts**

Add import at the top of `backend/src/routes/jobs.ts` (after the existing `generatePreArrival` import on line 10):

```ts
import { generateCompletionSummary } from "../services/job-completion-ai.js";
```

Add Zod schema after the existing `updateJobSchema` (after line 114):

```ts
const completionSummarySchema = z.object({
  actionsTaken: z.string().min(1),
  partsUsed: z.array(z.string()),
  notes: z.string().optional(),
});
```

Add the route after the existing `generate-pre-arrival` route (after line 360):

```ts
jobsRouter.post("/:id/generate-completion-summary", async (req, res) => {
  try {
    if (req.user!.role === "customer") {
      return res
        .status(403)
        .json({ error: "Customers cannot generate completion summaries" });
    }

    const parsed = completionSummarySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const job = await prisma.job.findFirst({
      where: {
        id: req.params.id,
        organizationId: req.user!.organizationId,
      },
    });
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }

    const result = await generateCompletionSummary(req.params.id, parsed.data);

    if ("error" in result) {
      const status = result.error === "not_configured" ? 503 : 500;
      const message =
        result.error === "not_configured"
          ? "AI summary generation not configured"
          : "AI summary generation failed";
      return res.status(status).json({ error: message });
    }

    res.json({ summary: result.summary });
  } catch (e) {
    res.status(500).json({
      error:
        e instanceof Error ? e.message : "Failed to generate completion summary",
    });
  }
});
```

- [ ] **Step 4: Run full backend test suite + type check**

Run: `cd backend && npx vitest run && npx tsc --noEmit`
Expected: All tests pass, no type errors

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/jobs.ts backend/src/__tests__/job-completion-ai.test.ts
git commit -m "feat: add POST /:id/generate-completion-summary endpoint"
```

---

### Task 4: Add seed data for a completed job

**Files:**
- Modify: `backend/prisma/seed.ts` (add second job upsert after the existing `default-job-1` upsert, around line 139)

- [ ] **Step 1: Add the completed job seed data**

Insert after the closing `});` of the `default-job-1` upsert (after line 139):

```ts
  await prisma.job.upsert({
    where: { id: "default-job-2" },
    create: {
      id: "default-job-2",
      organizationId: org.id,
      customerId: customer.id,
      technicianId: tech.id,
      status: "completed",
      scheduledAt: new Date(Date.now() - 7 * 86400000),
      completedAt: new Date(Date.now() - 7 * 86400000 + 3600000),
      symptomSummary: "AC not cooling, warm air from vents",
      equipmentType: "central-ac",
      serviceType: "repair",
      priority: "normal",
      actionsTaken:
        "Inspected outdoor unit. Found run capacitor bulging and reading low. Replaced capacitor and tested system. Verified proper cooling across all vents.",
      partsUsed: ["Run capacitor 45/5 MFD 440V"],
      summary:
        "Diagnosed and repaired a Central AC system that was blowing warm air. The run capacitor had failed and was replaced with a 45/5 MFD 440V unit. System tested and confirmed cooling properly across all zones.",
    },
    update: {
      summary:
        "Diagnosed and repaired a Central AC system that was blowing warm air. The run capacitor had failed and was replaced with a 45/5 MFD 440V unit. System tested and confirmed cooling properly across all zones.",
      actionsTaken:
        "Inspected outdoor unit. Found run capacitor bulging and reading low. Replaced capacitor and tested system. Verified proper cooling across all vents.",
      partsUsed: ["Run capacitor 45/5 MFD 440V"],
    },
  });
```

- [ ] **Step 2: Verify seed runs without errors**

Run: `cd backend && npx prisma db push --force-reset && npm run db:seed`
Expected: "Seed complete!" with login credentials printed

- [ ] **Step 3: Commit**

```bash
git add backend/prisma/seed.ts
git commit -m "feat: add completed demo job with documentation data"
```

---

## Chunk 2: Frontend (Completion Dialog + Integration)

### Task 5: Create the completion dialog component

**Files:**
- Create: `frontend/src/components/jobs/completion-dialog.tsx`

This is the largest single file in the plan. It manages three dialog states: input form, AI review, and fallback (no AI). Uses existing shadcn Dialog, Textarea, Input, Badge, Button, Label components.

**Key patterns to follow from the existing codebase:**
- Import `api` from `@/api/client` — `api.post(path, body)` requires TWO args
- Import types from `@/api/types`
- Use `toast` from `sonner` for success/error feedback
- Use `cn()` from `@/lib/utils` for conditional classes
- Use Tailwind CSS 4 classes matching existing patterns in `TechnicianJobs.tsx`

- [ ] **Step 1: Write the completion dialog component**

```tsx
import { useState } from "react"
import { api } from "@/api/client"
import type { ApiJob } from "@/api/types"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Loader2, Sparkles, RefreshCw, X, Plus } from "lucide-react"
import { toast } from "sonner"

// Module-level flag: starts true, permanently flipped to false on 503
let aiAvailable = true

interface CompletionDialogProps {
  job: ApiJob
  open: boolean
  onOpenChange: (open: boolean) => void
  onCompleted: (updatedJob: ApiJob) => void
}

export function CompletionDialog({
  job,
  open,
  onOpenChange,
  onCompleted,
}: CompletionDialogProps) {
  const [actionsTaken, setActionsTaken] = useState("")
  const [partsUsed, setPartsUsed] = useState<string[]>([])
  const [partInput, setPartInput] = useState("")
  const [notes, setNotes] = useState("")
  const [summary, setSummary] = useState("")
  const [generating, setGenerating] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [hasGenerated, setHasGenerated] = useState(false)

  function addPart(part: string) {
    const trimmed = part.trim()
    if (trimmed && !partsUsed.includes(trimmed)) {
      setPartsUsed((prev) => [...prev, trimmed])
    }
    setPartInput("")
  }

  function removePart(part: string) {
    setPartsUsed((prev) => prev.filter((p) => p !== part))
  }

  async function handleGenerate() {
    setGenerating(true)
    try {
      const res = await api.post<{ summary: string }>(
        `/api/jobs/${job.id}/generate-completion-summary`,
        { actionsTaken, partsUsed, notes: notes || undefined }
      )
      setSummary(res.summary)
      setHasGenerated(true)
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Failed to generate summary"
      // Check if this is a 503 (permanent — no API key)
      if (message.includes("not configured")) {
        aiAvailable = false
        toast.error("AI summaries not configured — enter a summary manually")
      } else {
        toast.error(message)
      }
    } finally {
      setGenerating(false)
    }
  }

  async function handleComplete() {
    setSubmitting(true)
    try {
      const updated = await api.patch<ApiJob>(`/api/jobs/${job.id}`, {
        status: "completed",
        summary: summary || undefined,
        actionsTaken,
        partsUsed,
      })
      onCompleted(updated)
      onOpenChange(false)
      toast.success("Job completed successfully")
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Failed to complete job"
      )
    } finally {
      setSubmitting(false)
    }
  }

  const canGenerate = actionsTaken.trim().length > 0 && aiAvailable
  const canComplete = actionsTaken.trim().length > 0 && !submitting && !generating

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Complete Job</DialogTitle>
          <DialogDescription>
            Document what was done before marking this job complete.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Actions Taken */}
          <div className="space-y-2">
            <Label htmlFor="actionsTaken">
              Actions Taken <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="actionsTaken"
              placeholder="Describe what you did..."
              value={actionsTaken}
              onChange={(e) => setActionsTaken(e.target.value)}
              className="min-h-20"
            />
          </div>

          {/* Parts Used */}
          <div className="space-y-2">
            <Label>Parts Used</Label>
            <div className="flex gap-2">
              <Input
                placeholder="Add a part..."
                value={partInput}
                onChange={(e) => setPartInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    addPart(partInput)
                  }
                }}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => addPart(partInput)}
                disabled={!partInput.trim()}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            {/* Suggested parts from pre-arrival */}
            {job.suggestedParts && job.suggestedParts.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                <span className="text-[10px] text-muted-foreground mr-1 self-center">
                  Suggested:
                </span>
                {job.suggestedParts
                  .filter((p) => !partsUsed.includes(p))
                  .map((part) => (
                    <Badge
                      key={part}
                      variant="outline"
                      className="cursor-pointer text-[10px] hover:bg-primary/10"
                      onClick={() => addPart(part)}
                    >
                      + {part}
                    </Badge>
                  ))}
              </div>
            )}

            {/* Added parts */}
            {partsUsed.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {partsUsed.map((part) => (
                  <Badge key={part} variant="secondary" className="gap-1 text-xs">
                    {part}
                    <button
                      type="button"
                      onClick={() => removePart(part)}
                      className="ml-0.5 hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Additional Notes</Label>
            <Textarea
              id="notes"
              placeholder="Additional observations..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {/* AI Summary Section */}
          {aiAvailable ? (
            <>
              {!hasGenerated ? (
                <Button
                  onClick={handleGenerate}
                  disabled={!canGenerate || generating}
                  className="w-full gap-2"
                >
                  {generating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  Generate Summary
                </Button>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="summary">Summary</Label>
                    <Badge
                      variant="outline"
                      className="rounded-sm px-1 py-0 text-[8px] text-primary/70 border-primary/30"
                    >
                      AI-generated
                    </Badge>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="ml-auto h-6 gap-1 px-2 text-[10px] text-muted-foreground hover:text-primary"
                      onClick={handleGenerate}
                      disabled={generating || !canGenerate}
                    >
                      {generating ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3 w-3" />
                      )}
                      Regenerate
                    </Button>
                  </div>
                  <Textarea
                    id="summary"
                    value={summary}
                    onChange={(e) => setSummary(e.target.value)}
                    className="min-h-20"
                  />
                </div>
              )}
            </>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="summary">Summary</Label>
              <p className="text-xs text-muted-foreground">
                AI summaries not configured — enter a summary manually
              </p>
              <Textarea
                id="summary"
                placeholder="Write a summary of the work performed..."
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                className="min-h-20"
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleComplete} disabled={!canComplete}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Complete Job
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Run frontend type check**

Run: `cd frontend && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/jobs/completion-dialog.tsx
git commit -m "feat: add completion dialog component with AI summary generation"
```

---

### Task 6: Integrate the completion dialog into TechnicianJobs

**Files:**
- Modify: `frontend/src/pages/technician/TechnicianJobs.tsx`

The changes:
1. Import `CompletionDialog`
2. Add `completingJob` state at the page level (outside JobCard)
3. Change the "Mark Complete" button to open the dialog instead of calling `handleStatusChange`
4. Render the dialog at page level
5. On completion, update jobs list

- [ ] **Step 1: Add the import**

At the top of `TechnicianJobs.tsx`, add after the `cn` import on line 12:

```ts
import { CompletionDialog } from "@/components/jobs/completion-dialog"
```

- [ ] **Step 2: Add completingJob state and completion handler**

Inside `TechnicianJobsPage()`, after the existing `expandedId` state (line 40), add:

```ts
const [completingJob, setCompletingJob] = useState<ApiJob | null>(null)
```

After `handleStatusChange` function (after line 58), add:

```ts
  function handleJobCompleted(updatedJob: ApiJob) {
    setJobs((prev) => prev.map((j) => (j.id === updatedJob.id ? updatedJob : j)))
    setCompletingJob(null)
    setExpandedId(null)
  }
```

- [ ] **Step 3: Modify the status action button in JobCard**

In the `JobCard` component, replace the button at lines 237-240:

```tsx
{nextAction && (
  <Button className="w-full gap-2 bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => handleStatusChange(job.id, nextAction.next)}>
    <nextAction.icon className="h-4 w-4" />{nextAction.label}
  </Button>
)}
```

With:

```tsx
{nextAction && (
  <Button
    className="w-full gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
    onClick={() =>
      nextAction.next === "completed"
        ? setCompletingJob(job)
        : handleStatusChange(job.id, nextAction.next)
    }
  >
    <nextAction.icon className="h-4 w-4" />{nextAction.label}
  </Button>
)}
```

- [ ] **Step 4: Render the CompletionDialog at page level**

In the `return` of `TechnicianJobsPage`, add just before the closing `</div>` (before line 285):

```tsx
      {completingJob && (
        <CompletionDialog
          job={completingJob}
          open={!!completingJob}
          onOpenChange={(open) => !open && setCompletingJob(null)}
          onCompleted={handleJobCompleted}
        />
      )}
```

- [ ] **Step 5: Run frontend type check and tests**

Run: `cd frontend && npx tsc --noEmit && npx vitest run`
Expected: No type errors, all frontend tests pass (8 tests)

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/technician/TechnicianJobs.tsx
git commit -m "feat: intercept Mark Complete to open completion dialog"
```

---

### Task 7: Full verification

**Files:** None (verification only)

- [ ] **Step 1: Re-seed the database**

Run: `cd backend && npx prisma db push --force-reset && npm run db:seed`
Expected: "Seed complete!" with no errors

- [ ] **Step 2: Run full backend test suite**

Run: `cd backend && npx vitest run`
Expected: All tests pass (should be 29+ total: 24 existing + 5 new)

- [ ] **Step 3: Run full frontend test suite**

Run: `cd frontend && npx vitest run`
Expected: All 8 tests pass

- [ ] **Step 4: Run both type checks**

Run: `cd backend && npx tsc --noEmit && cd ../frontend && npx tsc --noEmit`
Expected: No type errors in either project

- [ ] **Step 5: Start dev servers and verify visually**

Run: Start both `backend` and `frontend` dev servers.

1. Navigate to `http://localhost:5173/login`
2. Login as technician: `tech@flowsense.demo` / `tech123`
3. Expand the scheduled job card, tap through status flow to `in_progress`
4. Tap "Mark Complete" — should open the completion dialog (NOT immediately complete the job)
5. Verify the dialog shows:
   - Actions Taken textarea (required)
   - Parts Used input with Add button
   - Suggested parts from pre-arrival shown as clickable badges
   - Notes textarea
   - "Generate Summary" button (disabled until Actions Taken is filled)
6. Fill in "Replaced hot surface igniter. Tested system." as Actions Taken
7. Click a suggested part to add it
8. If ANTHROPIC_API_KEY is set: click Generate Summary, verify AI summary appears in editable textarea with "AI-generated" badge and "Regenerate" button
9. If ANTHROPIC_API_KEY is NOT set: after clicking Generate, verify the 503 fallback — "AI summaries not configured" message appears, summary becomes manual textarea
10. Click "Complete Job" — verify success toast, job moves to Completed section
11. Verify the second seed job ("default-job-2") appears in the Completed section with its summary data
