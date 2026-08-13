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
