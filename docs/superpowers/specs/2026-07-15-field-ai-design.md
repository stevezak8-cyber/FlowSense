# In-Field AI Lookup — Design Spec

**Date:** 2026-07-15
**Feature:** Feature 4 of 9 — In-Field AI Assistant
**Status:** Approved for implementation

---

## Overview

A streaming AI chat panel embedded in the technician job view. Technicians tap "Ask AI" on any job card to open a full-screen bottom sheet with a Claude-powered assistant. The assistant has full context on the job, the technician's profile, and relevant org history. Conversations persist per job in the database.

Three modes available through quick-action chips and free-form input:
1. **Error code lookup** — decode fault codes for the specific unit
2. **Symptom diagnosis** — step-by-step troubleshooting based on reported symptoms
3. **Ask anything** — specs, procedures, compatibility, general HVAC questions

---

## Data Model

### New model: `AiMessage`

```prisma
model AiMessage {
  id        String   @id @default(cuid())
  jobId     String
  role      String   // "user" | "assistant"
  content   String
  createdAt DateTime @default(now())
  job       Job      @relation(fields: [jobId], references: [id], onDelete: Cascade)

  @@index([jobId])
}
```

Add back-relation to `Job` model:
```prisma
aiMessages AiMessage[]
```

---

## Backend

### Service: `backend/src/services/field-ai.ts`

Silent-skip pattern: if `ANTHROPIC_API_KEY` is absent, streaming functions are no-ops (return early). Same pattern as `estimate-ai.ts` and `job-completion-ai.ts`. Uses `AI_MODEL` from `backend/src/lib/ai-config.ts`.

#### Context assembly

Assembled per request from Prisma:

| Source | Fields |
|---|---|
| Job | `equipmentType`, `symptomSummary`, `equipmentNotes`, `serviceType`, `status`, `scheduledAt`, `address` |
| Technician | `name`, `epa608Level`, `skills[]` |
| Customer history | Last 5 completed jobs for this customer — date, equipment, symptoms, resolution summary, parts used |
| Org equipment history | Last 5 completed jobs org-wide with the same `equipmentType` — patterns and common fixes |
| Conversation history | All prior `AiMessage` rows for this job (passed as `messages[]` to Claude) |

#### System prompt structure

```
You are FlowSense AI, an expert HVAC field assistant. You help technicians diagnose issues, look up error codes, and find specifications in the field. Be concise and practical — technicians are reading on a phone while on a job site.

CURRENT JOB:
- Equipment: {equipmentType}
- Symptoms: {symptomSummary}
- Equipment notes: {equipmentNotes}
- Service type: {serviceType}
- Address: {address}
- Scheduled: {scheduledAt}

TECHNICIAN:
- Name: {name}
- EPA 608: {epa608Level}
- Skills: {skills}

CUSTOMER HISTORY (last 5 jobs):
{formattedCustomerHistory}

ORG HISTORY — {equipmentType} (last 5 org-wide):
{formattedOrgHistory}
```

#### Exported function

```typescript
export async function streamFieldAiResponse(
  jobId: string,
  userId: string,    // for auth check — job must belong to user's org
  organizationId: string,
  onToken: (token: string) => void,
  onDone: (fullText: string) => void,
  onError: (err: Error) => void
): Promise<void>
```

- Loads job (verifies it belongs to `organizationId`)
- Loads tech via `prisma.technician.findFirst({ where: { user: { id: userId } } })` — if no technician found, proceeds without tech context (graceful degrade)
- Assembles context + loads prior `AiMessage` history for this job
- Calls `anthropic.messages.stream()` with `max_tokens: 1024`
- Calls `onToken` for each text delta
- On stream end: calls `onDone(fullText)`
- On error: calls `onError(err)`

### Routes: `backend/src/routes/ai.ts`

Mounted at `/api/ai` under `requireAuth`.

#### `POST /api/ai/chat/stream`

Body: `{ jobId: string, message: string }`

1. If `ANTHROPIC_API_KEY` absent: return `503 { error: "not_configured" }` immediately — before any DB writes or SSE headers
2. Validates body with Zod
3. Saves user message: `prisma.aiMessage.create({ data: { jobId, role: "user", content: message } })`
4. Sets SSE headers:
   ```
   Content-Type: text/event-stream
   Cache-Control: no-cache
   Connection: keep-alive
   ```
5. Calls `streamFieldAiResponse(...)`:
   - `onToken`: writes `data: ${JSON.stringify({ token })}\n\n` and flushes
   - `onDone(fullText)`: saves assistant message to DB, writes `data: [DONE]\n\n`, ends response
   - `onError`: writes `data: ${JSON.stringify({ error: "stream_failed" })}\n\n`, ends response

**Auth:** The route is mounted under `requireAuth` middleware. The frontend uses `fetch` + `ReadableStream` with an `Authorization: Bearer` header — not `EventSource` — so no query-param token workaround is needed.

#### `GET /api/ai/chat/:jobId`

Returns all `AiMessage` rows for the job ordered by `createdAt asc`. Verifies the job belongs to `req.user!.organizationId` before returning. Used to restore conversation history when the panel reopens.

Response: `AiMessage[]`

---

## Frontend

### Hook: `frontend/src/hooks/useAiChat.ts`

```typescript
export function useAiChat(jobId: string) {
  // Returns: { messages, streaming, sendMessage, clearMessages }
}
```

**State:**
- `messages: { role: "user" | "assistant", content: string, streaming?: boolean }[]`
- `streaming: boolean`

**On mount:** fetches `GET /api/ai/chat/:jobId` to restore prior conversation. If empty, `messages` stays `[]`.

**`sendMessage(text)`:**
1. Appends user message to local `messages` state immediately
2. Appends empty assistant message with `streaming: true`
3. Opens `EventSource` to `POST /api/ai/chat/stream` — uses `fetch` with `ReadableStream` instead of `EventSource` to support POST with body and Authorization header:
   ```typescript
   const res = await fetch("/api/ai/chat/stream", {
     method: "POST",
     headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
     body: JSON.stringify({ jobId, message: text }),
   })
   // Read res.body as a stream, parse SSE lines
   ```
4. Appends each `token` to the last message in state
5. On `[DONE]`: sets `streaming: false` on that message
6. On error: sets message content to error string, sets `streaming: false`

**Note on streaming approach:** Use `fetch` + `ReadableStream` (not native `EventSource`) to avoid the JWT-in-query-param workaround. This is more secure and equally well supported on modern mobile browsers.

### Component: `frontend/src/components/jobs/AiChatPanel.tsx`

Props: `{ jobId: string, jobContext: { equipmentType?: string } , onClose: () => void }`

**Empty state (no messages):**
- Three action cards with icon, title, subtitle:
  - 🔍 **Look up error code** — "Decode fault codes for this unit"
  - 🔧 **Diagnose symptoms** — "Step-by-step troubleshooting guide"
  - 💬 **Ask anything** — "Specs, procedures, compatibility"
- Tapping a card pre-fills and sends a starter message:
  - Error code: `"Look up error codes for ${equipmentType ?? "this unit"}"`
  - Diagnose: `"Help me diagnose the symptoms for this job"`
  - Ask anything: focuses the input

**Active conversation:**
- User messages: right-aligned, indigo bubble
- Assistant messages: left-aligned, dark card with indigo AI avatar (✦), text streams in token by token
- Org history references shown as inline callout card (dark inset box) when present in response
- Streaming cursor (blinking indigo bar) at end of streaming message

**Layout:**
- Fixed bottom sheet, slides up over the job list
- Dark theme regardless of app theme (always `#0f172a` background — field use at night)
- Header: "AI Assistant" + job equipment summary + close button
- Context badge: "Job context · Tech profile · Org history loaded"
- Messages scroll area (flex-1)
- Input bar pinned to bottom: rounded text input + indigo send button

**Wiring in `TechnicianJobs.tsx`:**
- Add `askAiJob: ApiJob | null` state
- "Ask AI" button in the expanded job card actions row (alongside "Mark Complete" and "Build Estimate")
- Render `<AiChatPanel>` as a fixed overlay when `askAiJob !== null`

---

## Error States

| Condition | Behavior |
|---|---|
| `ANTHROPIC_API_KEY` absent | 503 from backend → inline message: *"AI assistant not available — contact your admin."* |
| Stream error | SSE error event → inline: *"Something went wrong. Tap to retry."* with retry button |
| Offline | `fetch` fails → inline: *"You're offline — AI requires a connection."* |
| Job not found / wrong org | 404 → inline: *"This job is no longer available."* |

---

## New Files

| File | Purpose |
|---|---|
| `backend/src/services/field-ai.ts` | Context assembly + Claude streaming |
| `backend/src/routes/ai.ts` | POST /stream + GET /:jobId |
| `frontend/src/hooks/useAiChat.ts` | SSE via fetch+ReadableStream, message state |
| `frontend/src/components/jobs/AiChatPanel.tsx` | Chat UI — bottom sheet, action cards, streaming bubbles |

## Modified Files

| File | Change |
|---|---|
| `backend/prisma/schema.prisma` | Add `AiMessage` model + `aiMessages` back-relation on `Job` |
| `backend/src/index.ts` | Mount `aiRouter` at `/api/ai` under `requireAuth` |
| `frontend/src/pages/technician/TechnicianJobs.tsx` | Add "Ask AI" button + `AiChatPanel` overlay |

---

## Out of Scope

- File/photo uploads to AI
- Voice input
- Office-side visibility into AI conversations
- Per-org AI enable/disable toggle
- Token usage tracking or cost monitoring
- Pagination of AI message history
