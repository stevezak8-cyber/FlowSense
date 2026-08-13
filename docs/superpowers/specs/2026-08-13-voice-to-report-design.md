# Voice-to-Report — Design Spec

**Date:** 2026-08-13
**Feature:** Feature 8 of 11 — Voice-to-Report
**Status:** Approved for implementation

---

## Overview

Allow technicians to dictate a free-form job description by voice. The audio is transcribed by OpenAI Whisper on the backend, then Claude extracts structured job completion fields (actionsTaken, partsUsed, notes, laborHours, summary) from the transcript. The extracted fields auto-populate the existing CompletionDialog for review before submission. Manual form entry remains fully available as a fallback.

---

## Data & API

### No schema changes

Voice transcription is stateless — nothing is persisted until the technician submits the normal completion form. The voice flow is: record → transcribe → extract → populate in-memory form fields.

### New packages

```bash
cd backend && npm install openai multer && npm install -D @types/multer
```

- `openai` — for Whisper transcription (separate from existing Anthropic SDK)
- `multer` — multipart file upload middleware for Express

### New endpoint

#### `POST /api/voice/transcribe`

Accepts a multipart form upload. Mounted with `requireAuth + requireSubscription`.

**Request (multipart/form-data):**
```
audio        File     — audio blob from MediaRecorder (WebM, mp4, or wav)
equipmentType   string?  — job context
serviceType     string?  — job context
symptomSummary  string?  — job context
```

**Limits:** 10MB file size max (multer memory storage).

**Response 200:**
```typescript
{
  actionsTaken: string
  partsUsed: string[]    // Claude returns a JSON array of strings
  notes: string
  laborHours: number
  summary: string
}
```

**Error responses:**
- `400` — no audio file uploaded
- `503` — `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` not configured
- `500` — transcription or extraction failed

---

## Backend

### New file: `backend/src/services/voice-transcribe.ts`

Two exported functions:

#### `transcribeAudio(buffer: Buffer, mimeType: string): Promise<TranscribeResult>`

```typescript
type TranscribeResult =
  | { transcript: string }
  | { error: "not_configured" }
  | { error: "failed" }
```

- Uses the `openai` package's `audio.transcriptions.create` method with `model: "whisper-1"`
- Uploads audio using `toFile(buffer, "audio", { type: mimeType })` from the `openai` package — do NOT use the `File` constructor directly, it is unavailable in Node 18
- Silent-skip: if `OPENAI_API_KEY` not set, returns `{ error: "not_configured" }` without throwing
- On API failure: logs error, returns `{ error: "failed" }`

#### `extractJobFields(transcript: string, jobContext: JobContext): Promise<ExtractResult>`

```typescript
interface JobContext {
  equipmentType: string | null
  serviceType: string | null
  symptomSummary: string | null
}

type ExtractResult =
  | { fields: ExtractedFields }
  | { error: "not_configured" }
  | { error: "failed" }

interface ExtractedFields {
  actionsTaken: string
  partsUsed: string[]
  notes: string
  laborHours: number
  summary: string
}
```

- Uses existing `Anthropic` client from `ai-config.ts` pattern (silent-skip if no key)
- Sends a structured extraction prompt to `AI_MODEL`:

```
You are an HVAC field service assistant. A technician has dictated the following job report by voice.
Extract structured fields from it.

Job context:
- Equipment type: {equipmentType ?? "unknown"}
- Service type: {serviceType ?? "unknown"}
- Original complaint: {symptomSummary ?? "none"}

Technician's dictation:
"{transcript}"

Respond with a JSON object (no markdown, no explanation):
{
  "actionsTaken": "what was done, in 1-3 sentences",
  "partsUsed": ["part1", "part2"],
  "notes": "any follow-up observations or recommendations",
  "laborHours": 1.5,
  "summary": "a professional 2-3 sentence job completion summary for the customer record"
}
```

- Parses the JSON response; falls back to safe defaults if parsing fails (empty strings, empty array, `laborHours: 1`)
- Clamps `laborHours` to the range `[0.5, 24]` before returning (Claude may return values outside the form's allowed range)
- Silent-skip: if `ANTHROPIC_API_KEY` not set, returns `{ error: "not_configured" }`

### New file: `backend/src/routes/voice.ts`

```typescript
export const voiceRouter = Router()
```

Single route: `POST /api/voice/transcribe`

- `multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }).single("audio")` applied inline on this route only
- Multer error handler: catch `MulterError` with code `LIMIT_FILE_SIZE` and return 400 `{ error: "Recording too large — maximum 10MB" }`. Other `MulterError` codes return 400 generically.
- Validates: file present (400 if not)
- Calls `transcribeAudio(req.file.buffer, req.file.mimetype)`
- On `not_configured`: return 503
- On `failed`: return 500
- Calls `extractJobFields(transcript, { equipmentType, serviceType, symptomSummary })` from `req.body`
- On `not_configured`: return 503
- On `failed`: return 500
- Returns 200 with `ExtractedFields`

### Modified file: `backend/src/index.ts`

Mount at `/api/voice`:
```typescript
app.use("/api/voice", apiLimiter, requireAuth, requireSubscription, voiceRouter)
```

### New file: `backend/src/__tests__/voice.test.ts`

Tests:
1. Returns 400 when no audio file uploaded
2. Returns 503 when `OPENAI_API_KEY` not set (mock `transcribeAudio` returning `not_configured`)
3. Returns 503 when `ANTHROPIC_API_KEY` not set (mock `extractJobFields` returning `not_configured`)
4. Returns 200 with extracted fields on success (mock both services)
5. `transcribeAudio` — returns `not_configured` when no API key
6. `extractJobFields` — returns safe defaults when Claude returns malformed JSON

---

## Frontend

### New file: `frontend/src/components/jobs/VoiceRecorder.tsx`

Props:
```typescript
interface Props {
  job: ApiJob
  onExtracted: (fields: ExtractedFields) => void
  onError: (message: string) => void
}

interface ExtractedFields {
  actionsTaken: string
  partsUsed: string[]
  notes: string
  laborHours: number
  summary: string
}
```

**Recording states:**

| State | UI |
|---|---|
| `idle` | Mic icon button + "Dictate report" label |
| `recording` | Pulsing red dot + elapsed timer (MM:SS) + "Stop" button |
| `processing` | Spinner + "Transcribing…" text |
| `done` | Green checkmark + "Re-record" button (resets to idle) |

**Recording implementation:**
- `navigator.mediaDevices.getUserMedia({ audio: true })` to get mic stream
- `MediaRecorder` to collect chunks into a `Blob`
- On stop: build `FormData` with blob as `audio` field + job context fields (`equipmentType`, `serviceType`, `symptomSummary`)
- POST to `/api/voice/transcribe`
- On success: call `onExtracted(fields)`
- On error: call `onError("Voice transcription failed — please try again or fill in manually")`

**Browser compatibility note:** `MediaRecorder` is supported in all modern browsers (Chrome, Firefox, Safari 14.1+, mobile Chrome/Safari). No polyfill needed for this use case.

### Modified file: `frontend/src/components/jobs/completion-dialog.tsx`

**Additions:**

1. Import and render `<VoiceRecorder>` above the `actionsTaken` textarea:

```tsx
<VoiceRecorder
  job={job}
  onExtracted={handleVoiceExtracted}
  onError={(msg) => toast.error(msg)}
/>
```

2. Add handler:
```typescript
function handleVoiceExtracted(fields: ExtractedFields) {
  setActionsTaken(fields.actionsTaken)
  setPartsUsed(fields.partsUsed)
  setNotes(fields.notes)
  setLaborHours(fields.laborHours)
  setSummary(fields.summary)
  setHasGenerated(true)   // REQUIRED: summary textarea is only rendered when hasGenerated === true
  setVoiceFilled(true)
}
```

3. Add `voiceFilled` state (boolean). When true, render a subtle banner above the form:
```tsx
{voiceFilled && (
  <div className="rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-700 dark:bg-blue-950 dark:text-blue-300">
    Fields filled by voice — review before submitting
  </div>
)}
```

The banner dismisses automatically when the technician edits any field (or stays — either is acceptable).

---

## API Types

Add to `frontend/src/api/types.ts`:
```typescript
export interface VoiceExtractedFields {
  actionsTaken: string
  partsUsed: string[]
  notes: string
  laborHours: number
  summary: string
}
```

`VoiceRecorder.tsx` and `completion-dialog.tsx` must both import `VoiceExtractedFields` from `@/api/types` — do not redefine the shape inline in either component.

**Note on `notes` persistence:** The existing `handleComplete` submit handler does not include `notes` in the PATCH payload. This is pre-existing behavior and is out of scope for this feature — voice-extracted `notes` will populate the form field visually but will not be submitted. This is intentional (the field is for technician reference only in the current data model).

---

## Error States

| Condition | Behaviour |
|---|---|
| Mic permission denied | `onError` called with user-friendly message; stays in `idle` state |
| Upload fails (network) | `onError` called; state resets to `idle` |
| Whisper not configured | 503 returned; `onError` shown via toast |
| Claude not configured | 503 returned; `onError` shown via toast |
| Claude returns malformed JSON | Service falls back to safe defaults; 200 still returned |
| Technician wants to redo | "Re-record" button resets state to `idle`; fields remain editable |

---

## Out of Scope

- Storing audio recordings or transcripts in the database
- Real-time streaming transcription
- Offline voice recording with sync-on-reconnect
- Language selection (Whisper auto-detects)
- Voice input on the office side
- Playback of recorded audio
