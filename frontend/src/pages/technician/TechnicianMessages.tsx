import { useState, useEffect, useRef } from "react"
import { api } from "@/api/client"
import type { ApiConversation, ApiMessage } from "@/api/types"
import { Loader2, Send, ChevronLeft, MessageSquare } from "lucide-react"
import { cn } from "@/lib/utils"
import { useAuth } from "@/auth/auth-context"

function timeLabel(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000)
  if (diffDays === 0) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  if (diffDays === 1) return "Yesterday"
  return d.toLocaleDateString([], { month: "short", day: "numeric" })
}

export default function TechMessagesPage() {
  const { user } = useAuth()
  const [conversations, setConversations] = useState<ApiConversation[]>([])
  const [loading, setLoading] = useState(true)
  const [activeConv, setActiveConv] = useState<ApiConversation | null>(null)
  const [messages, setMessages] = useState<ApiMessage[]>([])
  const [draft, setDraft] = useState("")
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    api.get<ApiConversation[]>("/api/conversations")
      .then(setConversations)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!activeConv) return
    api.get<ApiConversation>(`/api/conversations/${activeConv.id}`)
      .then(c => setMessages(c.messages ?? []))
      .catch(() => {})
  }, [activeConv])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  async function send() {
    if (!draft.trim() || !activeConv) return
    setSending(true)
    try {
      const msg = await api.post<ApiMessage>(`/api/conversations/${activeConv.id}/messages`, {
        content: draft.trim(),
        sender: user?.name ?? "Technician",
        senderRole: "technician",
      })
      setMessages(prev => [...prev, msg])
      setDraft("")
    } catch { /* silent */ } finally {
      setSending(false)
    }
  }

  // Thread view
  if (activeConv) {
    return (
      <div className="flex flex-col h-[calc(100vh-8rem)]">
        {/* Header */}
        <div className="flex items-center gap-3 pb-3 border-b border-border/60">
          <button onClick={() => setActiveConv(null)} className="p-1 -ml-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{activeConv.subject}</p>
            <p className="text-[11px] text-muted-foreground capitalize">{activeConv.channel}</p>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto py-3 space-y-3">
          {messages.map(msg => {
            const isMe = msg.senderRole === "technician"
            return (
              <div key={msg.id} className={cn("flex flex-col gap-0.5", isMe ? "items-end" : "items-start")}>
                {!isMe && (
                  <p className="text-[10px] text-muted-foreground px-1">{msg.sender}</p>
                )}
                <div className={cn(
                  "max-w-[78%] rounded-2xl px-3.5 py-2.5 text-sm",
                  isMe
                    ? "bg-primary text-primary-foreground rounded-br-sm"
                    : "bg-muted text-foreground rounded-bl-sm"
                )}>
                  {msg.content}
                </div>
                <p className="text-[10px] text-muted-foreground/60 px-1">{timeLabel(msg.createdAt)}</p>
              </div>
            )
          })}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="flex items-end gap-2 pt-3 border-t border-border/60">
          <textarea
            className="flex-1 min-h-[44px] max-h-28 resize-none rounded-2xl border border-border/60 bg-muted/50 px-4 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            placeholder="Message…"
            rows={1}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send() }
            }}
          />
          <button
            onClick={send}
            disabled={!draft.trim() || sending}
            className="flex-shrink-0 flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-40 transition-opacity"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      </div>
    )
  }

  // Conversation list
  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Messages</h1>
        <p className="text-xs text-muted-foreground">Office &amp; dispatch</p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground py-8">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Loading…</span>
        </div>
      ) : conversations.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
          <MessageSquare className="h-10 w-10 opacity-30" />
          <p className="text-sm">No messages yet</p>
        </div>
      ) : (
        <div className="space-y-1 -mx-4">
          {conversations.map(conv => (
            <button
              key={conv.id}
              onClick={() => setActiveConv(conv)}
              className="w-full flex items-start gap-3 px-4 py-3.5 hover:bg-muted/50 transition-colors text-left"
            >
              <div className="flex-shrink-0 mt-0.5 h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-bold">
                {conv.subject.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className={cn("text-sm truncate", conv.unreadCount > 0 ? "font-bold text-foreground" : "font-medium text-foreground")}>
                    {conv.subject}
                  </p>
                  <p className="text-[11px] text-muted-foreground flex-shrink-0">{timeLabel(conv.lastMessageAt)}</p>
                </div>
                <div className="flex items-center justify-between gap-2 mt-0.5">
                  <p className="text-xs text-muted-foreground truncate capitalize">{conv.channel} · {conv.participants.length} people</p>
                  {conv.unreadCount > 0 && (
                    <span className="flex-shrink-0 h-5 min-w-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center px-1.5">
                      {conv.unreadCount > 9 ? "9+" : conv.unreadCount}
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
