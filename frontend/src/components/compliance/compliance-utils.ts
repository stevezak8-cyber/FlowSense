import type { ComplianceLog } from "@/api/types"

export function typeLabel(type: ComplianceLog["type"]) {
  switch (type) {
    case "epa608_prompt": return "EPA 608"
    case "safety_ack": return "Safety"
    case "code_reminder": return "Code"
    default: return type
  }
}

export function typeBadgeVariant(type: ComplianceLog["type"]): "default" | "outline" | "secondary" {
  switch (type) {
    case "epa608_prompt": return "default"
    case "safety_ack": return "secondary"
    default: return "outline"
  }
}

export function summarizePayload(log: ComplianceLog) {
  const p = log.payload as Record<string, unknown>
  switch (log.type) {
    case "epa608_prompt":
      return [
        p.refrigerantType,
        p.lbsRecovered != null ? `${p.lbsRecovered} lbs recovered` : null,
        p.lbsCharged != null ? `${p.lbsCharged} lbs charged` : null,
        p.certLevel,
      ].filter(Boolean).join(" · ")
    case "safety_ack":
      return Array.isArray(p.items) ? (p.items as string[]).join(", ") : ""
    case "code_reminder":
      return Array.isArray(p.codes) ? (p.codes as string[]).join(", ") : ""
    default:
      return ""
  }
}

export function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.round(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.round(hrs / 24)}d ago`
}
