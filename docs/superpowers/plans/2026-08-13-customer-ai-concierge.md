# Customer AI Concierge Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a stateless AI chat concierge to the customer portal that answers status questions and creates pending jobs from service requests.

**Architecture:** Stateless backend — full conversation history sent with each request. `getConciergeReply()` service fetches customer context, builds system prompt, calls Claude non-streaming, and parses an optional `create_job` action block from the response. The route handler creates the job if signalled. Frontend holds history in React state; `ConciergeChatWidget` renders as both a floating bubble (all pages) and an embedded card (dashboard).

**Tech Stack:** Anthropic SDK (existing), Prisma (existing), Zod, React, lucide-react, sonner

---

## File Structure

**Create:**
- `backend/src/services/concierge-ai.ts` — `getConciergeReply()` service
- `backend/src/routes/concierge.ts` — `POST /chat` route
- `backend/src/__tests__/concierge.test.ts` — 9 tests (5 route + 4 service)
- `frontend/src/components/customer/ConciergeChatWidget.tsx` — chat widget (bubble + embedded modes)

**Modify:**
- `backend/src/index.ts` — mount concierge router
- `frontend/src/api/types.ts` — add `ConciergeMessage` type
- `frontend/src/pages/customer/CustomerLayout.tsx` — mount floating bubble (suppressed on dashboard route)
- `frontend/src/pages/customer/CustomerDashboard.tsx` — mount embedded widget

---

## Chunk 1: Backend — concierge service + route + tests

### Task 1: concierge-ai service

**Files:**
- Create: `backend/src/services/concierge-ai.ts`
- Create: `backend/src/__tests__/concierge.test.ts` (service tests only first)

- [ ] **Step 1: Write failing service unit tests**

Create `backend/src/__tests__/concierge.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest"

// Service unit tests — use vi.doMock to avoid hoisting conflicts
// Route tests will be in a separate file

describe("getConciergeReply — service unit tests", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllEnvs()
  })

  it("returns not_configured when ANTHROPIC_API_KEY is not set", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "")
    const { getConciergeReply } = await import("../services/concierge-ai.js")
    const result = await getConciergeReply("cust1", "org1", [{ role: "user", content: "hello" }])
    expect(result).toEqual({ error: "not_configured" })
  })

  it("returns plain reply when Claude response has no action block", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key")
    vi.doMock("@anthropic-ai/sdk", () => ({
      default: class {
        messages = {
          create: vi.fn().mockResolvedValue({
            content: [{ type: "text", text: "Your next appointment is scheduled for Monday." }],
          }),
        }
      },
    }))
    vi.doMock("../lib/prisma.js", () => ({
      prisma: {
        customer: { findUnique: vi.fn().mockResolvedValue({ name: "Jane", address: "1 Main", city: "Austin", state: "TX", postalCode: "78701", phone: null, email: null, jobs: [], equipment: [] }) },
        invoice: { findMany: vi.fn().mockResolvedValue([]) },
        organization: { findUnique: vi.fn().mockResolvedValue({ name: "Cool Air HVAC", phone: null, email: null, address: null }) },
      },
    }))
    const { getConciergeReply } = await import("../services/concierge-ai.js")
    const result = await getConciergeReply("cust1", "org1", [{ role: "user", content: "when is my appointment?" }])
    expect(result).toMatchObject({ reply: expect.any(String) })
    expect("jobAction" in result).toBe(false)
  })

  it("parses create_job action block and returns jobAction", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key")
    const actionLine = '{"action":"create_job","equipmentType":"central-ac","symptomSummary":"Not cooling","scheduledAt":"2026-08-20T09:00:00.000Z"}'
    vi.doMock("@anthropic-ai/sdk", () => ({
      default: class {
        messages = {
          create: vi.fn().mockResolvedValue({
            content: [{ type: "text", text: `Great, I've booked your service call.\n${actionLine}` }],
          }),
        }
      },
    }))
    vi.doMock("../lib/prisma.js", () => ({
      prisma: {
        customer: { findUnique: vi.fn().mockResolvedValue({ name: "Jane", address: "1 Main", city: "Austin", state: "TX", postalCode: "78701", phone: null, email: null, jobs: [], equipment: [] }) },
        invoice: { findMany: vi.fn().mockResolvedValue([]) },
        organization: { findUnique: vi.fn().mockResolvedValue({ name: "Cool Air HVAC", phone: null, email: null, address: null }) },
      },
    }))
    const { getConciergeReply } = await import("../services/concierge-ai.js")
    const result = await getConciergeReply("cust1", "org1", [{ role: "user", content: "book a service" }])
    expect(result).toMatchObject({
      reply: expect.any(String),
      jobAction: {
        equipmentType: "central-ac",
        symptomSummary: "Not cooling",
        scheduledAt: expect.any(Date),
      },
    })
    // Action line should not appear in the reply
    if ("reply" in result) expect(result.reply).not.toContain('"action"')
  })

  it("returns failed on Anthropic API error", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key")
    vi.doMock("@anthropic-ai/sdk", () => ({
      default: class {
        messages = {
          create: vi.fn().mockRejectedValue(new Error("rate limit")),
        }
      },
    }))
    vi.doMock("../lib/prisma.js", () => ({
      prisma: {
        customer: { findUnique: vi.fn().mockResolvedValue({ name: "Jane", address: "1 Main", city: "Austin", state: "TX", postalCode: "78701", phone: null, email: null, jobs: [], equipment: [] }) },
        invoice: { findMany: vi.fn().mockResolvedValue([]) },
        organization: { findUnique: vi.fn().mockResolvedValue({ name: "Cool Air HVAC", phone: null, email: null, address: null }) },
      },
    }))
    const { getConciergeReply } = await import("../services/concierge-ai.js")
    const result = await getConciergeReply("cust1", "org1", [{ role: "user", content: "hello" }])
    expect(result).toEqual({ error: "failed" })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/stevenzakaria/flowsense/backend && npx vitest run src/__tests__/concierge.test.ts 2>&1 | tail -10
```

Expected: FAIL — `Cannot find module '../services/concierge-ai.js'`

- [ ] **Step 3: Create the concierge-ai service**

Create `backend/src/services/concierge-ai.ts`:

```typescript
import Anthropic from "@anthropic-ai/sdk"
import { prisma } from "../lib/prisma.js"
import { AI_MODEL } from "../lib/ai-config.js"

const apiKey = process.env.ANTHROPIC_API_KEY
if (!apiKey) console.log("[ConciergeAI] Skipped — no ANTHROPIC_API_KEY set")
const anthropic = apiKey ? new Anthropic({ apiKey }) : null

export interface ConciergeMessage {
  role: "user" | "assistant"
  content: string
}

export type ConciergeResult =
  | { reply: string; jobAction?: { equipmentType: string | null; symptomSummary: string; scheduledAt: Date } }
  | { error: "not_configured" }
  | { error: "failed" }

export async function getConciergeReply(
  customerId: string,
  organizationId: string,
  messages: ConciergeMessage[]
): Promise<ConciergeResult> {
  if (!anthropic) return { error: "not_configured" }

  try {
    // Fetch all context in parallel
    const [customer, invoices, org] = await Promise.all([
      prisma.customer.findUnique({
        where: { id: customerId },
        select: {
          name: true, address: true, city: true, state: true, postalCode: true, phone: true, email: true,
          jobs: {
            orderBy: { scheduledAt: "desc" },
            take: 10,
            select: {
              id: true, status: true, scheduledAt: true, completedAt: true,
              equipmentType: true, symptomSummary: true, summary: true,
              technician: { select: { user: { select: { name: true } } } },
            },
          },
          equipment: {
            select: { equipmentType: true, make: true, model: true, lastServicedAt: true, nextDueAt: true },
          },
        },
      }),
      prisma.invoice.findMany({
        where: { customerId, organizationId, status: { not: "paid" } },
        select: { id: true, amount: true, status: true, dueDate: true, description: true },
        orderBy: { dueDate: "asc" },
      }),
      prisma.organization.findUnique({
        where: { id: organizationId },
        select: { name: true, phone: true, email: true, address: true },
      }),
    ])

    if (!customer || !org) return { error: "failed" }

    const fmt = (d: Date | string | null) =>
      d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "unknown"
    const fmtAmt = (n: number) => `$${n.toFixed(2)}`

    const jobsText = customer.jobs.length
      ? customer.jobs.map((j) =>
          `- [${j.status}] ${j.equipmentType ?? "service"} on ${fmt(j.scheduledAt)}` +
          (j.symptomSummary ? ` — ${j.symptomSummary}` : "") +
          (j.summary ? `. ${j.summary}` : "") +
          (j.technician?.user?.name ? ` (Tech: ${j.technician.user.name})` : "")
        ).join("\n")
      : "No service history on file."

    const invoicesText = invoices.length
      ? invoices.map((i) => `- ${fmtAmt(i.amount)} due ${fmt(i.dueDate)} — ${i.description} [${i.status}]`).join("\n")
      : "No open invoices."

    const equipmentText = customer.equipment.length
      ? customer.equipment.map((e) =>
          `- ${e.equipmentType}${e.make ? `: ${e.make}` : ""}${e.model ? ` ${e.model}` : ""}` +
          (e.lastServicedAt ? `, last serviced ${fmt(e.lastServicedAt)}` : "")
        ).join("\n")
      : "No equipment on file."

    const today = new Date().toISOString()

    const systemPrompt = `You are an AI concierge for ${org.name}, an HVAC service company. You are speaking with ${customer.name}.

Your job:
- Answer questions about their service history, job status, invoices, and equipment using ONLY the data below
- Help them request a new service call
- Answer general HVAC questions (maintenance tips, troubleshooting guidance)

CUSTOMER DATA:
Name: ${customer.name}
Address: ${customer.address}, ${customer.city}, ${customer.state} ${customer.postalCode}

JOBS (most recent first):
${jobsText}

OPEN INVOICES:
${invoicesText}

EQUIPMENT:
${equipmentText}

COMPANY CONTACT:
${org.name}${org.phone ? ` · ${org.phone}` : ""}${org.email ? ` · ${org.email}` : ""}

SERVICE REQUEST PROTOCOL:
If the customer wants to schedule a new service, collect: (1) what equipment or system has the problem, (2) what symptoms they are experiencing. Then confirm with them before booking. Once confirmed, respond with your reply followed by this exact JSON on its own line:
{"action":"create_job","equipmentType":"central-ac","symptomSummary":"Not cooling — customer confirmed booking","scheduledAt":"2026-08-20T09:00:00.000Z"}

Use null for equipmentType if unknown. Use a scheduledAt approximately 2 business days from today if the customer does not specify a time. Today is ${today}.

CONSTRAINTS:
- Never fabricate job details, invoice amounts, or dates that are not in the data above
- If you don't know something, say so and offer to connect them with the office
- Keep replies concise (2-4 sentences for simple questions, up to 8 for complex ones)
- Do not mention that you are Claude or reference any AI model`

    const response = await anthropic.messages.create({
      model: AI_MODEL,
      max_tokens: 1024,
      system: systemPrompt,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    })

    const fullText = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("")

    // Parse optional create_job action block
    const actionMatch = fullText.match(/^\s*(\{"action":"create_job".*?\})\s*$/m)
    if (actionMatch) {
      try {
        const parsed = JSON.parse(actionMatch[1]) as {
          action: string
          equipmentType: string | null
          symptomSummary: string
          scheduledAt: string
        }
        const cleanedReply = fullText.replace(actionMatch[0], "").trim()
        const parsedDate = new Date(parsed.scheduledAt)
        const scheduledAt = isNaN(parsedDate.getTime())
          ? new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)
          : parsedDate
        return {
          reply: cleanedReply,
          jobAction: {
            equipmentType: parsed.equipmentType ?? null,
            symptomSummary: parsed.symptomSummary,
            scheduledAt,
          },
        }
      } catch {
        // JSON parse failed — return full text as plain reply
      }
    }

    return { reply: fullText }
  } catch (e) {
    console.error("[ConciergeAI] Error:", e)
    return { error: "failed" }
  }
}
```

- [ ] **Step 4: Run service tests to verify they pass**

```bash
cd /Users/stevenzakaria/flowsense/backend && npx vitest run src/__tests__/concierge.test.ts 2>&1 | tail -10
```

Expected: 4 passed

- [ ] **Step 5: TypeScript check**

```bash
cd /Users/stevenzakaria/flowsense/backend && npx tsc --noEmit 2>&1 | grep "concierge" | head -10
```

Expected: no errors for concierge files

- [ ] **Step 6: Commit**

```bash
cd /Users/stevenzakaria/flowsense/backend && git add src/services/concierge-ai.ts src/__tests__/concierge.test.ts && git commit -m "feat: add getConciergeReply AI service"
```

---

### Task 2: Concierge route + route tests + index wiring

**Files:**
- Create: `backend/src/routes/concierge.ts`
- Create: `backend/src/__tests__/concierge-route.test.ts`
- Modify: `backend/src/index.ts`

- [ ] **Step 1: Write failing route tests**

Create `backend/src/__tests__/concierge-route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    job: { create: vi.fn() },
  },
}))

vi.mock("../services/concierge-ai.js", () => ({
  getConciergeReply: vi.fn(),
}))

import request from "supertest"
import express from "express"
import { conciergeRouter } from "../routes/concierge.js"
import { getConciergeReply } from "../services/concierge-ai.js"
import { prisma } from "../lib/prisma.js"

function makeApp(customerId: string | undefined = "cust1") {
  const app = express()
  app.use(express.json())
  app.use((req: express.Request, _res: express.Response, next: express.NextFunction) => {
    (req as unknown as { user: unknown }).user = { organizationId: "org1", customerId, role: "customer" }
    next()
  })
  app.use("/api/concierge", conciergeRouter)
  return app
}

const validMessages = [{ role: "user" as const, content: "hello" }]

describe("POST /api/concierge/chat", () => {
  beforeEach(() => vi.clearAllMocks())

  it("returns 400 when messages array is empty", async () => {
    const res = await request(makeApp()).post("/api/concierge/chat").send({ messages: [] })
    expect(res.status).toBe(400)
  })

  it("returns 400 when user has no customerId", async () => {
    const res = await request(makeApp(undefined)).post("/api/concierge/chat").send({ messages: validMessages })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/customer/i)
  })

  it("returns 503 when getConciergeReply returns not_configured", async () => {
    vi.mocked(getConciergeReply).mockResolvedValue({ error: "not_configured" })
    const res = await request(makeApp()).post("/api/concierge/chat").send({ messages: validMessages })
    expect(res.status).toBe(503)
  })

  it("returns 200 with reply for a status question (no jobCreated)", async () => {
    vi.mocked(getConciergeReply).mockResolvedValue({ reply: "Your job is scheduled for Monday." })
    const res = await request(makeApp()).post("/api/concierge/chat").send({ messages: validMessages })
    expect(res.status).toBe(200)
    expect(res.body.reply).toBe("Your job is scheduled for Monday.")
    expect(res.body.jobCreated).toBeUndefined()
  })

  it("returns 200 with reply + jobCreated when result includes jobAction", async () => {
    vi.mocked(getConciergeReply).mockResolvedValue({
      reply: "I've submitted your service request.",
      jobAction: { equipmentType: "central-ac", symptomSummary: "Not cooling", scheduledAt: new Date("2026-08-20T09:00:00Z") },
    })
    vi.mocked(prisma.job.create).mockResolvedValue({ id: "job123" } as never)
    const res = await request(makeApp()).post("/api/concierge/chat").send({ messages: validMessages })
    expect(res.status).toBe(200)
    expect(res.body.reply).toBe("I've submitted your service request.")
    expect(res.body.jobCreated).toEqual({ id: "job123" })
  })

  it("returns 200 with reply only when jobAction present but prisma.job.create throws", async () => {
    vi.mocked(getConciergeReply).mockResolvedValue({
      reply: "I've submitted your service request.",
      jobAction: { equipmentType: null, symptomSummary: "Broken AC", scheduledAt: new Date("2026-08-20T09:00:00Z") },
    })
    vi.mocked(prisma.job.create).mockRejectedValue(new Error("DB error"))
    const res = await request(makeApp()).post("/api/concierge/chat").send({ messages: validMessages })
    expect(res.status).toBe(200)
    expect(res.body.reply).toBe("I've submitted your service request.")
    expect(res.body.jobCreated).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run route tests to verify they fail**

```bash
cd /Users/stevenzakaria/flowsense/backend && npx vitest run src/__tests__/concierge-route.test.ts 2>&1 | tail -10
```

Expected: FAIL — `Cannot find module '../routes/concierge.js'`

- [ ] **Step 3: Create the concierge route**

Create `backend/src/routes/concierge.ts`:

```typescript
import { Router } from "express"
import { z } from "zod"
import { prisma } from "../lib/prisma.js"
import { getConciergeReply } from "../services/concierge-ai.js"

export const conciergeRouter = Router()

const chatSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string().min(1).max(4000),
    })
  ).min(1),
})

conciergeRouter.post("/chat", async (req, res) => {
  const customerId = req.user!.customerId
  if (!customerId) {
    return res.status(400).json({ error: "Customer account required" })
  }

  const parsed = chatSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() })
  }

  const result = await getConciergeReply(customerId, req.user!.organizationId, parsed.data.messages)

  if ("error" in result) {
    return res.status(result.error === "not_configured" ? 503 : 500).json({ error: result.error })
  }

  let jobCreated: { id: string } | undefined
  if (result.jobAction) {
    try {
      const job = await prisma.job.create({
        data: {
          organizationId: req.user!.organizationId,
          customerId,
          status: "pending",
          priority: "normal",
          scheduledAt: result.jobAction.scheduledAt,
          equipmentType: result.jobAction.equipmentType,
          symptomSummary: result.jobAction.symptomSummary,
        },
      })
      jobCreated = { id: job.id }
    } catch (e) {
      console.error("[Concierge] Job creation failed:", e)
    }
  }

  res.json({ reply: result.reply, ...(jobCreated ? { jobCreated } : {}) })
})
```

- [ ] **Step 4: Run route tests to verify they pass**

```bash
cd /Users/stevenzakaria/flowsense/backend && npx vitest run src/__tests__/concierge-route.test.ts 2>&1 | tail -10
```

Expected: 6 tests passed (5 route tests + any passing service tests)

- [ ] **Step 5: Mount router in index.ts**

In `backend/src/index.ts`, add the import after the existing imports:

```typescript
import { conciergeRouter } from "./routes/concierge.js"
```

Add the mount after the existing `/api/ai` line:

```typescript
app.use("/api/concierge", apiLimiter, requireAuth, requireSubscription, conciergeRouter)
```

- [ ] **Step 6: Run full backend test suite**

```bash
cd /Users/stevenzakaria/flowsense/backend && npx vitest run 2>&1 | tail -10
```

Expected: all tests pass (235+ passing)

- [ ] **Step 7: TypeScript check**

```bash
cd /Users/stevenzakaria/flowsense/backend && npx tsc --noEmit 2>&1 | head -20
```

Expected: no new errors

- [ ] **Step 8: Commit**

```bash
cd /Users/stevenzakaria/flowsense/backend && git add src/routes/concierge.ts src/__tests__/concierge-route.test.ts src/index.ts && git commit -m "feat: add concierge route and mount at /api/concierge"
```

---

## Chunk 2: Frontend — widget + layout wiring

### Task 3: ConciergeMessage API type

**Files:**
- Modify: `frontend/src/api/types.ts`

- [ ] **Step 1: Add ConciergeMessage to api/types.ts**

At the end of `frontend/src/api/types.ts`, add:

```typescript
export interface ConciergeMessage {
  role: "user" | "assistant"
  content: string
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd /Users/stevenzakaria/flowsense/frontend && npx tsc --noEmit 2>&1 | head -10
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
cd /Users/stevenzakaria/flowsense && git add frontend/src/api/types.ts && git commit -m "feat: add ConciergeMessage type to API types"
```

---

### Task 4: ConciergeChatWidget component

**Files:**
- Create: `frontend/src/components/customer/ConciergeChatWidget.tsx`

- [ ] **Step 1: Create the widget component**

Create `frontend/src/components/customer/ConciergeChatWidget.tsx`:

```tsx
import { useState, useRef, useEffect } from "react"
import { MessageCircle, X, Send, Loader2 } from "lucide-react"
import { api } from "@/api/client"
import type { ConciergeMessage } from "@/api/types"

interface Props {
  embedded?: boolean
}

export function ConciergeChatWidget({ embedded }: Props) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ConciergeMessage[]>([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [jobConfirmed, setJobConfirmed] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, loading])

  async function handleSend() {
    if (!input.trim() || loading) return
    const userMsg: ConciergeMessage = { role: "user", content: input.trim() }
    const nextMessages = [...messages, userMsg]
    setMessages(nextMessages)
    setInput("")
    setLoading(true)
    try {
      const data = await api.post<{ reply: string; jobCreated?: { id: string } }>(
        "/api/concierge/chat",
        { messages: nextMessages }
      )
      setMessages([...nextMessages, { role: "assistant", content: data.reply }])
      if (data.jobCreated) setJobConfirmed(true)
    } catch (e) {
      const msg = (e instanceof Error && e.message === "not_configured")
        ? "AI concierge is not available right now. Please contact us directly."
        : "Sorry, I'm having trouble connecting. Please try again or contact us directly."
      setMessages([...nextMessages, { role: "assistant", content: msg }])
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const chatContent = (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && (
          <p className="text-xs text-muted-foreground text-center pt-4">
            Ask me about your service history, invoices, or request a new appointment.
          </p>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                msg.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-foreground"
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-muted rounded-xl px-3 py-2">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          </div>
        )}
        {jobConfirmed && (
          <div className="rounded-md bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-800 dark:bg-green-950 dark:text-green-300 dark:border-green-800">
            Service request submitted — we'll be in touch to confirm your appointment.
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t p-3 flex gap-2 items-end">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message…"
          rows={1}
          className="flex-1 resize-none rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={!input.trim() || loading}
          className="rounded-lg bg-primary p-2 text-primary-foreground hover:bg-primary/90 disabled:opacity-50 shrink-0"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  )

  // Embedded card mode (used on CustomerDashboard)
  if (embedded) {
    return (
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden flex flex-col" style={{ height: 400 }}>
        <div className="px-4 py-3 border-b">
          <h2 className="text-sm font-semibold text-foreground">AI Concierge</h2>
          <p className="text-xs text-muted-foreground">Ask about your service or book an appointment</p>
        </div>
        {chatContent}
      </div>
    )
  }

  // Floating bubble mode (used in CustomerLayout)
  return (
    <>
      {/* Floating button */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-colors"
          aria-label="Open AI Concierge"
        >
          <MessageCircle className="h-6 w-6" />
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-6 right-6 z-50 w-96 rounded-xl border bg-card shadow-xl overflow-hidden flex flex-col" style={{ height: 480 }}>
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <div>
              <h2 className="text-sm font-semibold text-foreground">AI Concierge</h2>
              <p className="text-xs text-muted-foreground">Ask about your service or book an appointment</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded p-1 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {chatContent}
        </div>
      )}
    </>
  )
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd /Users/stevenzakaria/flowsense/frontend && npx tsc --noEmit 2>&1 | grep "ConciergeChatWidget" | head -10
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
cd /Users/stevenzakaria/flowsense && git add frontend/src/components/customer/ConciergeChatWidget.tsx && git commit -m "feat: add ConciergeChatWidget component (bubble + embedded modes)"
```

---

### Task 5: Wire widget into CustomerLayout and CustomerDashboard

**Files:**
- Modify: `frontend/src/pages/customer/CustomerLayout.tsx`
- Modify: `frontend/src/pages/customer/CustomerDashboard.tsx`

- [ ] **Step 1: Add floating bubble to CustomerLayout**

In `frontend/src/pages/customer/CustomerLayout.tsx`:

1. Add import at the top:
```tsx
import { ConciergeChatWidget } from "@/components/customer/ConciergeChatWidget"
```

2. The file already imports `useLocation` (confirmed in the existing code). Add a variable after the existing `const { pathname } = useLocation()` line:
```tsx
const showFloating = pathname !== "/customer" && pathname !== "/customer/"
```

3. Just before the closing `</div>` of the layout wrapper (the outermost div), add:
```tsx
{showFloating && <ConciergeChatWidget />}
```

The full layout structure ends with `</main>` then `</div>`. The widget goes between `</main>` and `</div>`:
```tsx
      </main>
      {showFloating && <ConciergeChatWidget />}
    </div>
  )
```

- [ ] **Step 2: Add embedded widget to CustomerDashboard**

In `frontend/src/pages/customer/CustomerDashboard.tsx`:

1. Add import at the top:
```tsx
import { ConciergeChatWidget } from "@/components/customer/ConciergeChatWidget"
```

2. Find the end of the main content in the return statement (after the last card/section) and add the embedded widget. It should go at the bottom, after the existing job/invoice/password content:
```tsx
        {/* AI Concierge */}
        <ConciergeChatWidget embedded />
```

- [ ] **Step 3: TypeScript check**

```bash
cd /Users/stevenzakaria/flowsense/frontend && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors

- [ ] **Step 4: Run full backend tests to confirm nothing broken**

```bash
cd /Users/stevenzakaria/flowsense/backend && npx vitest run 2>&1 | tail -5
```

Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
cd /Users/stevenzakaria/flowsense && git add frontend/src/pages/customer/CustomerLayout.tsx frontend/src/pages/customer/CustomerDashboard.tsx && git commit -m "feat: wire ConciergeChatWidget into customer portal (bubble + dashboard embed)"
```
