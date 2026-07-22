import { useState, useEffect, useRef } from "react"
import { api } from "@/api/client"

export interface AiMessage {
  role: "user" | "assistant"
  content: string
  streaming?: boolean
}

interface StoredAiMessage {
  id: string
  jobId: string
  role: string
  content: string
  createdAt: string
}

export function useAiChat(jobId: string) {
  const [messages, setMessages] = useState<AiMessage[]>([])
  const [streaming, setStreaming] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  // Load history on mount
  useEffect(() => {
    api.get<StoredAiMessage[]>(`/api/ai/chat/${jobId}`)
      .then((stored) => {
        setMessages(stored.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })))
      })
      .catch(() => {
        // Silently ignore — empty state is fine
      })
  }, [jobId])

  // Abort any in-flight stream on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  async function sendMessage(text: string) {
    if (streaming) return

    // Cancel any in-flight stream
    abortRef.current?.abort()
    abortRef.current = new AbortController()

    // Optimistically append user message + empty streaming assistant message
    setMessages((prev) => [
      ...prev,
      { role: "user", content: text },
      { role: "assistant", content: "", streaming: true },
    ])
    setStreaming(true)

    const token = localStorage.getItem("flowsense_token") ?? ""

    try {
      const res = await fetch("/api/ai/chat/stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ jobId, message: text }),
        signal: abortRef.current.signal,
      })

      if (!res.ok) {
        const errMsg =
          res.status === 503
            ? "AI assistant not available — contact your admin."
            : res.status === 404
            ? "This job is no longer available."
            : "Something went wrong. Tap to retry."
        setMessages((prev) => {
          const updated = [...prev]
          updated[updated.length - 1] = { role: "assistant", content: errMsg, streaming: false }
          return updated
        })
        setStreaming(false)
        return
      }

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop() ?? ""

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue
          const data = line.slice(6).trim()
          if (data === "[DONE]") {
            setMessages((prev) => {
              const updated = [...prev]
              updated[updated.length - 1] = { ...updated[updated.length - 1], streaming: false }
              return updated
            })
            setStreaming(false)
            return
          }
          try {
            const parsed = JSON.parse(data)
            if (parsed.token) {
              setMessages((prev) => {
                const updated = [...prev]
                const last = updated[updated.length - 1]
                updated[updated.length - 1] = { ...last, content: last.content + parsed.token }
                return updated
              })
            } else if (parsed.error) {
              setMessages((prev) => {
                const updated = [...prev]
                updated[updated.length - 1] = {
                  role: "assistant",
                  content: "Something went wrong. Tap to retry.",
                  streaming: false,
                }
                return updated
              })
              setStreaming(false)
              return
            }
          } catch {
            // Ignore malformed SSE lines
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") return

      const isOffline = err instanceof TypeError && err.message.toLowerCase().includes("fetch")
      const errMsg = isOffline
        ? "You're offline — AI requires a connection."
        : "Something went wrong. Tap to retry."

      setMessages((prev) => {
        const updated = [...prev]
        updated[updated.length - 1] = { role: "assistant", content: errMsg, streaming: false }
        return updated
      })
      setStreaming(false)
    }
  }

  function clearMessages() {
    abortRef.current?.abort()
    setMessages([])
    setStreaming(false)
  }

  return { messages, streaming, sendMessage, clearMessages }
}
