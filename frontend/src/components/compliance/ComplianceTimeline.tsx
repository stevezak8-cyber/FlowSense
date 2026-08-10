import { useState, useEffect } from "react"
import { api } from "@/api/client"
import type { ComplianceLog } from "@/api/types"
import { Badge } from "@/components/ui/badge"
import { ShieldCheck } from "lucide-react"
import { typeLabel, typeBadgeVariant, summarizePayload, timeAgo } from "./compliance-utils"

interface Props {
  jobId: string
}

export function ComplianceTimeline({ jobId }: Props) {
  const [logs, setLogs] = useState<ComplianceLog[]>([])

  useEffect(() => {
    api.get<ComplianceLog[]>(`/api/compliance/job/${jobId}`)
      .then(setLogs)
      .catch(() => {})
  }, [jobId])

  if (logs.length === 0) return null

  return (
    <div className="mt-3 border-t pt-3">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
        <ShieldCheck className="h-3.5 w-3.5" />
        Compliance
      </div>
      <div className="space-y-2">
        {logs.map((log) => (
          <div key={log.id} className="flex items-start gap-3 text-xs">
            <span className="text-muted-foreground w-14 flex-shrink-0 pt-0.5">{timeAgo(log.createdAt)}</span>
            <Badge variant={typeBadgeVariant(log.type)} className="text-xs flex-shrink-0">{typeLabel(log.type)}</Badge>
            <span className="text-muted-foreground">{summarizePayload(log)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
