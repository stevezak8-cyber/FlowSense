import type { DragEvent } from "react"
import type { ApiJob } from "@/api/types"

function handleDragStart(e: DragEvent<HTMLDivElement>, jobId: string) {
  e.dataTransfer.setData("text/plain", jobId)
  e.dataTransfer.effectAllowed = "move"
}

interface UnassignedStripProps {
  jobs: ApiJob[]
}

export function UnassignedStrip({ jobs }: UnassignedStripProps) {
  const unassigned = jobs.filter((j) => !j.technicianId)

  if (unassigned.length === 0) return null

  return (
    <div
      style={{
        padding: "8px 16px",
        background: "var(--muted)",
        borderTop: "1px solid var(--border)",
      }}
    >
      <div
        style={{
          fontSize: "10px",
          fontWeight: 700,
          color: "var(--muted-foreground)",
          letterSpacing: "0.05em",
          marginBottom: "6px",
        }}
      >
        UNASSIGNED JOBS
      </div>
      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
        {unassigned.map((job) => (
          <div
            key={job.id}
            draggable
            data-job-id={job.id}
            data-urgent={job.priority === "urgent" ? "true" : undefined}
            onDragStart={(e) => handleDragStart(e, job.id)}
            style={{
              background: job.priority === "urgent" ? "var(--destructive)" : "var(--card)",
              border: job.priority === "urgent" ? "none" : "1px solid var(--border)",
              borderRadius: "4px",
              padding: "4px 8px",
              fontSize: "11px",
              fontWeight: 600,
              color: job.priority === "urgent" ? "var(--destructive-foreground)" : "var(--card-foreground)",
              cursor: "grab",
            }}
          >
            {job.priority === "urgent" && "⚡ "}
            {job.customer.name}
            {job.serviceType ? ` — ${job.serviceType}` : ""}
          </div>
        ))}
      </div>
    </div>
  )
}
