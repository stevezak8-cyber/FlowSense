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
        background: "var(--bg-secondary, #f8fafc)",
        borderTop: "1px solid var(--border, #e2e8f0)",
      }}
    >
      <div
        style={{
          fontSize: "10px",
          fontWeight: 700,
          color: "var(--text-secondary, #64748b)",
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
              background: job.priority === "urgent" ? "#dc2626" : "var(--bg-primary, white)",
              border: job.priority === "urgent" ? "none" : "1px solid var(--border, #e2e8f0)",
              borderRadius: "4px",
              padding: "4px 8px",
              fontSize: "11px",
              fontWeight: 600,
              color: job.priority === "urgent" ? "white" : "var(--text-secondary, #64748b)",
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
