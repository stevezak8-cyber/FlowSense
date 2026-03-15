# Auto Job Documentation Design Spec

**Sub-project 3 of 6** in the FlowSense roadmap.

**Goal:** When a technician marks a job as completed, a structured completion form captures what was done, then AI generates a polished summary from the tech's notes — improving documentation quality and reducing administrative burden.

---

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Trigger | Intercept "Mark Complete" with a completion dialog | Techs need a place to enter what they did; current flow captures zero documentation |
| Form fields | Actions taken + parts used + notes (no photos) | Photos deferred — requires storage backend; these three fields cover core documentation |
| AI timing | Generate → review → edit → confirm | Tech sees the AI summary, can tweak it, then confirms. Best quality + control |
| Summary return | Service returns string (not writes to DB) | Frontend needs to display the summary for editing before the tech confirms |
| Missing API key | Show graceful inline message on 503, fall back to manual summary | Form still works without AI; tech sees clear explanation on first attempt |

---

## Architecture

One new backend service (`job-completion-ai.ts`), one new API endpoint, one new frontend dialog component, and a modification to the technician job card's "Mark Complete" button.

### Data Flow

```
Technician taps "Mark Complete" on an in_progress job
  ↓
Completion dialog opens with input form:
  - Actions Taken (text area, required)
  - Parts Used (tag input with suggested parts from pre-arrival)
  - Notes (optional text area)
  ↓
Technician taps "Generate Summary"
  ↓
POST /api/jobs/:id/generate-completion-summary
  Body: { actionsTaken, partsUsed, notes? }
  ↓
Service fetches from Prisma:
  - Current job (equipmentType, serviceType, symptomSummary, priority, preArrivalNotes)
  - Customer (name, address)
  ↓
Build prompt → Claude Haiku → return plain text summary
  ↓
Summary appears in editable text area in the dialog
  ↓
Technician reviews, optionally edits, taps "Complete Job"
  ↓
PATCH /api/jobs/:id
  Body: { status: "completed", summary, actionsTaken, partsUsed }
  ↓
Existing handler: auto-sets completedAt, creates invoice, sends notifications + emails
```

### Fallback (no API key)

```
Completion dialog opens with input form:
  - Actions Taken (text area)
  - Parts Used (tag input)
  - Notes (optional text area)
  - Summary (manual text area — replaces Generate button)
  ↓
Technician writes their own summary
  ↓
Taps "Complete Job" → same PATCH flow
```

---

## Backend — AI Service

### New file: `backend/src/services/job-completion-ai.ts`

**Public API:** `generateCompletionSummary(jobId: string, techInput: { actionsTaken: string, partsUsed: string[], notes?: string }): Promise<{ summary: string } | { error: "not_configured" } | { error: "failed" }>`

Unlike `generatePreArrival` (which writes to DB and returns void), this function **returns** the generated summary string so the frontend can display it for editing. Returns `{ error: "not_configured" }` if the API key is missing (permanent), or `{ error: "failed" }` if the API call errors (transient). The endpoint maps these to 503 and 500 respectively.

**Behavior:**
1. Module-level check: if `ANTHROPIC_API_KEY` env var is missing, return `{ error: "not_configured" }` immediately from all calls (same silent-skip pattern as pre-arrival)
2. Fetch the job with customer relation (`include: { customer: true }`) — the service does its own Prisma query
3. Build a system prompt establishing HVAC documentation expertise
4. Build a user prompt with:
   - The tech's raw input (actionsTaken, partsUsed, notes)
   - Job context (equipmentType, serviceType, symptomSummary, priority)
   - Pre-arrival data if present (preArrivalNotes — what was expected)
   - Customer name and address
5. Call `anthropic.messages.create()` with:
   - `model: "claude-haiku-4-20250514"`
   - `max_tokens: 400` (summaries are shorter than pre-arrival briefings)
   - Plain text response (no JSON schema needed)
6. Extract the text response and return it as `{ summary: string }`
7. Wrap everything in try/catch — log errors, return `{ error: "failed" }` (never throw)

**Prompt Design:**
- System prompt: "You are an HVAC service documentation assistant. Generate a concise, professional 2-3 sentence summary of the completed service call. The summary should be suitable for customer-facing records and internal documentation. Write in past tense, be specific about what was done, and mention any parts replaced."
- User prompt: Structured sections for the technician's input, job details, and pre-arrival context

### New endpoint in `backend/src/routes/jobs.ts`

```
POST /api/jobs/:id/generate-completion-summary
```

- Protected by `requireAuth` (inherited from router-level middleware)
- **Role guard:** reject `customer` role with 403
- Accepts body: `{ actionsTaken: string, partsUsed: string[], notes?: string }`
- Validates body with Zod schema
- Calls `generateCompletionSummary(req.params.id, body)` and awaits the result
- If service returns `{ error: "not_configured" }` (no API key — permanent), returns **503** with `{ error: "AI summary generation not configured" }`
- If service returns `{ error: "failed" }` (API call error — transient), returns **500** with `{ error: "AI summary generation failed" }`
- On success, returns **200** with `{ summary: string }` (the frontend should type this response as `{ summary: string }`)
- Returns 404 if job not found or not in caller's organization

**No changes to the existing PATCH handler** — the completion dialog uses the same `PATCH /api/jobs/:id` endpoint with `{ status: "completed", summary, actionsTaken, partsUsed }`.

**Note:** The existing PATCH endpoint does not have a role guard (any authenticated user in the org can update jobs). This is a pre-existing gap that affects all status transitions, not specific to this feature — out of scope for this sub-project.

---

## Frontend — Completion Dialog

### New file: `frontend/src/components/jobs/completion-dialog.tsx`

A dialog component using the existing shadcn Dialog primitive. Receives the job data and callbacks as props.

**Props:**
```ts
interface CompletionDialogProps {
  job: ApiJob
  open: boolean
  onOpenChange: (open: boolean) => void
  onCompleted: (updatedJob: ApiJob) => void
}
```

**Dialog states:**

**State 1 — Input form (initial):**
- **Actions Taken** — `<Textarea>`, required, placeholder "Describe what you did..."
- **Parts Used** — text `<Input>` with "Add" button, renders `<Badge>` chips for each added part with X to remove. If the job has a non-empty `suggestedParts` array from pre-arrival, show them as clickable suggestion chips below the input (tap to auto-add). If `suggestedParts` is empty or absent, the suggestions area is simply not rendered
- **Notes** — optional `<Textarea>`, placeholder "Additional observations..."
- **"Generate Summary" button** — primary styled, calls the endpoint, shows `<Loader2>` spinner during API call. Disabled when `actionsTaken` is empty (frontend-only validation — the button simply won't activate until the tech types something)
- This button is **hidden** if AI is known to be unavailable (see AI availability detection below)

**State 2 — Review summary (after generation):**
- All input fields **remain editable** — the tech can update their inputs and tap "Regenerate" to get a new summary based on the updated inputs
- **Summary** — editable `<Textarea>` pre-filled with the AI result
- Subtle "AI-generated" badge next to the summary label (same style as pre-arrival)
- **"Regenerate" button** — ghost-styled, calls the endpoint again with current inputs
- **"Complete Job" button** — primary styled, submits the PATCH request

**Fallback (no AI available):**
- Same input form layout
- **Summary** — plain `<Textarea>` for manual input instead of Generate button
- **"Complete Job" button** — submits directly

**AI availability detection:** A module-level flag (`aiAvailable`) starts as `true`. When the generate endpoint returns **503** (missing API key — a permanent condition), the flag is set to `false` and the dialog transitions to fallback mode: the "Generate Summary" button is replaced with a manual summary textarea and a subtle inline message ("AI summaries not configured — enter a summary manually"). Once `false`, future dialog opens render in fallback mode immediately. Transient errors (network failures, 500s) do **not** flip the flag — they show an error toast and let the tech retry. This avoids a health-check endpoint while giving clear feedback on the first attempt.

**Validation:** The "Complete Job" button is disabled unless `actionsTaken` is non-empty. Summary is encouraged but not required — in fallback mode (no AI), a tech can complete a job with just `actionsTaken`. Parts and notes are always optional.

**Behavior on "Complete Job":**
1. Button is disabled while `actionsTaken` is empty or while the API call is in progress
2. Calls `api.patch<ApiJob>(`/api/jobs/${job.id}`, { status: "completed", summary, actionsTaken, partsUsed })`
3. On success: calls `onCompleted(updatedJob)` to update parent state, closes dialog, shows success toast
4. On error: shows error toast, keeps dialog open

### Modified file: `frontend/src/pages/technician/TechnicianJobs.tsx`

**Changes:**
1. Import `CompletionDialog`
2. Add state for the completion dialog: `const [completingJob, setCompletingJob] = useState<ApiJob | null>(null)`
3. Modify the status flow button: when the next action is `completed`, instead of calling `handleStatusChange`, set `completingJob` to the current job
4. Render `<CompletionDialog>` at the component level (outside `JobCard`), controlled by `completingJob` state
5. On `onCompleted`, update the jobs list and clear `completingJob`

---

## Seed Data

### Modified file: `backend/prisma/seed.ts`

Add a second completed job for the demo customer to show documentation in action and provide customer history for pre-arrival:

```ts
await prisma.job.upsert({
  where: { id: "default-job-2" },
  create: {
    id: "default-job-2",
    organizationId: org.id,
    customerId: customer.id,
    technicianId: tech.id,
    status: "completed",
    scheduledAt: new Date(Date.now() - 7 * 86400000), // 1 week ago
    completedAt: new Date(Date.now() - 7 * 86400000 + 3600000), // 1 hour later
    symptomSummary: "AC not cooling, warm air from vents",
    equipmentType: "central-ac",
    serviceType: "repair",
    priority: "normal",
    actionsTaken: "Inspected outdoor unit. Found run capacitor bulging and reading low. Replaced capacitor and tested system. Verified proper cooling across all vents.",
    partsUsed: ["Run capacitor 45/5 MFD 440V"],
    summary: "Diagnosed and repaired a Central AC system that was blowing warm air. The run capacitor had failed and was replaced with a 45/5 MFD 440V unit. System tested and confirmed cooling properly across all zones.",
  },
  update: {
    summary: "Diagnosed and repaired a Central AC system that was blowing warm air. The run capacitor had failed and was replaced with a 45/5 MFD 440V unit. System tested and confirmed cooling properly across all zones.",
    actionsTaken: "Inspected outdoor unit. Found run capacitor bulging and reading low. Replaced capacitor and tested system. Verified proper cooling across all vents.",
    partsUsed: ["Run capacitor 45/5 MFD 440V"],
  },
});
```

This also gives the pre-arrival service real customer history to reference.

---

## Testing

### New file: `backend/src/__tests__/job-completion-ai.test.ts`

Tests for the completion AI service:

1. **Returns `{ error: "not_configured" }` when API key is missing** — verify `generateCompletionSummary()` returns the not-configured error without calling the Anthropic SDK
2. **Builds correct prompt with tech input and job context** — mock Anthropic SDK, verify the prompt includes actionsTaken, partsUsed, equipmentType, and preArrivalNotes
3. **Returns `{ summary }` from valid response** — mock a valid text response from Claude, verify the function returns the summary object (not writes to DB)
4. **Returns `{ error: "failed" }` on API errors** — mock a network error, verify it returns the failed error and doesn't throw
5. **Endpoint returns 503 for not-configured, 500 for failed** — verify the endpoint maps service results to correct HTTP status codes
6. **Endpoint returns 403 for customer role** — verify the role guard on the POST endpoint

All tests mock both the Anthropic SDK and Prisma client.

**Frontend tests:** Not included in this spec — the frontend test suite currently covers page rendering and interactions via Vitest + Testing Library, but dialog-specific tests are deferred to maintain the existing test scope.

---

## File Map

### New Files
| File | Purpose |
|------|---------|
| `backend/src/services/job-completion-ai.ts` | AI summary generation service |
| `backend/src/__tests__/job-completion-ai.test.ts` | Unit tests for completion AI service |
| `frontend/src/components/jobs/completion-dialog.tsx` | Completion form + AI summary dialog |

### Modified Files
| File | Changes |
|------|---------|
| `backend/src/routes/jobs.ts` | Add `POST /:id/generate-completion-summary` endpoint |
| `backend/prisma/seed.ts` | Add completed demo job with documentation data |
| `frontend/src/pages/technician/TechnicianJobs.tsx` | Intercept "Mark Complete" to open completion dialog |

---

## Out of Scope

- Photo uploads (deferred to future sub-project — requires storage backend)
- Office-side editing of completed job documentation
- Voice-to-text input for the actions field
- PDF report generation from completion data
- Mandatory documentation requirements beyond actionsTaken (summary, parts, notes remain optional)
- Streaming responses from Claude
- Token usage tracking
