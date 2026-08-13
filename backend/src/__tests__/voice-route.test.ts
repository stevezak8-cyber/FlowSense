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
