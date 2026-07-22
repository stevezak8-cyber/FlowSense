import { useState, useRef, useEffect } from "react"
import { X, Send } from "lucide-react"
import { useAiChat, type AiMessage } from "@/hooks/useAiChat"

interface Props {
  jobId: string
  jobContext: { equipmentType?: string | null }
  onClose: () => void
}

const ACTION_CARDS: { emoji: string; title: string; subtitle: string; getMessage: (eq: string) => string | null }[] = [
  {
    emoji: "🔍",
    title: "Look up error code",
    subtitle: "Decode fault codes for this unit",
    getMessage: (eq: string) => `Look up error codes for ${eq}`,
  },
  {
    emoji: "🔧",
    title: "Diagnose symptoms",
    subtitle: "Step-by-step troubleshooting guide",
    getMessage: (_eq: string) => "Help me diagnose the symptoms for this job",
  },
  {
    emoji: "💬",
    title: "Ask anything",
    subtitle: "Specs, procedures, compatibility",
    getMessage: (_eq: string) => null, // focuses input instead
  },
]

function StreamingCursor() {
  return (
    <span
      className="inline-block ml-0.5 align-middle"
      style={{
        width: 2,
        height: 13,
        background: "#6366f1",
        borderRadius: 1,
        animation: "aiCursorBlink 0.8s step-end infinite",
      }}
    />
  )
}

function MessageBubble({ msg }: { msg: AiMessage }) {
  if (msg.role === "user") {
    return (
      <div className="flex justify-end">
        <div
          style={{
            background: "#6366f1",
            color: "white",
            borderRadius: "16px 16px 4px 16px",
            padding: "9px 13px",
            maxWidth: "80%",
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          {msg.content}
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-2 items-start">
      <div
        style={{
          width: 24,
          height: 24,
          borderRadius: "50%",
          background: "linear-gradient(135deg,#6366f1,#8b5cf6)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "white",
          fontSize: 11,
          flexShrink: 0,
          marginTop: 2,
        }}
      >
        ✦
      </div>
      <div
        style={{
          background: "#1e293b",
          border: "1px solid #334155",
          borderRadius: "4px 16px 16px 16px",
          padding: "10px 13px",
          maxWidth: "85%",
          fontSize: 13,
          lineHeight: 1.6,
          color: "#e2e8f0",
          whiteSpace: "pre-wrap",
        }}
      >
        {msg.content}
        {msg.streaming && <StreamingCursor />}
      </div>
    </div>
  )
}

export function AiChatPanel({ jobId, jobContext, onClose }: Props) {
  const { messages, streaming, sendMessage } = useAiChat(jobId)
  const [inputValue, setInputValue] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  function handleSend() {
    const text = inputValue.trim()
    if (!text || streaming) return
    setInputValue("")
    sendMessage(text)
  }

  function handleActionCard(card: (typeof ACTION_CARDS)[number]) {
    const msg = card.getMessage(jobContext.equipmentType ?? "this unit")
    if (msg) {
      sendMessage(msg)
    } else {
      inputRef.current?.focus()
    }
  }

  const showEmptyState = messages.length === 0

  return (
    <>
      <style>{`
        @keyframes aiCursorBlink { 0%,100%{opacity:1} 50%{opacity:0} }
      `}</style>

      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        style={{ background: "rgba(0,0,0,0.6)" }}
        onClick={onClose}
      />

      {/* Bottom sheet */}
      <div
        className="fixed inset-x-0 bottom-0 z-50 flex flex-col"
        style={{
          background: "#0f172a",
          maxHeight: "90vh",
          borderRadius: "16px 16px 0 0",
        }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div style={{ width: 32, height: 3, background: "#475569", borderRadius: 2 }} />
        </div>

        {/* Header */}
        <div
          style={{
            background: "#1e293b",
            borderBottom: "1px solid #334155",
            padding: "12px 16px",
          }}
        >
          <div className="flex items-center justify-between">
            <div>
              <div style={{ color: "#f1f5f9", fontWeight: 600, fontSize: 14 }}>AI Assistant</div>
              {jobContext.equipmentType && (
                <div style={{ color: "#64748b", fontSize: 11, marginTop: 1 }}>
                  {jobContext.equipmentType}
                </div>
              )}
            </div>
            <button
              onClick={onClose}
              style={{
                background: "#0f172a",
                border: "1px solid #334155",
                color: "#94a3b8",
                borderRadius: 6,
                padding: "4px 8px",
                fontSize: 12,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
              }}
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Context badge */}
        <div
          style={{
            padding: "8px 16px",
            background: "#0f172a",
            borderBottom: "1px solid #1e293b",
          }}
        >
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: "#1e293b",
              border: "1px solid #334155",
              borderRadius: 20,
              padding: "4px 10px",
              fontSize: 10,
              color: "#94a3b8",
            }}
          >
            <span style={{ color: "#6366f1" }}>✦</span>
            Job context · Tech profile · Org history loaded
          </div>
        </div>

        {/* Messages area */}
        <div
          className="flex-1 overflow-y-auto"
          style={{ padding: "16px", display: "flex", flexDirection: "column", gap: 12, minHeight: 0 }}
        >
          {showEmptyState ? (
            <div style={{ textAlign: "center", paddingTop: 8 }}>
              <div style={{ color: "#475569", fontSize: 12, marginBottom: 12 }}>
                What do you need help with?
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {ACTION_CARDS.map((card) => (
                  <button
                    key={card.title}
                    onClick={() => handleActionCard(card)}
                    style={{
                      background: "#1e293b",
                      border: "1px solid #334155",
                      color: "#e2e8f0",
                      borderRadius: 10,
                      padding: "10px 14px",
                      fontSize: 13,
                      textAlign: "left",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <span style={{ fontSize: 18 }}>{card.emoji}</span>
                    <div>
                      <div style={{ fontWeight: 500 }}>{card.title}</div>
                      <div style={{ color: "#64748b", fontSize: 11, marginTop: 1 }}>
                        {card.subtitle}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg, i) => <MessageBubble key={i} msg={msg} />)
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input bar */}
        <div
          style={{
            padding: "12px 16px",
            background: "#1e293b",
            borderTop: "1px solid #334155",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: "#0f172a",
              border: `1px solid ${streaming ? "#334155" : "#6366f1"}`,
              borderRadius: 12,
              padding: "8px 12px",
              boxShadow: streaming ? "none" : "0 0 0 3px rgba(99,102,241,0.1)",
            }}
          >
            <input
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
              placeholder={streaming ? "AI is responding…" : "Ask about this job…"}
              disabled={streaming}
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                outline: "none",
                color: "#e2e8f0",
                fontSize: 13,
              }}
            />
            <button
              onClick={handleSend}
              disabled={!inputValue.trim() || streaming}
              style={{
                background: !inputValue.trim() || streaming ? "#334155" : "#6366f1",
                border: "none",
                color: "white",
                borderRadius: 8,
                width: 30,
                height: 30,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: !inputValue.trim() || streaming ? "not-allowed" : "pointer",
                flexShrink: 0,
              }}
            >
              <Send size={14} />
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
