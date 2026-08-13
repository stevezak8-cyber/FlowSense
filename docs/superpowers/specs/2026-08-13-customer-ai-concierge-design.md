# Customer AI Concierge — Design Spec

**Date:** 2026-08-13
**Feature:** Feature 10 of 11 — Customer AI Concierge
**Status:** Approved for implementation

---

## Overview

A conversational AI assistant embedded in the customer portal. Customers can ask status questions ("When is my technician arriving?", "Do I have any open invoices?") and request new service calls. The concierge is grounded in the customer's own data (jobs, invoices, equipment) plus general HVAC knowledge and org-specific information (business hours, contact details). Conversation history is maintained client-side only — the backend is stateless. No schema changes required.

---

## Data & API

### No schema changes

Conversation history is held in React state and sent with every request. Nothing is persisted to the database.

### New endpoint

#### `POST /api/concierge/chat`

Auth: `requireAuth + requireSubscription`. Customer-role users have `req.user!.customerId` populated; the route uses this to scope all DB reads to that customer.

**Request body:**
```typescript
{
  messages: { role: "user" | "assistant"; content: string }[]
}
```

Validated with Zod: array must be non-empty, each item must have `role` ("user" | "assistant") and `content` (string, max 4000 chars).

**Response 200:**
```typescript
{
  reply: string
  jobCreated?: { id: string }
}
```

`jobCreated` is present only when Claude emits a `create_job` action and the job is successfully created.

**Error responses:**
- `400` — missing or invalid `messages`
- `400` — `customerId` not present on user token (non-customer role)
- `503` — `ANTHROPIC_API_KEY` not configured
- `500` — Claude call failed or job creation failed

---

## Backend

### New file: `backend/src/services/concierge-ai.ts`

```typescript
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
): Promise<ConciergeResult>
```

**Implementation steps:**

1. **Fetch customer context** from DB:
   - Customer record: name, address, city, state, postalCode, phone, email
   - Last 10 jobs (ordered by `scheduledAt desc`): id, status, scheduledAt, completedAt, equipmentType, symptomSummary, summary, technician name
   - Open invoices (status != "paid"): id, amount, status, dueDate, description
   - Equipment: equipmentType, make, model, lastServicedAt, nextDueAt
   - Organization: name, phone, email, address

2. **Build system prompt:**

```
You are an AI concierge for {org.name}, an HVAC service company. You are speaking with {customer.name}.

Your job:
- Answer questions about their service history, job status, invoices, and equipment using ONLY the data below
- Help them request a new service call
- Answer general HVAC questions (maintenance tips, troubleshooting guidance)

CUSTOMER DATA:
Name: {customer.name}
Address: {customer.address}, {customer.city}, {customer.state} {customer.postalCode}

JOBS (most recent first):
{jobs formatted as: "- [{status}] {equipmentType} on {date} — {symptomSummary}. {summary if completed}"}

OPEN INVOICES:
{invoices formatted as: "- ${amount} due {dueDate} — {description} [{status}]" or "None"}

EQUIPMENT:
{equipment formatted as: "- {type}: {make} {model}, last serviced {date}" or "None on file"}

COMPANY CONTACT:
{org.name} · {org.phone} · {org.email}

SERVICE REQUEST PROTOCOL:
If the customer wants to schedule a new service, collect: (1) what equipment or system has the problem, (2) what symptoms they are experiencing. Then confirm with them before booking. Once confirmed, respond with your reply followed by this exact JSON on its own line:
{"action":"create_job","equipmentType":"central-ac","symptomSummary":"Not cooling — customer confirmed booking","scheduledAt":"2026-08-20T09:00:00.000Z"}

Use null for equipmentType if unknown. Use a scheduledAt approximately 2 business days from today if the customer does not specify a time. Today is {today ISO date}.

CONSTRAINTS:
- Never fabricate job details, invoice amounts, or dates that are not in the data above
- If you don't know something, say so and offer to connect them with the office
- Keep replies concise (2-4 sentences for simple questions, up to 8 for complex ones)
- Do not mention that you are Claude or reference any AI model
```

3. **Call Claude** using a locally-instantiated Anthropic client following the same pattern as all other AI services in this codebase:
```typescript
import Anthropic from "@anthropic-ai/sdk"
import { AI_MODEL } from "../lib/ai-config.js"
const apiKey = process.env.ANTHROPIC_API_KEY
const anthropic = apiKey ? new Anthropic({ apiKey }) : null
```
Silent-skip: if `anthropic` is null, return `{ error: "not_configured" }`. Model: `AI_MODEL`. Pass system prompt + full `messages` history. Non-streaming (`messages.create`).

4. **Parse response:**
   - Apply multiline regex to the full response text: `/^\s*(\{"action":"create_job".*?\})\s*$/m`
   - If matched: parse the captured JSON, strip that line from the visible reply, return `{ reply: cleanedText.trim(), jobAction: { equipmentType, symptomSummary, scheduledAt: new Date(parsed.scheduledAt) } }`
   - Validate `scheduledAt`: if `isNaN(date.getTime())`, fall back to `new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)` (2 days from now)
   - If regex does not match or JSON parse fails: return `{ reply: fullText }`
   - Silent-skip: if `anthropic` is null, return `{ error: "not_configured" }`
   - On API failure: log error, return `{ error: "failed" }`

### New file: `backend/src/routes/concierge.ts`

```typescript
export const conciergeRouter = Router()
```

Single route `POST /chat`:

```typescript
conciergeRouter.post("/chat", async (req, res) => {
  const customerId = req.user!.customerId
  if (!customerId) return res.status(400).json({ error: "Customer account required" })

  const parsed = chatSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

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
      // Reply is still returned; jobCreated is omitted
    }
  }

  res.json({ reply: result.reply, ...(jobCreated ? { jobCreated } : {}) })
})
```

Zod schema:
```typescript
const chatSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().min(1).max(4000),
  })).min(1),
})
```

### Modified file: `backend/src/index.ts`

```typescript
import { conciergeRouter } from "./routes/concierge.js"
app.use("/api/concierge", apiLimiter, requireAuth, requireSubscription, conciergeRouter)
```

### New file: `backend/src/__tests__/concierge.test.ts`

Tests (all mock `getConciergeReply` and `prisma`):

1. Returns 400 when `messages` is empty array
2. Returns 400 when user has no `customerId` (non-customer role)
3. Returns 503 when `getConciergeReply` returns `{ error: "not_configured" }`
4. Returns 200 with `reply` for a status question (no `jobCreated`)
5. Returns 200 with `reply + jobCreated` when result includes `jobAction` (mock `prisma.job.create`)

Service unit tests (mock Anthropic + Prisma):

6. Returns `{ error: "not_configured" }` when `ANTHROPIC_API_KEY` not set
7. Parses `create_job` action from Claude response and returns `jobAction`
8. Returns plain `reply` when no action block in Claude response
9. Returns 200 with `reply` (no `jobCreated`) when `getConciergeReply` returns `jobAction` but `prisma.job.create` throws

---

## Frontend

### New file: `frontend/src/components/customer/ConciergeChatWidget.tsx`

Props:
```typescript
interface Props {
  embedded?: boolean  // true = card mode on dashboard, false/undefined = floating bubble
}
```

**State:**
- `messages: ConciergeMessage[]` — full conversation history, starts empty
- `input: string` — current text input
- `loading: boolean`
- `open: boolean` — for bubble mode only (whether panel is visible)
- `jobConfirmed: boolean` — true after a `jobCreated` response; shows confirmation banner

**Render (bubble mode, `embedded` not set):**
- When `open === false`: floating `MessageCircle` button fixed at bottom-right (`fixed bottom-6 right-6 z-50`)
- When `open === true`: fixed panel (`fixed bottom-20 right-6 z-50 w-96 rounded-xl shadow-xl border bg-card`) containing:
  - Header: "AI Concierge" + close button
  - Message list (scrollable, `overflow-y-auto max-h-80`)
  - Input + Send button at bottom

**Render (embedded mode):**
- Card with header "Ask our AI Concierge"
- Message list (scrollable, `max-h-64`)
- Input + Send button

**Message bubbles:**
- User messages: right-aligned, `bg-primary text-primary-foreground`
- Assistant messages: left-aligned, `bg-muted`
- Loading: left-aligned spinner bubble

**Job confirmed banner (shown when `jobConfirmed === true`):**
```tsx
<div className="rounded-md bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-800 dark:bg-green-950 dark:text-green-300 dark:border-green-800">
  Service request submitted — we'll be in touch to confirm your appointment.
</div>
```

**Send handler:**
```typescript
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
```

**Not-configured state:** if a 503 is returned, replace the error message with "AI concierge is not available right now. Please contact us directly."

**Enter key:** `onKeyDown` handler on the textarea sends on Enter (not Shift+Enter).

### Modified file: `frontend/src/pages/customer/CustomerLayout.tsx`

Import and render `<ConciergeChatWidget />` (floating mode) just before `</div>` closing the layout wrapper, so it overlays all customer pages.

**Avoiding double-mount on dashboard:** The floating bubble must not render when the embedded widget is already visible on the dashboard. Use `useLocation()` to suppress the floating bubble on the dashboard route:

```tsx
const location = useLocation()
const showFloating = location.pathname !== "/customer" && location.pathname !== "/customer/"
{showFloating && <ConciergeChatWidget />}
```

### Modified file: `frontend/src/pages/customer/CustomerDashboard.tsx`

Add `<ConciergeChatWidget embedded />` as a new card section below the existing jobs/invoices content.

### New API type: `frontend/src/api/types.ts`

```typescript
export interface ConciergeMessage {
  role: "user" | "assistant"
  content: string
}
```

---

## Error States

| Condition | Behaviour |
|---|---|
| `ANTHROPIC_API_KEY` not set | 503 → widget shows "not available" message |
| Claude API failure | 500 → widget shows friendly error, stays usable |
| Empty messages sent | 400 → frontend prevents this (disabled send button) |
| Non-customer role hits endpoint | 400 → never reached in practice (customer portal is role-gated) |
| Job creation fails | 500 → widget shows error; reply still shown if available |
| Network error | Catch in handleSend → friendly fallback message appended |

---

## Out of Scope

- Persisting conversation history to the database
- Office staff reading concierge transcripts
- Real-time streaming responses (widget uses simple JSON response)
- File/photo uploads via concierge
- Payment via concierge
- Concierge available outside the authenticated customer portal
