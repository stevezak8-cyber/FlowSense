import { ApiMessagePanel } from "@/components/messages/api-message-panel"

export default function TechMessagesPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Messages</h1>
        <p className="text-xs text-muted-foreground font-mono">Communication hub</p>
      </div>
      <ApiMessagePanel viewerRole="technician" viewerName="Technician" />
    </div>
  )
}
