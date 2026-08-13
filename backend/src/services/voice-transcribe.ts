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
