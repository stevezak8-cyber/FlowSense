"use client"

import { ApiMessagePanel } from "@/components/messages/api-message-panel"

export default function OfficeMessagesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Messages</h1>
        <p className="mt-1 text-sm text-muted-foreground">Communication across all channels</p>
      </div>
      <ApiMessagePanel viewerRole="dispatch" viewerName="Dispatch" />
    </div>
  )
}
