"use client"

import { useState } from "react"
import {
  conversations as initialConversations,
  technicians,
  customers,
  type Conversation,
  type ConversationChannel,
} from "@/lib/data"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import {
  Search,
  ArrowLeft,
  Send,
  AlertTriangle,
  Wrench,
  User,
  Radio,
  Monitor,
  Clock,
  ChevronRight,
  Plus,
  Building2,
  ArrowLeftRight,
} from "lucide-react"

const roleConfig: Record<
  string,
  { icon: typeof Wrench; color: string; bg: string }
> = {
  technician: {
    icon: Wrench,
    color: "text-primary",
    bg: "bg-primary/15",
  },
  customer: {
    icon: User,
    color: "text-accent",
    bg: "bg-accent/15",
  },
  dispatch: {
    icon: Radio,
    color: "text-success",
    bg: "bg-success/15",
  },
  system: {
    icon: Monitor,
    color: "text-muted-foreground",
    bg: "bg-muted",
  },
}

type ChannelFilter = "all" | ConversationChannel

const channelTabs: { value: ChannelFilter; label: string; icon: typeof Wrench }[] = [
  { value: "all", label: "All", icon: Radio },
  { value: "office-tech", label: "Office / Techs", icon: Wrench },
  { value: "office-customer", label: "Office / Customers", icon: Building2 },
  { value: "tech-customer", label: "Techs / Customers", icon: ArrowLeftRight },
  { value: "system", label: "System", icon: Monitor },
]

function formatTime(timestamp: string) {
  const date = new Date(timestamp)
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
}

function formatDate(timestamp: string) {
  const date = new Date(timestamp)
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })
}

function getChannelBadge(channel: ConversationChannel) {
  switch (channel) {
    case "office-tech":
      return { label: "OFFICE / TECH", className: "text-primary border-primary/30 bg-primary/10" }
    case "office-customer":
      return { label: "OFFICE / CUST", className: "text-accent border-accent/30 bg-accent/10" }
    case "tech-customer":
      return { label: "TECH / CUST", className: "text-success border-success/30 bg-success/10" }
    case "system":
      return { label: "SYSTEM", className: "text-muted-foreground border-border bg-muted" }
  }
}

function NewMessageDialog({
  onSend,
}: {
  onSend: (to: string, toRole: string, channel: ConversationChannel, subject: string, body: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [channel, setChannel] = useState<ConversationChannel>("office-tech")
  const [recipient, setRecipient] = useState("")
  const [subject, setSubject] = useState("")
  const [body, setBody] = useState("")

  const recipientOptions =
    channel === "office-tech" || channel === "tech-customer"
      ? technicians.map((t) => ({ value: t.name, label: t.name, role: "technician" }))
      : customers.map((c) => ({ value: c.name, label: c.name, role: "customer" }))

  function handleSend() {
    if (!recipient || !subject || !body) return
    const option = recipientOptions.find((o) => o.value === recipient)
    onSend(recipient, option?.role || "customer", channel, subject, body)
    setRecipient("")
    setSubject("")
    setBody("")
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="h-7 gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 text-xs">
          <Plus className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">New</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-card border-border text-card-foreground sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-foreground">New Message</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
              Channel
            </label>
            <Select value={channel} onValueChange={(v) => { setChannel(v as ConversationChannel); setRecipient("") }}>
              <SelectTrigger className="h-9 bg-secondary border-border text-xs text-foreground">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-card border-border">
                <SelectItem value="office-tech" className="text-xs text-foreground">Office to Technician</SelectItem>
                <SelectItem value="office-customer" className="text-xs text-foreground">Office to Customer</SelectItem>
                <SelectItem value="tech-customer" className="text-xs text-foreground">Technician to Customer</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
              Recipient
            </label>
            <Select value={recipient} onValueChange={setRecipient}>
              <SelectTrigger className="h-9 bg-secondary border-border text-xs text-foreground">
                <SelectValue placeholder="Select recipient..." />
              </SelectTrigger>
              <SelectContent className="bg-card border-border">
                {recipientOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value} className="text-xs text-foreground">
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
              Subject
            </label>
            <Input
              placeholder="Message subject..."
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="h-9 bg-secondary border-border text-xs text-foreground placeholder:text-muted-foreground"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
              Message
            </label>
            <Textarea
              placeholder="Type your message..."
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="min-h-[100px] bg-secondary border-border text-xs text-foreground placeholder:text-muted-foreground resize-none"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)} className="text-xs border-border text-foreground hover:bg-secondary">
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSend}
              disabled={!recipient || !subject || !body}
              className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 text-xs"
            >
              <Send className="h-3.5 w-3.5" />
              Send
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ConversationList({
  conversations,
  selectedId,
  onSelect,
  searchQuery,
  onSearchChange,
  channelFilter,
  onChannelChange,
}: {
  conversations: Conversation[]
  selectedId: string | null
  onSelect: (id: string) => void
  searchQuery: string
  onSearchChange: (q: string) => void
  channelFilter: ChannelFilter
  onChannelChange: (c: ChannelFilter) => void
}) {
  const filtered = conversations.filter((c) => {
    const matchesChannel = channelFilter === "all" || c.channel === channelFilter
    const matchesSearch =
      searchQuery === "" ||
      c.participants.some((p) =>
        p.toLowerCase().includes(searchQuery.toLowerCase())
      ) ||
      c.lastMessage.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesChannel && matchesSearch
  })

  return (
    <div className="flex h-full flex-col">
      {/* Channel Tabs */}
      <div className="border-b border-border px-2 py-2">
        <div className="flex gap-1 overflow-x-auto">
          {channelTabs.map((tab) => {
            const Icon = tab.icon
            const count =
              tab.value === "all"
                ? conversations.reduce((s, c) => s + c.unreadCount, 0)
                : conversations
                    .filter((c) => c.channel === tab.value)
                    .reduce((s, c) => s + c.unreadCount, 0)
            return (
              <button
                key={tab.value}
                onClick={() => onChannelChange(tab.value)}
                className={cn(
                  "flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1.5 text-[10px] font-medium transition-colors",
                  channelFilter === tab.value
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                )}
              >
                <Icon className="h-3 w-3" />
                <span>{tab.label}</span>
                {count > 0 && (
                  <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground">
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Search */}
      <div className="border-b border-border p-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="h-8 bg-secondary pl-9 text-xs border-border text-foreground placeholder:text-muted-foreground"
          />
        </div>
      </div>

      {/* Conversation Items */}
      <div className="flex-1 overflow-y-auto">
        {filtered.map((conv) => {
          const lastMsg = conv.messages[conv.messages.length - 1]
          const otherParticipant = conv.participants.find(
            (p) => p !== "Dispatch" && p !== "System"
          ) || conv.participants[0]
          const role = lastMsg?.fromRole || "dispatch"
          const config = roleConfig[role]
          const isSelected = selectedId === conv.id
          const hasUrgent = conv.messages.some((m) => m.priority === "urgent")
          const channelBadge = getChannelBadge(conv.channel)

          return (
            <button
              key={conv.id}
              onClick={() => onSelect(conv.id)}
              className={cn(
                "flex w-full items-start gap-3 border-b border-border px-4 py-3.5 text-left transition-colors",
                isSelected
                  ? "bg-secondary/80"
                  : "hover:bg-secondary/40"
              )}
            >
              <div className="relative flex-shrink-0">
                <Avatar className="h-9 w-9 border border-border">
                  <AvatarFallback
                    className={cn(
                      "text-[10px] font-mono",
                      config.bg,
                      config.color
                    )}
                  >
                    {lastMsg?.avatar || "??"}
                  </AvatarFallback>
                </Avatar>
                {conv.unreadCount > 0 && (
                  <div className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
                    {conv.unreadCount}
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={cn(
                      "text-xs font-semibold truncate",
                      conv.unreadCount > 0
                        ? "text-foreground"
                        : "text-foreground/80"
                    )}
                  >
                    {otherParticipant}
                  </span>
                  <span className="flex-shrink-0 font-mono text-[10px] text-muted-foreground">
                    {formatTime(conv.lastTimestamp)}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center gap-1.5">
                  {hasUrgent && (
                    <AlertTriangle className="h-3 w-3 flex-shrink-0 text-destructive" />
                  )}
                  <p
                    className={cn(
                      "truncate text-[11px]",
                      conv.unreadCount > 0
                        ? "font-medium text-foreground/70"
                        : "text-muted-foreground"
                    )}
                  >
                    {conv.lastMessage}
                  </p>
                </div>
                <div className="mt-1.5 flex items-center gap-1.5">
                  <Badge
                    variant="outline"
                    className={cn("rounded-sm px-1.5 py-0 text-[8px] font-mono uppercase tracking-wider border", channelBadge.className)}
                  >
                    {channelBadge.label}
                  </Badge>
                  {lastMsg?.jobRef && (
                    <Badge
                      variant="outline"
                      className="rounded-sm border-border bg-secondary px-1.5 py-0 text-[9px] font-mono text-muted-foreground"
                    >
                      {lastMsg.jobRef}
                    </Badge>
                  )}
                </div>
              </div>
              <ChevronRight className="mt-1 h-3.5 w-3.5 flex-shrink-0 text-muted-foreground/50" />
            </button>
          )
        })}

        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Search className="mb-2 h-5 w-5 text-muted-foreground/50" />
            <p className="text-xs text-muted-foreground">
              No conversations found
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

function MessageThread({
  conversation,
  onBack,
  onSendReply,
}: {
  conversation: Conversation
  onBack: () => void
  onSendReply: (convId: string, text: string) => void
}) {
  const [newMessage, setNewMessage] = useState("")
  const otherParticipant =
    conversation.participants.find((p) => p !== "Dispatch" && p !== "System") ||
    conversation.participants[0]
  const channelBadge = getChannelBadge(conversation.channel)

  function handleSend() {
    if (!newMessage.trim()) return
    onSendReply(conversation.id, newMessage.trim())
    setNewMessage("")
  }

  return (
    <div className="flex h-full flex-col">
      {/* Thread Header */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={onBack}
          className="h-7 w-7 text-muted-foreground hover:text-foreground lg:hidden"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="sr-only">Back to conversations</span>
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground truncate">
              {otherParticipant}
            </span>
            <Badge
              variant="outline"
              className={cn("rounded-sm px-1.5 py-0 text-[8px] font-mono uppercase tracking-wider border", channelBadge.className)}
            >
              {channelBadge.label}
            </Badge>
          </div>
          <div className="flex items-center gap-2 text-[10px] font-mono text-muted-foreground">
            <span className="uppercase tracking-wider">
              {conversation.id}
            </span>
            {conversation.messages[0]?.jobRef && (
              <>
                <span className="text-border">|</span>
                <span className="text-primary">
                  {conversation.messages[0].jobRef}
                </span>
              </>
            )}
            <span className="text-border">|</span>
            <span>
              {conversation.participants.join(" & ")}
            </span>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {conversation.messages.map((msg) => {
          const config = roleConfig[msg.fromRole]
          const RoleIcon = config.icon
          const isDispatch = msg.fromRole === "dispatch"

          return (
            <div
              key={msg.id}
              className={cn(
                "flex gap-3",
                isDispatch ? "flex-row-reverse" : ""
              )}
            >
              <Avatar className="h-8 w-8 flex-shrink-0 border border-border">
                <AvatarFallback
                  className={cn(
                    "text-[10px] font-mono",
                    config.bg,
                    config.color
                  )}
                >
                  {msg.avatar}
                </AvatarFallback>
              </Avatar>
              <div
                className={cn(
                  "max-w-[75%] space-y-1",
                  isDispatch ? "items-end" : ""
                )}
              >
                <div
                  className={cn(
                    "flex items-center gap-2",
                    isDispatch ? "flex-row-reverse" : ""
                  )}
                >
                  <span className="text-[11px] font-semibold text-foreground">
                    {msg.from}
                  </span>
                  <div className="flex items-center gap-1">
                    <RoleIcon className={cn("h-3 w-3", config.color)} />
                    {msg.priority === "urgent" && (
                      <AlertTriangle className="h-3 w-3 text-destructive" />
                    )}
                  </div>
                  <span className="font-mono text-[9px] text-muted-foreground">
                    {formatTime(msg.timestamp)}
                  </span>
                </div>
                <div
                  className={cn(
                    "rounded-lg px-3.5 py-2.5 text-xs leading-relaxed",
                    isDispatch
                      ? "bg-primary/15 text-foreground border border-primary/20"
                      : "bg-secondary text-foreground border border-border",
                    msg.priority === "urgent" &&
                      "border-destructive/30 bg-destructive/10"
                  )}
                >
                  {msg.jobRef && (
                    <div className="mb-1.5 flex items-center gap-1.5">
                      <Badge
                        variant="outline"
                        className="rounded-sm border-border bg-background/50 px-1.5 py-0 text-[9px] font-mono text-muted-foreground"
                      >
                        {msg.jobRef}
                      </Badge>
                    </div>
                  )}
                  <p className="font-medium text-[11px] text-foreground/90 mb-1">
                    {msg.subject}
                  </p>
                  <p className="text-foreground/70">{msg.body}</p>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Compose */}
      {conversation.channel !== "system" && (
        <div className="border-t border-border p-3">
          <div className="flex items-center gap-2">
            <Input
              placeholder={`Reply to ${otherParticipant}...`}
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
              className="h-9 flex-1 bg-secondary text-xs border-border text-foreground placeholder:text-muted-foreground"
            />
            <Button
              size="icon"
              className="h-9 w-9 bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={handleSend}
              disabled={!newMessage.trim()}
            >
              <Send className="h-4 w-4" />
              <span className="sr-only">Send message</span>
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export function MessagePanel({
  conversations: passedConversations,
  viewerRole: _viewerRole = "dispatch",
}: {
  conversations?: Conversation[]
  viewerRole?: "dispatch" | "technician" | "customer"
}) {
  const [conversationData, setConversationData] = useState<Conversation[]>(passedConversations ?? initialConversations)
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>("all")

  const selectedConversation = conversationData.find(
    (c) => c.id === selectedConvId
  )

  const totalUnread = conversationData.reduce(
    (sum, c) => sum + c.unreadCount,
    0
  )

  function handleNewConversation(
    to: string,
    _toRole: string,
    channel: ConversationChannel,
    subject: string,
    body: string
  ) {
    const newConv: Conversation = {
      id: `CONV-${String(conversationData.length + 1).padStart(3, "0")}`,
      channel,
      participants: ["Dispatch", to],
      lastMessage: body.slice(0, 80),
      lastTimestamp: new Date().toISOString(),
      unreadCount: 0,
      messages: [
        {
          id: `MSG-${Date.now()}`,
          from: "Dispatch",
          fromRole: "dispatch",
          avatar: "DP",
          subject,
          preview: body.slice(0, 80),
          body,
          timestamp: new Date().toISOString(),
          read: true,
          priority: "normal",
        },
      ],
    }
    setConversationData((prev) => [newConv, ...prev])
    setSelectedConvId(newConv.id)
    setChannelFilter(channel)
  }

  function handleSendReply(convId: string, text: string) {
    setConversationData((prev) =>
      prev.map((c) => {
        if (c.id !== convId) return c
        const newMsg = {
          id: `MSG-${Date.now()}`,
          from: "Dispatch",
          fromRole: "dispatch" as const,
          avatar: "DP",
          subject: `Re: ${c.messages[0]?.subject || "Message"}`,
          preview: text.slice(0, 80),
          body: text,
          timestamp: new Date().toISOString(),
          read: true,
          priority: "normal" as const,
        }
        return {
          ...c,
          lastMessage: text.slice(0, 80),
          lastTimestamp: newMsg.timestamp,
          messages: [...c.messages, newMsg],
        }
      })
    )
  }

  return (
    <div className="flex h-[calc(100vh-10rem)] overflow-hidden rounded-lg border border-border bg-card">
      {/* Left Panel - Conversation List */}
      <div
        className={cn(
          "w-full flex-shrink-0 border-r border-border lg:w-[360px]",
          selectedConvId ? "hidden lg:flex lg:flex-col" : "flex flex-col"
        )}
      >
        {/* List Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-card-foreground">
              Inbox
            </span>
            {totalUnread > 0 && (
              <Badge className="rounded-full bg-primary px-1.5 py-0 text-[10px] font-mono text-primary-foreground border-0">
                {totalUnread}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span>{formatDate(new Date().toISOString())}</span>
            </div>
            <NewMessageDialog onSend={handleNewConversation} />
          </div>
        </div>
        <ConversationList
          conversations={conversationData}
          selectedId={selectedConvId}
          onSelect={setSelectedConvId}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          channelFilter={channelFilter}
          onChannelChange={setChannelFilter}
        />
      </div>

      {/* Right Panel - Thread View */}
      <div
        className={cn(
          "flex-1",
          selectedConvId ? "flex flex-col" : "hidden lg:flex lg:flex-col"
        )}
      >
        {selectedConversation ? (
          <MessageThread
            conversation={selectedConversation}
            onBack={() => setSelectedConvId(null)}
            onSendReply={handleSendReply}
          />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-secondary">
              <Radio className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground/70">
              Select a conversation
            </p>
            <p className="mt-1 max-w-xs text-xs text-muted-foreground">
              Choose a thread from the inbox or start a new message to a technician or customer
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
