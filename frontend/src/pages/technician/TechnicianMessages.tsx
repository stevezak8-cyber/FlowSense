import { useState, useEffect, useRef } from "react"
import { api } from "@/api/client"
import type { ApiConversation, ApiMessage } from "@/api/types"
import { Loader2, Send, ChevronLeft, MessageSquare, Paperclip, Phone } from "lucide-react"
import { useAuth } from "@/auth/auth-context"

const font = "'Archivo', sans-serif"

const T = {
  bg: "#f3f2f2",
  text: "#201e1d",
  accent: "#ec3013",
  accentLight: "#ae1800",
  accentTint: "#fde8e4",
  n300: "#d7d3d3",
  n400: "#c4bfbf",
  n500: "#a09b9b",
  n600: "#706c6c",
  n700: "#4a4646",
}

function timeLabel(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000)
  if (diffDays === 0) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  if (diffDays === 1) return "Yesterday"
  return d.toLocaleDateString([], { month: "short", day: "numeric" })
}

function avatarBg(conv: ApiConversation) {
  if (conv.unreadCount > 0 && conv.channel === "internal") return T.accent
  if (conv.unreadCount > 0) return T.text
  return T.n400
}

const QUICK_REPLIES = ["On my way", "Running 15 late", "Need the part"]

export default function TechMessagesPage() {
  const { user } = useAuth()
  const [conversations, setConversations] = useState<ApiConversation[]>([])
  const [loading, setLoading] = useState(true)
  const [activeConv, setActiveConv] = useState<ApiConversation | null>(null)
  const [messages, setMessages] = useState<ApiMessage[]>([])
  const [draft, setDraft] = useState("")
  const [sending, setSending] = useState(false)
  const [activeFilter, setActiveFilter] = useState("all")
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

  async function send(text?: string) {
    const content = (text ?? draft).trim()
    if (!content || !activeConv) return
    setSending(true)
    try {
      const msg = await api.post<ApiMessage>(`/api/conversations/${activeConv.id}/messages`, {
        content,
        sender: user?.name ?? "Technician",
        senderRole: "technician",
      })
      setMessages(prev => [...prev, msg])
      setDraft("")
    } catch { /* silent */ } finally {
      setSending(false)
    }
  }

  const totalUnread = conversations.reduce((n, c) => n + (c.unreadCount ?? 0), 0)

  const filters = [
    { key: "all", label: `ALL ${conversations.length}` },
    { key: "unread", label: `UNREAD ${totalUnread}` },
    { key: "internal", label: `INTERNAL ${conversations.filter(c => c.channel === "internal").length}` },
    { key: "sms", label: `SMS ${conversations.filter(c => c.channel === "sms").length}` },
  ]

  const filtered = activeFilter === "all" ? conversations
    : activeFilter === "unread" ? conversations.filter(c => c.unreadCount > 0)
    : conversations.filter(c => c.channel === activeFilter)

  // Thread view
  if (activeConv) {
    return (
      <div style={{ margin: 8, borderRadius: 28, overflow: "hidden", fontFamily: font, background: "rgba(255,255,255,0.55)", backdropFilter: "blur(8px) saturate(130%)", WebkitBackdropFilter: "blur(8px) saturate(130%)", border: "1px solid rgba(255,255,255,0.55)", boxShadow: "inset 0 1px 0 0 rgba(255,255,255,0.6), inset 1px 0 0 0 rgba(255,255,255,0.39), 0 20px 40px -20px rgba(0,0,0,0.25)", color: T.text, display: "flex", flexDirection: "column", height: "calc(100% - 16px)" }}>
        {/* Thread header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: `2px solid ${T.text}` }}>
          <button onClick={() => setActiveConv(null)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex" }}>
            <ChevronLeft style={{ width: 20, height: 20, color: T.text }} />
          </button>
          <div style={{ width: 36, height: 36, borderRadius: 12, background: T.accent, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
            {activeConv.subject.charAt(0).toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 14, letterSpacing: "-0.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{activeConv.subject}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 2 }}>
              <span style={{ width: 6, height: 6, borderRadius: 999, background: T.accent, display: "inline-block" }} />
              <span style={{ fontSize: 10, letterSpacing: "0.1em", color: T.n600 }}>{activeConv.channel.toUpperCase()} · {activeConv.participants.length} ONLINE</span>
            </div>
          </div>
          <Phone style={{ width: 18, height: 18, color: T.n600 }} />
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 14, padding: "18px 16px 8px" }}>
          {/* TODAY separator */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ flex: 1, height: 1, background: T.n300 }} />
            <span style={{ fontSize: 9, letterSpacing: "0.14em", color: T.n500 }}>TODAY</span>
            <div style={{ flex: 1, height: 1, background: T.n300 }} />
          </div>

          {messages.length === 0 && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "40px 0", color: T.n500 }}>
              <MessageSquare style={{ width: 28, height: 28, opacity: 0.4 }} />
              <span style={{ fontSize: 12 }}>No messages yet</span>
            </div>
          )}

          {messages.map((msg, i) => {
            const isMe = msg.senderRole === "technician"
            const showSender = !isMe && (i === 0 || messages[i - 1].senderRole !== msg.senderRole)
            return (
              <div key={msg.id} style={{ display: "flex", flexDirection: "column", gap: 3, alignItems: isMe ? "flex-end" : "flex-start" }}>
                {showSender && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, paddingLeft: 2 }}>
                    <div style={{ width: 18, height: 18, borderRadius: 6, background: T.text, color: T.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 700 }}>
                      {msg.sender.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase()}
                    </div>
                    <span style={{ fontSize: 10, color: T.n600 }}>{msg.sender}</span>
                  </div>
                )}
                <div style={{
                  maxWidth: "78%",
                  background: isMe ? T.accent : "#fff",
                  color: isMe ? "#fff" : T.text,
                  border: isMe ? "none" : `1px solid ${T.n300}`,
                  borderRadius: isMe ? "18px 18px 6px 18px" : (showSender ? "18px 18px 18px 6px" : "6px 18px 18px 18px"),
                  padding: "10px 13px",
                  fontSize: 13,
                  lineHeight: 1.45,
                }}>
                  {msg.content}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 4, paddingRight: isMe ? 4 : 0, paddingLeft: isMe ? 0 : 4 }}>
                  <span style={{ fontSize: 9, color: T.n500 }}>{timeLabel(msg.createdAt)}</span>
                </div>
              </div>
            )
          })}
          <div ref={bottomRef} />
        </div>

        {/* Quick replies */}
        <div style={{ display: "flex", gap: 6, padding: "8px 16px 0", flexWrap: "wrap" }}>
          {QUICK_REPLIES.map(reply => (
            <button
              key={reply}
              onClick={() => send(reply)}
              style={{ border: `1px solid ${T.text}`, borderRadius: 999, fontSize: 11, fontWeight: 600, padding: "5px 11px", background: "transparent", cursor: "pointer", fontFamily: font, color: T.text }}
            >
              {reply}
            </button>
          ))}
        </div>

        {/* Input */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 16px 16px" }}>
          <div style={{ width: 40, height: 40, border: `2px solid ${T.text}`, borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Paperclip style={{ width: 17, height: 17, color: T.text }} />
          </div>
          <div style={{ flex: 1, position: "relative" }}>
            <input
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); send() } }}
              placeholder="Message…"
              style={{ width: "100%", border: `2px solid ${T.text}`, borderRadius: 999, padding: "11px 16px", fontSize: 13, color: draft ? T.text : T.n500, background: "transparent", fontFamily: font, outline: "none", boxSizing: "border-box" }}
            />
          </div>
          <button
            onClick={() => send()}
            disabled={!draft.trim() || sending}
            style={{ width: 40, height: 40, borderRadius: 999, background: T.accent, border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, opacity: !draft.trim() || sending ? 0.5 : 1 }}
          >
            {sending ? <Loader2 style={{ width: 17, height: 17, color: "#fff" }} className="animate-spin" /> : <Send style={{ width: 17, height: 17, color: "#fff" }} />}
          </button>
        </div>
      </div>
    )
  }

  // Conversation list
  return (
    <div style={{ margin: 8, borderRadius: 28, overflow: "hidden", fontFamily: font, background: "rgba(255,255,255,0.55)", backdropFilter: "blur(8px) saturate(130%)", WebkitBackdropFilter: "blur(8px) saturate(130%)", border: "1px solid rgba(255,255,255,0.55)", boxShadow: "inset 0 1px 0 0 rgba(255,255,255,0.6), inset 1px 0 0 0 rgba(255,255,255,0.39), 0 20px 40px -20px rgba(0,0,0,0.25)", color: T.text, display: "flex", flexDirection: "column" }}>

      {/* Title */}
      <div style={{ padding: "20px 16px 16px", display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontSize: 10, letterSpacing: "0.16em", color: T.n600, textTransform: "uppercase" }}>Office &amp; dispatch</div>
          <div style={{ fontWeight: 800, fontSize: 32, lineHeight: 1.02, letterSpacing: "-0.03em", marginTop: 6 }}>Messages</div>
        </div>
        {totalUnread > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, background: T.accent, color: "#fff", borderRadius: 999, padding: "5px 11px", marginBottom: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em" }}>{totalUnread} UNREAD</span>
          </div>
        )}
      </div>

      {/* Search + filters */}
      <div style={{ borderTop: `2px solid ${T.text}`, padding: "14px 16px 12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, border: `2px solid ${T.text}`, borderRadius: 14, padding: "9px 12px" }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={T.n600} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <span style={{ fontSize: 13, color: T.n500 }}>Search conversations…</span>
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
          {filters.map(f => (
            <button
              key={f.key}
              onClick={() => setActiveFilter(f.key)}
              style={{
                background: activeFilter === f.key ? T.text : "transparent",
                color: activeFilter === f.key ? T.bg : T.n700,
                border: `1px solid ${activeFilter === f.key ? T.text : T.n400}`,
                borderRadius: 999,
                fontSize: 10,
                letterSpacing: "0.08em",
                padding: "4px 10px",
                cursor: "pointer",
                fontFamily: font,
                fontWeight: 600,
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Conversation list */}
      <div style={{ borderTop: `2px solid ${T.text}` }}>
        {loading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "40px 0", color: T.n500 }}>
            <Loader2 style={{ width: 20, height: 20 }} className="animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "48px 0", color: T.n500 }}>
            <MessageSquare style={{ width: 28, height: 28, opacity: 0.4 }} />
            <span style={{ fontSize: 12 }}>No messages yet</span>
          </div>
        ) : (
          filtered.map((conv, i) => {
            const isUnread = conv.unreadCount > 0
            const bg = isUnread && conv.channel === "internal" ? T.accentTint : "transparent"
            const avatarColor = avatarBg(conv)
            const initial = conv.subject.charAt(0).toUpperCase()

            return (
              <button
                key={conv.id}
                onClick={() => setActiveConv(conv)}
                style={{
                  display: "grid",
                  gridTemplateColumns: "38px 1fr",
                  gap: 12,
                  alignItems: "flex-start",
                  padding: "14px 16px",
                  borderTop: i === 0 ? "none" : `1px solid ${T.n300}`,
                  borderLeft: "none",
                  borderRight: "none",
                  borderBottom: "none",
                  background: bg,
                  width: "100%",
                  cursor: "pointer",
                  textAlign: "left",
                  fontFamily: font,
                }}
              >
                <div style={{ width: 38, height: 38, borderRadius: 12, background: avatarColor, color: avatarColor === T.n400 ? T.n700 : "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
                  {initial}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                    <div style={{ fontWeight: isUnread ? 800 : 600, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{conv.subject}</div>
                    <div style={{ fontSize: 10, color: T.n600, whiteSpace: "nowrap" }}>{timeLabel(conv.lastMessageAt)}</div>
                  </div>
                  <div style={{ fontSize: 12, color: T.n700, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {conv.lastMessageAt ? new Date(conv.lastMessageAt).toLocaleDateString() : ""}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 6 }}>
                    <span style={{ fontSize: 10, letterSpacing: "0.1em", color: T.n600 }}>
                      {conv.channel.toUpperCase()} · {conv.participants.length} PEOPLE
                    </span>
                    {isUnread && (
                      <span style={{ minWidth: 20, height: 20, borderRadius: 999, background: T.accent, color: "#fff", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 6px" }}>
                        {conv.unreadCount > 9 ? "9+" : conv.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
