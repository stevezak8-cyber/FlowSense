import { useState, useRef, useEffect } from "react"
import { MessageCircle, X, Send, Loader2 } from "lucide-react"
import { api } from "@/api/client"
import type { ConciergeMessage } from "@/api/types"

interface Props {
  embedded?: boolean
}

export function ConciergeChatWidget({ embedded }: Props) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ConciergeMessage[]>([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [jobConfirmed, setJobConfirmed] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, loading])

  async function handleSend() {
    if (!input.trim() || loading) return
    const userMsg: ConciergeMessage = { role: "user", content: input.trim() }
    const nextMessages = [...messages, userMsg]
    setMessages(nextMessages)
    setInput("")
    setLoading(true)
    try {
      const data = await api.post<{ reply: string; jobCreated?: { id: string } }>(
        "/api/concierge/chat",
        { messages: nextMessages }
      )
      setMessages([...nextMessages, { role: "assistant", content: data.reply }])
      if (data.jobCreated) setJobConfirmed(true)
    } catch (e) {
      const msg = (e instanceof Error && e.message === "not_configured")
        ? "AI concierge is not available right now. Please contact us directly."
        : "Sorry, I'm having trouble connecting. Please try again or contact us directly."
      setMessages([...nextMessages, { role: "assistant", content: msg }])
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const chatContent = (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && (
          <p className="text-xs text-muted-foreground text-center pt-4">
            Ask me about your service history, invoices, or request a new appointment.
          </p>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                msg.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-foreground"
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-muted rounded-xl px-3 py-2">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          </div>
        )}
        {jobConfirmed && (
          <div className="rounded-md bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-800 dark:bg-green-950 dark:text-green-300 dark:border-green-800">
            Service request submitted — we'll be in touch to confirm your appointment.
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="border-t p-3 flex gap-2 items-end">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message…"
          rows={1}
          className="flex-1 resize-none rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={!input.trim() || loading}
          className="rounded-lg bg-primary p-2 text-primary-foreground hover:bg-primary/90 disabled:opacity-50 shrink-0"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  )

  if (embedded) {
    return (
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden flex flex-col" style={{ height: 400 }}>
        <div className="px-4 py-3 border-b">
          <h2 className="text-sm font-semibold text-foreground">AI Concierge</h2>
          <p className="text-xs text-muted-foreground">Ask about your service or book an appointment</p>
        </div>
        {chatContent}
      </div>
    )
  }

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-colors"
          aria-label="Open AI Concierge"
        >
          <MessageCircle className="h-6 w-6" />
        </button>
      )}

      {open && (
        <div className="fixed bottom-6 right-6 z-50 w-96 rounded-xl border bg-card shadow-xl overflow-hidden flex flex-col" style={{ height: 480 }}>
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <div>
              <h2 className="text-sm font-semibold text-foreground">AI Concierge</h2>
              <p className="text-xs text-muted-foreground">Ask about your service or book an appointment</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded p-1 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {chatContent}
        </div>
      )}
    </>
  )
}
