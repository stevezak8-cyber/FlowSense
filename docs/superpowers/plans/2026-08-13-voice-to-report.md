# Voice-to-Report Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow technicians to dictate a free-form job description by voice; Whisper transcribes it and Claude extracts structured completion fields that auto-populate the CompletionDialog.

**Architecture:** Browser records audio via MediaRecorder → sends multipart blob to `POST /api/voice/transcribe` → backend calls OpenAI Whisper (transcribe) then Claude (extract fields) → frontend populates CompletionDialog form state.

**Tech Stack:** OpenAI Whisper (`openai` package + `toFile()`), Anthropic Claude (existing SDK), `multer` (multipart), `MediaRecorder` browser API, React state.

**Spec:** `docs/superpowers/specs/2026-08-13-voice-to-report-design.md`

---

## Chunk 1: Backend — service + route + tests

### Task 1: Install packages

**Files:**
- Modify: `backend/package.json` (via npm install)

- [ ] **Step 1: Install packages**

```bash
cd /Users/stevenzakaria/flowsense/backend && npm install openai multer && npm install -D @types/multer
```

- [ ] **Step 2: Verify**

```bash
grep '"openai"\|"multer"' /Users/stevenzakaria/flowsense/backend/package.json
```

Expected: both present.

- [ ] **Step 3: Commit**

```bash
git add backend/package.json backend/package-lock.json
git commit -m "chore: install openai and multer for voice transcription"
```

---

### Task 2: `voice-transcribe` service + tests

**Files:**
- Create: `backend/src/services/voice-transcribe.ts`
- Create: `backend/src/__tests__/voice.test.ts`

- [ ] **Step 1: Write failing tests**

Create `backend/src/__tests__/voice.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock openai before importing the service
vi.mock("openai", () => {
  return {
    default: class MockOpenAI {
      audio = {
        transcriptions: {
          create: vi.fn(),
        },
      }
    },
    toFile: vi.fn(),
  }
})

vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class MockAnthropic {
      messages = { create: vi.fn() }
    },
  }
})

vi.mock("../lib/prisma.js", () => ({
  prisma: {},
}))

describe("transcribeAudio", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it("returns not_configured when OPENAI_API_KEY not set", async () => {
    vi.stubEnv("OPENAI_API_KEY", "")
    const { transcribeAudio } = await import("../services/voice-transcribe.js")
    const result = await transcribeAudio(Buffer.from("audio"), "audio/webm")
    expect(result).toEqual({ error: "not_configured" })
  })

  it("returns transcript on success", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key")
    vi.doMock("openai", () => ({
      default: class MockOpenAI {
        audio = {
          transcriptions: {
            create: vi.fn().mockResolvedValue({ text: "Replaced capacitor" }),
          },
        }
      },
      toFile: vi.fn().mockResolvedValue(new Blob()),
    }))
    vi.resetModules()
    const { transcribeAudio: fn } = await import("../services/voice-transcribe.js")
    const result = await fn(Buffer.from("audio"), "audio/webm")
    expect(result).toMatchObject({ transcript: expect.any(String) })
  })
})

describe("extractJobFields", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it("returns not_configured when ANTHROPIC_API_KEY not set", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "")
    vi.stubEnv("OPENAI_API_KEY", "test-key")
    const { extractJobFields } = await import("../services/voice-transcribe.js")
    const result = await extractJobFields("Replaced capacitor", {
      equipmentType: "ac",
      serviceType: "repair",
      symptomSummary: "No cooling",
    })
    expect(result).toEqual({ error: "not_configured" })
  })

  it("returns extracted fields on success", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key")
    vi.stubEnv("OPENAI_API_KEY", "test-key")
    vi.resetModules()
    const mockFields = {
      actionsTaken: "Replaced capacitor",
      partsUsed: ["Capacitor"],
      notes: "Unit running well",
      laborHours: 1.5,
      summary: "Technician replaced the capacitor.",
    }
    vi.doMock("@anthropic-ai/sdk", () => ({
      default: class MockAnthropic {
        messages = {
          create: vi.fn().mockResolvedValue({
            content: [{ type: "text", text: JSON.stringify(mockFields) }],
          }),
        }
      },
    }))
    vi.doMock("openai", () => ({
      default: class MockOpenAI {
        audio = { transcriptions: { create: vi.fn() } }
      },
      toFile: vi.fn(),
    }))
    vi.resetModules()
    const { extractJobFields: fn } = await import("../services/voice-transcribe.js")
    const result = await fn("Replaced capacitor", {
      equipmentType: "ac",
      serviceType: "repair",
      symptomSummary: null,
    })
    expect(result).toHaveProperty("fields")
    if ("fields" in result) {
      expect(result.fields.partsUsed).toBeInstanceOf(Array)
      expect(result.fields.laborHours).toBeGreaterThanOrEqual(0.5)
      expect(result.fields.laborHours).toBeLessThanOrEqual(24)
    }
  })

  it("falls back to safe defaults when Claude returns malformed JSON", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key")
    vi.stubEnv("OPENAI_API_KEY", "test-key")
    vi.doMock("@anthropic-ai/sdk", () => ({
      default: class MockAnthropic {
        messages = {
          create: vi.fn().mockResolvedValue({
            content: [{ type: "text", text: "not json at all" }],
          }),
        }
      },
    }))
    vi.doMock("openai", () => ({
      default: class MockOpenAI {
        audio = { transcriptions: { create: vi.fn() } }
      },
      toFile: vi.fn(),
    }))
    vi.resetModules()
    const { extractJobFields: fn } = await import("../services/voice-transcribe.js")
    const result = await fn("Replaced capacitor", {
      equipmentType: "ac",
      serviceType: "repair",
      symptomSummary: null,
    })
    expect(result).toHaveProperty("fields")
    if ("fields" in result) {
      expect(result.fields.actionsTaken).toBe("")
      expect(result.fields.partsUsed).toEqual([])
      expect(result.fields.laborHours).toBe(1)
    }
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd /Users/stevenzakaria/flowsense/backend && npx vitest run src/__tests__/voice.test.ts 2>&1 | head -20
```

Expected: FAIL (module not found).

- [ ] **Step 3: Create `backend/src/services/voice-transcribe.ts`**

```typescript
import Anthropic from "@anthropic-ai/sdk"
import OpenAI, { toFile } from "openai"
import { AI_MODEL } from "../lib/ai-config.js"

const openaiKey = process.env.OPENAI_API_KEY
if (!openaiKey) {
  console.log("[VoiceTranscribe] Skipped — no OPENAI_API_KEY set")
}
const openai = openaiKey ? new OpenAI({ apiKey: openaiKey }) : null

const anthropicKey = process.env.ANTHROPIC_API_KEY
const anthropic = anthropicKey ? new Anthropic({ apiKey: anthropicKey }) : null

export interface ExtractedFields {
  actionsTaken: string
  partsUsed: string[]
  notes: string
  laborHours: number
  summary: string
}

interface JobContext {
  equipmentType: string | null
  serviceType: string | null
  symptomSummary: string | null
}

type TranscribeResult =
  | { transcript: string }
  | { error: "not_configured" }
  | { error: "failed" }

type ExtractResult =
  | { fields: ExtractedFields }
  | { error: "not_configured" }
  | { error: "failed" }

export async function transcribeAudio(
  buffer: Buffer,
  mimeType: string
): Promise<TranscribeResult> {
  if (!openai) return { error: "not_configured" }
  try {
    const file = await toFile(buffer, "audio", { type: mimeType })
    const response = await openai.audio.transcriptions.create({
      model: "whisper-1",
      file,
    })
    return { transcript: response.text }
  } catch (e) {
    console.error("[VoiceTranscribe] Whisper error:", e)
    return { error: "failed" }
  }
}

export async function extractJobFields(
  transcript: string,
  context: JobContext
): Promise<ExtractResult> {
  if (!anthropic) return { error: "not_configured" }
  try {
    const prompt = `You are an HVAC field service assistant. A technician has dictated the following job report by voice.
Extract structured fields from it.

Job context:
- Equipment type: ${context.equipmentType ?? "unknown"}
- Service type: ${context.serviceType ?? "unknown"}
- Original complaint: ${context.symptomSummary ?? "none"}

Technician's dictation:
"${transcript}"

Respond with a JSON object (no markdown, no explanation):
{
  "actionsTaken": "what was done, in 1-3 sentences",
  "partsUsed": ["part1", "part2"],
  "notes": "any follow-up observations or recommendations",
  "laborHours": 1.5,
  "summary": "a professional 2-3 sentence job completion summary for the customer record"
}`

    const response = await anthropic.messages.create({
      model: AI_MODEL,
      max_tokens: 512,
      messages: [{ role: "user", content: prompt }],
    })

    const textBlock = response.content.find((b) => b.type === "text")
    if (!textBlock || textBlock.type !== "text") return { error: "failed" }

    let parsed: Partial<ExtractedFields>
    try {
      parsed = JSON.parse(textBlock.text)
    } catch {
      console.error("[VoiceTranscribe] Failed to parse Claude JSON, using defaults")
      parsed = {}
    }

    const laborHours = Math.min(24, Math.max(0.5, Number(parsed.laborHours) || 1))

    const fields: ExtractedFields = {
      actionsTaken: typeof parsed.actionsTaken === "string" ? parsed.actionsTaken : "",
      partsUsed: Array.isArray(parsed.partsUsed) ? parsed.partsUsed : [],
      notes: typeof parsed.notes === "string" ? parsed.notes : "",
      laborHours,
      summary: typeof parsed.summary === "string" ? parsed.summary : "",
    }
    return { fields }
  } catch (e) {
    console.error("[VoiceTranscribe] Claude error:", e)
    return { error: "failed" }
  }
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
cd /Users/stevenzakaria/flowsense/backend && npx vitest run src/__tests__/voice.test.ts
```

Fix any failures before proceeding.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/voice-transcribe.ts backend/src/__tests__/voice.test.ts
git commit -m "feat: add voice transcription service (Whisper + Claude field extraction)"
```

---

### Task 3: `voice` router + index wiring

**Files:**
- Create: `backend/src/routes/voice.ts`
- Modify: `backend/src/index.ts`

- [ ] **Step 1: Create separate route test file `backend/src/__tests__/voice-route.test.ts`**

**IMPORTANT: Do NOT append to `voice.test.ts`** — top-level `vi.mock` calls are hoisted by Vitest and would shadow the `vi.doMock` calls in the service unit tests. Use a separate file:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest"
import express from "express"
import request from "supertest"

vi.mock("../services/voice-transcribe.js", () => ({
  transcribeAudio: vi.fn(),
  extractJobFields: vi.fn(),
}))

import { voiceRouter } from "../routes/voice.js"
import { transcribeAudio, extractJobFields } from "../services/voice-transcribe.js"

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    ;(req as any).user = { id: "user-1", organizationId: "org-1", role: "technician" }
    next()
  })
  app.use("/api/voice", voiceRouter)
  return app
}

describe("POST /api/voice/transcribe", () => {
  beforeEach(() => { vi.clearAllMocks() })

  it("returns 400 when no audio file uploaded", async () => {
    const res = await request(buildApp())
      .post("/api/voice/transcribe")
      .field("equipmentType", "ac")
    expect(res.status).toBe(400)
  })

  it("returns 503 when transcription not configured", async () => {
    vi.mocked(transcribeAudio).mockResolvedValue({ error: "not_configured" })
    const res = await request(buildApp())
      .post("/api/voice/transcribe")
      .attach("audio", Buffer.from("fake-audio"), { filename: "audio.webm", contentType: "audio/webm" })
      .field("equipmentType", "ac")
    expect(res.status).toBe(503)
  })

  it("returns 503 when extraction not configured", async () => {
    vi.mocked(transcribeAudio).mockResolvedValue({ transcript: "Replaced capacitor" })
    vi.mocked(extractJobFields).mockResolvedValue({ error: "not_configured" })
    const res = await request(buildApp())
      .post("/api/voice/transcribe")
      .attach("audio", Buffer.from("fake-audio"), { filename: "audio.webm", contentType: "audio/webm" })
      .field("equipmentType", "ac")
    expect(res.status).toBe(503)
  })

  it("returns 200 with extracted fields on success", async () => {
    const mockFields = {
      actionsTaken: "Replaced capacitor",
      partsUsed: ["Capacitor"],
      notes: "",
      laborHours: 1.5,
      summary: "Capacitor replaced.",
    }
    vi.mocked(transcribeAudio).mockResolvedValue({ transcript: "Replaced capacitor" })
    vi.mocked(extractJobFields).mockResolvedValue({ fields: mockFields })
    const res = await request(buildApp())
      .post("/api/voice/transcribe")
      .attach("audio", Buffer.from("fake-audio"), { filename: "audio.webm", contentType: "audio/webm" })
      .field("equipmentType", "ac")
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject(mockFields)
  })
})
```

- [ ] **Step 2: Run new tests — verify they fail**

```bash
cd /Users/stevenzakaria/flowsense/backend && npx vitest run src/__tests__/voice-route.test.ts 2>&1 | tail -15
```

Expected: new route tests fail (module not found).

- [ ] **Step 3: Create `backend/src/routes/voice.ts`**

```typescript
import { Router } from "express"
import multer, { MulterError } from "multer"
import { transcribeAudio, extractJobFields } from "../services/voice-transcribe.js"

export const voiceRouter = Router()

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
})

voiceRouter.post(
  "/transcribe",
  (req, res, next) => {
    upload.single("audio")(req, res, (err) => {
      if (err instanceof MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({ error: "Recording too large — maximum 10MB" })
        }
        return res.status(400).json({ error: err.message })
      }
      if (err) return next(err)
      next()
    })
  },
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "No audio file uploaded" })
    }

    const { equipmentType, serviceType, symptomSummary } = req.body as Record<string, string | undefined>

    const transcribeResult = await transcribeAudio(req.file.buffer, req.file.mimetype)
    if ("error" in transcribeResult) {
      const status = transcribeResult.error === "not_configured" ? 503 : 500
      return res.status(status).json({ error: transcribeResult.error })
    }

    const extractResult = await extractJobFields(transcribeResult.transcript, {
      equipmentType: equipmentType ?? null,
      serviceType: serviceType ?? null,
      symptomSummary: symptomSummary ?? null,
    })
    if ("error" in extractResult) {
      const status = extractResult.error === "not_configured" ? 503 : 500
      return res.status(status).json({ error: extractResult.error })
    }

    res.json(extractResult.fields)
  }
)
```

- [ ] **Step 4: Mount in `backend/src/index.ts`**

Read `backend/src/index.ts`. Add import near other router imports:
```typescript
import { voiceRouter } from "./routes/voice.js"
```

Add mount near other API routes (after recurring-jobs, before any fallback):
```typescript
app.use("/api/voice", apiLimiter, requireAuth, requireSubscription, voiceRouter)
```

- [ ] **Step 5: Run all tests**

```bash
cd /Users/stevenzakaria/flowsense/backend && npx vitest run
```

Expected: all passing.

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/voice.ts backend/src/index.ts backend/src/__tests__/voice-route.test.ts
git commit -m "feat: add voice transcribe route and mount in index"
```

---

## Chunk 2: Frontend — API type + VoiceRecorder + CompletionDialog

### Task 4: Frontend API type

**Files:**
- Modify: `frontend/src/api/types.ts`

- [ ] **Step 1: Add `VoiceExtractedFields` to `frontend/src/api/types.ts`**

Add after existing interfaces (find a logical grouping — near AI-related types if any, otherwise at the end):

```typescript
export interface VoiceExtractedFields {
  actionsTaken: string
  partsUsed: string[]
  notes: string
  laborHours: number
  summary: string
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd /Users/stevenzakaria/flowsense/frontend && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api/types.ts
git commit -m "feat: add VoiceExtractedFields API type"
```

---

### Task 5: `VoiceRecorder` component

**Files:**
- Create: `frontend/src/components/jobs/VoiceRecorder.tsx`

- [ ] **Step 1: Create `frontend/src/components/jobs/VoiceRecorder.tsx`**

```typescript
import { useState, useRef, useEffect } from "react"
import { Mic, Square, Loader2, CheckCircle2, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ApiJob, VoiceExtractedFields } from "@/api/types"

interface Props {
  job: ApiJob
  onExtracted: (fields: VoiceExtractedFields) => void
  onError: (message: string) => void
}

type RecordState = "idle" | "recording" | "processing" | "done"

export function VoiceRecorder({ job, onExtracted, onError }: Props) {
  const [state, setState] = useState<RecordState>("idle")
  const [elapsed, setElapsed] = useState(0)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      chunksRef.current = []
      mediaRecorderRef.current = recorder

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType })
        await processAudio(blob, recorder.mimeType)
      }

      recorder.start()
      setState("recording")
      setElapsed(0)
      timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000)
    } catch {
      onError("Microphone access denied — please allow mic permissions and try again")
    }
  }

  function stopRecording() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    mediaRecorderRef.current?.stop()
    setState("processing")
  }

  async function processAudio(blob: Blob, mimeType: string) {
    try {
      const formData = new FormData()
      formData.append("audio", blob, "audio")
      if (job.equipmentType) formData.append("equipmentType", job.equipmentType)
      if (job.serviceType) formData.append("serviceType", job.serviceType)
      if (job.symptomSummary) formData.append("symptomSummary", job.symptomSummary)

      const token = localStorage.getItem("flowsense_token")  // matches TOKEN_KEY in api/client.ts
      const res = await fetch("/api/voice/transcribe", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? `Server error ${res.status}`)
      }

      const fields: VoiceExtractedFields = await res.json()
      onExtracted(fields)
      setState("done")
    } catch (e) {
      setState("idle")
      onError(
        e instanceof Error
          ? e.message
          : "Voice transcription failed — please try again or fill in manually"
      )
    }
  }

  function formatTime(s: number) {
    return `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`
  }

  if (state === "idle") {
    return (
      <Button variant="outline" size="sm" onClick={startRecording} className="gap-2">
        <Mic className="h-4 w-4" />
        Dictate report
      </Button>
    )
  }

  if (state === "recording") {
    return (
      <div className="flex items-center gap-3">
        <span className="flex h-3 w-3 relative">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
        </span>
        <span className="text-sm font-mono text-red-600">{formatTime(elapsed)}</span>
        <Button variant="outline" size="sm" onClick={stopRecording} className="gap-2">
          <Square className="h-4 w-4" />
          Stop
        </Button>
      </div>
    )
  }

  if (state === "processing") {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Transcribing…
      </div>
    )
  }

  // done
  return (
    <div className="flex items-center gap-2">
      <CheckCircle2 className="h-4 w-4 text-green-500" />
      <span className="text-sm text-green-600">Voice report applied</span>
      <Button variant="ghost" size="sm" onClick={() => setState("idle")} className="gap-1 h-7 px-2 text-xs">
        <RefreshCw className="h-3 w-3" />
        Re-record
      </Button>
    </div>
  )
}
```

**Note on auth:** The code uses `localStorage.getItem("flowsense_token")` which matches `TOKEN_KEY` in `frontend/src/api/client.ts`.

- [ ] **Step 2: TypeScript check**

```bash
cd /Users/stevenzakaria/flowsense/frontend && npx tsc --noEmit 2>&1 | head -30
```

Fix any type errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/jobs/VoiceRecorder.tsx
git commit -m "feat: add VoiceRecorder component with MediaRecorder + Whisper integration"
```

---

### Task 6: Wire VoiceRecorder into CompletionDialog

**Files:**
- Modify: `frontend/src/components/jobs/completion-dialog.tsx`

- [ ] **Step 1: Read the file**

Read `frontend/src/components/jobs/completion-dialog.tsx` in full — understand the existing state (`actionsTaken`, `partsUsed`, `notes`, `laborHours`, `summary`, `hasGenerated`) and form structure.

- [ ] **Step 2: Add imports**

Add near top of file:
```typescript
import { VoiceRecorder } from "./VoiceRecorder"
import type { VoiceExtractedFields } from "@/api/types"
```

- [ ] **Step 3: Add state + handler**

Inside the `CompletionDialog` function, add:
```typescript
const [voiceFilled, setVoiceFilled] = useState(false)

function handleVoiceExtracted(fields: VoiceExtractedFields) {
  setActionsTaken(fields.actionsTaken)
  setPartsUsed(fields.partsUsed)
  setNotes(fields.notes)
  setLaborHours(fields.laborHours)
  setSummary(fields.summary)
  setHasGenerated(true)  // REQUIRED: summary textarea only renders when hasGenerated === true
  setVoiceFilled(true)
}
```

- [ ] **Step 4: Add VoiceRecorder + banner to JSX**

Find the form content area (just before the `actionsTaken` textarea label). Insert:

```tsx
{/* Voice recorder */}
<div className="flex items-center justify-between">
  <VoiceRecorder
    job={job}
    onExtracted={handleVoiceExtracted}
    onError={(msg) => toast.error(msg)}
  />
</div>

{voiceFilled && (
  <div className="rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-700 dark:bg-blue-950 dark:text-blue-300">
    Fields filled by voice — review before submitting
  </div>
)}
```

- [ ] **Step 5: TypeScript check**

```bash
cd /Users/stevenzakaria/flowsense/frontend && npx tsc --noEmit 2>&1 | head -30
```

Fix any errors.

- [ ] **Step 6: Run backend tests to make sure nothing regressed**

```bash
cd /Users/stevenzakaria/flowsense/backend && npx vitest run
```

Expected: all passing.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/jobs/completion-dialog.tsx
git commit -m "feat: wire VoiceRecorder into CompletionDialog with voice-fill handler"
```

---

## Post-implementation

After all tasks complete, verify the auth token retrieval pattern in `VoiceRecorder.tsx` matches the actual pattern in `frontend/src/api/client.ts`. If the client uses a different mechanism (auth header injection, cookies, context), update `processAudio` accordingly.
