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
        await processAudio(blob)
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

  async function processAudio(blob: Blob) {
    try {
      const formData = new FormData()
      formData.append("audio", blob, "audio")
      if (job.equipmentType) formData.append("equipmentType", job.equipmentType)
      if (job.serviceType) formData.append("serviceType", job.serviceType)
      if (job.symptomSummary) formData.append("symptomSummary", job.symptomSummary)

      const token = localStorage.getItem("flowsense_token")
      const res = await fetch("/api/voice/transcribe", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as any).error ?? `Server error ${res.status}`)
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
