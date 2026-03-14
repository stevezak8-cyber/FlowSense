"use client"

import { useState, useEffect, useRef } from "react"
import { api } from "@/api/client"
import type { ApiConversation, ApiMessage } from "@/api/types"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import {
  Search,
  ArrowLeft,
  Send,
  Wrench,
  User,
  Radio,
  Monitor,
  Clock,
  Plus,
  Loader2,
  MessageSquare,
} from "lucide-react"

const roleConfig: Record<string, { icon: typeof Wrench; color: string; bg: string }> = {
  technician: { icon: Wrench, color: "text-primary", bg: "bg-primary/15" },
  customer: { icon: User, color: "text-accent", bg: "bg-accent/15" },
  dispatch: { icon: Radio, color: "text-success", bg: "bg-success/15" },
  system: { icon: Monitor, color: "text-muted-foreground", bg: "bg-muted" },
}

const channelColors: Record<string, string> = {
  internal: "bg-primary/15 text-primary border-primary/30",
  sms: "bg-accent/15 text-accent border-accent/30",
  email: "bg-chart-5/15 text-chart-5 border-chart-5/30",
  phone: "bg-success/15 text-success border-success/30",
}

function formatTime(ts: string) {
  return new Date(ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
}

function formatDate(ts: string) {
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

interface ApiMessagePanelProps {
  viewerRole?: "dispatch" | "technician" | "customer"
  viewerName?: string
}

export function ApiMessagePanel({ viewerRole = "dispatch", viewerName = "Dispatch" }: ApiMessagePanelProps) {
  const [conversations, setConversations] = useState<ApiConversation[]>([])
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null)
  const [selectedConversation, setSelectedConversation] = useState<ApiConversation | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [channelFilter, setChannelFilter] = useState("all")
  const [loading, setLoading] = useState(true)
  const [sendingMessage, setSendingMessage] = useState(false)
  const [newMessageText, setNewMessageText] = useState("")
  const [newDialogOpen, setNewDialogOpen] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Load conversations
  useEffect(() => {
    api.get<ApiConversation[]>("/api/conversations")
      .then(setConversations)
      .catch((e) => console.error("Failed to load conversations:", e))
      .finally(() => setLoading(false))
  }, [])

  // Load selected conversation with full messages
  useEffect(() => {
    if (!selectedConvId) { setSelectedConversation(null); return }
    api.get<ApiConversation>(`/api/conversations/${selectedConvId}`)
      .then((conv) => {
        setSelectedConversation(conv)
        // Update the list to reflect read status
        setConversations((prev) => prev.map((c) => c.id === conv.id ? { ...c, unreadCount: 0 } : c))
      })
      .catch((e) => console.error("Failed to load conversation:", e))
  }, [selectedConvId])

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [selectedConversation?.messages])

  const filteredConversations = conversations.filter((c) => {
    const matchesChannel = channelFilter === "all" || c.channel === channelFilter
    const matchesSearch = searchQuery === "" ||
      c.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.participants.some((p) => p.toLowerCase().includes(searchQuery.toLowerCase()))
    return matchesChannel && matchesSearch
  })

  async function handleSendMessage() {
    if (!selectedConvId || !newMessageText.trim()) return
    setSendingMessage(true)
    try {
      const msg = await api.post<ApiMessage>(`/api/conversations/${selectedConvId}/messages`, {
        sender: viewerName,
        senderRole: viewerRole,
        content: newMessageText.trim(),
      })
      setSelectedConversation((prev) => prev ? { ...prev, messages: [...prev.messages, msg] } : prev)
      setConversations((prev) => prev.map((c) =>
        c.id === selectedConvId
          ? { ...c, lastMessageAt: msg.createdAt, messages: [msg] }
          : c
      ))
      setNewMessageText("")
    } catch (e) {
      console.error("Failed to send message:", e)
    } finally {
      setSendingMessage(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Loading messages...</span>
      </div>
    )
  }

  return (
    <div className="flex h-[600px] overflow-hidden rounded-lg border border-border bg-card">
      {/* Conversation List */}
      <div className={cn("flex w-full flex-col border-r border-border sm:w-80", selectedConvId && "hidden sm:flex")}>
        {/* Search + New */}
        <div className="border-b border-border p-3 space-y-2">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 bg-secondary pl-8 text-xs border-border placeholder:text-muted-foreground"
              />
            </div>
            <Button
              size="sm"
              className="h-8 w-8 bg-primary p-0 text-primary-foreground hover:bg-primary/90"
              onClick={() => setNewDialogOpen(true)}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
          {/* Channel filter */}
          <div className="flex gap-1 overflow-x-auto">
            {["all", "internal", "sms", "email", "phone"].map((ch) => (
              <button
                key={ch}
                onClick={() => setChannelFilter(ch)}
                className={cn(
                  "whitespace-nowrap rounded-md px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider transition-colors",
                  channelFilter === ch
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                )}
              >
                {ch}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {filteredConversations.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <MessageSquare className="h-6 w-6 text-muted-foreground/50" />
              <p className="mt-2 text-xs text-muted-foreground">No conversations</p>
            </div>
          )}
          {filteredConversations.map((conv) => {
            const lastMsg = conv.messages[0]
            const isSelected = selectedConvId === conv.id
            return (
              <div
                key={conv.id}
                onClick={() => setSelectedConvId(conv.id)}
                className={cn(
                  "cursor-pointer border-b border-border px-4 py-3 transition-colors",
                  isSelected ? "bg-secondary/50" : "hover:bg-secondary/30"
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-card-foreground">{conv.subject}</span>
                      {conv.unreadCount > 0 && (
                        <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground">
                          {conv.unreadCount}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {lastMsg ? `${lastMsg.sender}: ${lastMsg.content}` : "No messages"}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="text-[10px] text-muted-foreground">{formatDate(conv.lastMessageAt)}</span>
                    <Badge variant="outline" className={cn("rounded-sm px-1.5 py-0 text-[9px] font-mono uppercase", channelColors[conv.channel])}>
                      {conv.channel}
                    </Badge>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Message Thread */}
      <div className={cn("flex flex-1 flex-col", !selectedConvId && "hidden sm:flex")}>
        {selectedConversation ? (
          <>
            {/* Thread header */}
            <div className="flex items-center gap-3 border-b border-border px-4 py-3">
              <button
                onClick={() => setSelectedConvId(null)}
                className="rounded-md p-1 text-muted-foreground hover:bg-secondary sm:hidden"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-card-foreground">{selectedConversation.subject}</div>
                <div className="text-[10px] text-muted-foreground font-mono">
                  {selectedConversation.participants.join(", ")} · {selectedConversation.channel}
                </div>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {selectedConversation.messages.map((msg) => {
                const config = roleConfig[msg.senderRole] || roleConfig.dispatch
                const RoleIcon = config.icon
                const isOwnMessage = msg.senderRole === viewerRole
                return (
                  <div key={msg.id} className={cn("flex gap-3", isOwnMessage && "flex-row-reverse")}>
                    <Avatar className="h-8 w-8 shrink-0 border border-border">
                      <AvatarFallback className={cn("text-[10px]", config.bg, config.color)}>
                        <RoleIcon className="h-3.5 w-3.5" />
                      </AvatarFallback>
                    </Avatar>
                    <div className={cn("max-w-[75%]", isOwnMessage && "text-right")}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={cn("text-xs font-medium", config.color)}>{msg.sender}</span>
                        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <Clock className="h-2.5 w-2.5" />
                          {formatTime(msg.createdAt)}
                        </span>
                      </div>
                      <div className={cn(
                        "rounded-lg px-3 py-2 text-sm leading-relaxed",
                        isOwnMessage ? "bg-primary/15 text-card-foreground" : "bg-secondary text-card-foreground"
                      )}>
                        {msg.content}
                      </div>
                    </div>
                  </div>
                )
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Compose */}
            <div className="border-t border-border p-3">
              <div className="flex items-end gap-2">
                <Textarea
                  placeholder="Type a message..."
                  value={newMessageText}
                  onChange={(e) => setNewMessageText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendMessage() } }}
                  className="min-h-[40px] max-h-[100px] flex-1 resize-none bg-secondary border-border text-sm text-foreground placeholder:text-muted-foreground"
                  rows={1}
                />
                <Button
                  size="sm"
                  onClick={handleSendMessage}
                  disabled={sendingMessage || !newMessageText.trim()}
                  className="h-10 w-10 bg-primary p-0 text-primary-foreground hover:bg-primary/90"
                >
                  {sendingMessage ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <MessageSquare className="h-10 w-10 text-muted-foreground/30" />
            <p className="mt-3 text-sm text-muted-foreground">Select a conversation</p>
            <p className="mt-1 text-xs text-muted-foreground">or start a new one</p>
          </div>
        )}
      </div>

      {/* New Conversation Dialog */}
      <NewConversationDialog
        open={newDialogOpen}
        onOpenChange={setNewDialogOpen}
        viewerRole={viewerRole}
        viewerName={viewerName}
        onCreated={(conv) => {
          setConversations((prev) => [conv, ...prev])
          setSelectedConvId(conv.id)
          setNewDialogOpen(false)
        }}
      />
    </div>
  )
}

function NewConversationDialog({
  open,
  onOpenChange,
  viewerRole,
  viewerName,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  viewerRole: string
  viewerName: string
  onCreated: (conv: ApiConversation) => void
}) {
  const [subject, setSubject] = useState("")
  const [channel, setChannel] = useState("internal")
  const [participants, setParticipants] = useState("")
  const [message, setMessage] = useState("")
  const [submitting, setSubmitting] = useState(false)

  function reset() {
    setSubject(""); setChannel("internal"); setParticipants(""); setMessage("")
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!subject.trim() || !message.trim()) return
    setSubmitting(true)
    try {
      const conv = await api.post<ApiConversation>("/api/conversations", {
        subject: subject.trim(),
        channel,
        participants: participants.split(",").map((p) => p.trim()).filter(Boolean),
        message: message.trim(),
        sender: viewerName,
        senderRole: viewerRole,
      })
      reset()
      onCreated(conv)
    } catch (e) {
      console.error("Failed to create conversation:", e)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v) }}>
      <DialogContent className="bg-card border-border text-card-foreground sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-foreground">New Conversation</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Subject *</label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Conversation subject..." className="h-9 bg-secondary border-border text-foreground text-xs" required />
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Channel</label>
            <Select value={channel} onValueChange={setChannel}>
              <SelectTrigger className="h-9 bg-secondary border-border text-foreground text-xs"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-card border-border">
                <SelectItem value="internal" className="text-xs text-foreground">Internal</SelectItem>
                <SelectItem value="sms" className="text-xs text-foreground">SMS</SelectItem>
                <SelectItem value="email" className="text-xs text-foreground">Email</SelectItem>
                <SelectItem value="phone" className="text-xs text-foreground">Phone</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Participants</label>
            <Input value={participants} onChange={(e) => setParticipants(e.target.value)} placeholder="Names, comma-separated..." className="h-9 bg-secondary border-border text-foreground text-xs" />
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Message *</label>
            <Textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Write your message..." className="min-h-[80px] bg-secondary border-border text-foreground text-xs resize-none" required />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { reset(); onOpenChange(false) }} className="border-border text-foreground hover:bg-secondary">Cancel</Button>
            <Button type="submit" disabled={submitting || !subject.trim() || !message.trim()} className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90">
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Send
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
