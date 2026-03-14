import { ApiMessagePanel } from "@/components/messages/api-message-panel"

export default function CustomerMessages() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Messages</h1>
        <p className="text-sm text-muted-foreground">
          Contact your service team
        </p>
      </div>
      <ApiMessagePanel viewerRole="customer" viewerName="Customer" />
    </div>
  )
}
