# Pre-Arrival Intelligence Design Spec

**Sub-project 2 of 6** in the FlowSense roadmap.

**Goal:** Before a technician arrives at a job, the system generates an AI-powered briefing with context from the customer's service history, suggested parts/tools, and risk flags — improving first-visit resolution rates and reducing cognitive load.

---

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Trigger | Auto on `pending → scheduled` + manual regeneration | Technicians get intel without extra clicks; manual regen handles new info |
| Context fed to LLM | Current job + customer's last 10 completed jobs | Customer history is highest-value context; technician skills handled by rules |
| Model | Claude Haiku (`claude-haiku-4-20250514`) | Structured extraction task; fast (~1-2s), cheap, sufficient quality |
| Missing API key | Silent skip (log once at startup) | Consistent with Resend email pattern; seed data demonstrates UI |

---

## Architecture

One new backend service (`pre-arrival.ts`), one new API endpoint, UI enhancements to the existing technician job detail view.

### Data Flow

```
Job transitions pending → scheduled (PATCH /api/jobs/:id)
  ↓ fire-and-forget (non-blocking)
generatePreArrival(jobId)
  ↓
Fetch from Prisma:
  - Current job (symptomSummary, equipmentType, serviceType, priority, equipmentNotes)
  - Customer (name, address, notes)
  - Customer's last 10 completed jobs (summary, actionsTaken, partsUsed, equipmentType)
  ↓
Build structured prompt → Claude Haiku
  ↓
Parse JSON response → validate shape
  ↓
PATCH job record with:
  - preArrivalNotes: string (2-3 sentence briefing)
  - suggestedParts: string[] (parts to bring)
  - suggestedTools: string[] (specialized tools needed)
  - riskFlags: string[] (safety/compliance/pattern warnings)
```

### Manual Regeneration

```
POST /api/jobs/:id/generate-pre-arrival
  → Calls generatePreArrival(jobId) synchronously
  → Returns updated job with new pre-arrival data
  → Available to office and technician roles
```

---

## Backend — AI Service

### New file: `backend/src/services/pre-arrival.ts`

**Public API:** `generatePreArrival(jobId: string): Promise<void>`

**Behavior:**
1. Module-level check: if `ANTHROPIC_API_KEY` env var is missing, log a warning once at startup and return immediately from all calls
2. Fetch the job with customer and technician includes from Prisma
3. Fetch the customer's last 10 completed jobs (ordered by `completedAt desc`) with `summary`, `actionsTaken`, `partsUsed`, `equipmentType`
4. Build a system prompt establishing HVAC domain expertise
5. Build a user prompt with the job details and customer history as structured context
6. Call `anthropic.messages.create()` with:
   - `model: "claude-haiku-4-20250514"`
   - `max_tokens: 500`
   - JSON response requested via system prompt instruction
7. Parse the text response as JSON, validate it has the expected four fields
8. Update the job record via `prisma.job.update()` with the parsed fields
9. Wrap everything in try/catch — log errors, never throw (fire-and-forget safe)

**LLM Output Schema (requested via prompt):**
```json
{
  "preArrivalNotes": "string — 2-3 sentence briefing for the technician",
  "suggestedParts": ["string array — parts to bring"],
  "suggestedTools": ["string array — specialized tools needed"],
  "riskFlags": ["string array — safety/compliance/pattern warnings"]
}
```

**Prompt Design:**
- System prompt: "You are an HVAC service intelligence assistant. Analyze the job details and customer service history to generate a pre-arrival briefing for the technician. Respond with valid JSON only."
- User prompt: Structured sections for current job details, customer info, and past service history
- The prompt explicitly describes the JSON schema and field purposes

### New endpoint in `backend/src/routes/jobs.ts`

```
POST /api/jobs/:id/generate-pre-arrival
```

- Protected by `requireAuth` (inherited from router-level middleware)
- Calls `generatePreArrival(req.params.id)` and awaits the result
- Returns the updated job via `prisma.job.findFirst()`
- Returns 404 if job not found or not in caller's organization

### Auto-trigger in PATCH handler

In the existing PATCH handler in `jobs.ts`, after detecting a `pending → scheduled` transition (where `isValidTransition` passes), call `generatePreArrival(jobId)` as fire-and-forget (no await). This goes after the response is sent, alongside the existing `sendStatusNotifications()` and `sendStatusEmails()` calls.

---

## Backend — Environment

### `backend/.env.example`

Add:
```
ANTHROPIC_API_KEY=       # Optional — enables AI pre-arrival briefings
```

### `backend/.env`

Add (empty by default):
```
ANTHROPIC_API_KEY=
```

### Dependencies

Install `@anthropic-ai/sdk` in the backend:
```bash
cd backend && npm install @anthropic-ai/sdk
```

---

## Frontend — Technician Job Detail Enhancement

### Modified file: `frontend/src/pages/technician/TechnicianJobs.tsx`

Replace the existing generic "Job Notes" section in the expanded job card with structured pre-arrival intelligence sections.

**Layout when pre-arrival data exists:**

1. **Customer Notes** — always show `symptomSummary` and/or `equipmentNotes` if present (customer-provided data, separate from AI)

2. **Pre-Arrival Briefing** card:
   - Header: "AI Briefing" with a subtle sparkle/brain icon and "AI-generated" badge
   - Body: `preArrivalNotes` as a paragraph
   - Footer: "Regenerate" button (calls `POST /api/jobs/:id/generate-pre-arrival`)

3. **Suggested Parts** section:
   - Pill-style badges for each item in `suggestedParts[]`
   - Uses the existing Badge component with outline variant

4. **Suggested Tools** section:
   - Same pill layout for `suggestedTools[]`

5. **Risk Flags** section:
   - Amber/warning-colored badges for each item in `riskFlags[]`
   - Uses destructive/warning styling to draw attention

**Fallback:** If all four AI fields are empty/null, show the existing generic "Job Notes" display (no change from current behavior).

**Regenerate button behavior:**
- Shows a Loader2 spinner during the API call
- On success, updates the job in local state with the response
- On error, shows a toast notification via Sonner

### Frontend types: `frontend/src/api/types.ts`

Verify `ApiJob` includes:
```ts
preArrivalNotes: string | null;
suggestedParts: string[];
suggestedTools: string[];
riskFlags: string[];
```

If any are missing, add them.

---

## Seed Data

### Modified file: `backend/prisma/seed.ts`

Update the existing demo job to include pre-populated pre-arrival data:

```ts
preArrivalNotes: "Returning customer with a Central AC unit. Previous visit 6 months ago replaced a run capacitor — if symptoms recur, inspect the contactor and compressor relay. Customer noted the system cycles frequently and struggles in afternoon heat.",
suggestedParts: ["Capacitor 45/5 MFD", "Contactor 40A", "Hard start kit"],
suggestedTools: ["Multimeter", "Refrigerant gauges", "Clamp meter"],
riskFlags: ["Repeat issue — similar symptom reported 6 months ago"],
```

This makes the pre-arrival UI visible during demos without requiring an Anthropic API key.

---

## Testing

### New file: `backend/src/__tests__/pre-arrival.test.ts`

Tests for the pre-arrival service:

1. **Skips when API key is missing** — verify `generatePreArrival()` returns without calling the Anthropic SDK
2. **Builds correct prompt** — mock Anthropic SDK, verify the prompt includes job details and customer history
3. **Parses valid JSON response** — mock a valid JSON response from Claude, verify the job record gets updated with all four fields
4. **Handles malformed JSON** — mock a non-JSON response, verify it logs an error and doesn't throw
5. **Handles API errors** — mock a network error from the SDK, verify it logs and doesn't throw

All tests mock both the Anthropic SDK and Prisma client.

---

## File Map

### New Files
| File | Purpose |
|------|---------|
| `backend/src/services/pre-arrival.ts` | AI briefing generation service |
| `backend/src/__tests__/pre-arrival.test.ts` | Unit tests for pre-arrival service |

### Modified Files
| File | Changes |
|------|---------|
| `backend/src/routes/jobs.ts` | Add `POST /:id/generate-pre-arrival` endpoint; add fire-and-forget call on `pending → scheduled` |
| `backend/.env.example` | Add `ANTHROPIC_API_KEY` |
| `backend/.env` | Add `ANTHROPIC_API_KEY=` |
| `backend/prisma/seed.ts` | Pre-populate demo job with pre-arrival data |
| `backend/package.json` | Add `@anthropic-ai/sdk` dependency |
| `frontend/src/pages/technician/TechnicianJobs.tsx` | Replace generic notes with structured pre-arrival sections |
| `frontend/src/api/types.ts` | Verify/add pre-arrival fields to `ApiJob` |

---

## Out of Scope

- Equipment catalog per customer (future sub-project)
- Caching/deduplication of LLM calls
- Token usage tracking/billing
- Streaming responses
- Office-side view of pre-arrival data (technician-only for now)
