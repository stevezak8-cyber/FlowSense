import type { ApiJob } from "@/api/types"

const STATUS_COLORS: Record<string, string> = {
  scheduled: "#3b82f6",
  en_route: "#6366f1",
  in_progress: "#059669",
  completed: "#6b7280",
  cancelled: "#6b7280",
  pending: "#94a3b8",
}

function getBackgroundColor(job: ApiJob): string {
  if (job.priority === "urgent") return "#dc2626"
  return STATUS_COLORS[job.status] ?? "#94a3b8"
}

function formatStatus(status: string): string {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

interface CalendarEventCardProps {
  job: ApiJob
}

export function CalendarEventCard({ job }: CalendarEventCardProps) {
  const bg = getBackgroundColor(job)

  return (
    <div
      style={{
        backgroundColor: bg,
        borderLeft: job.priority === "urgent" ? "3px solid #7f1d1d" : undefined,
        borderRadius: "4px",
        padding: "3px 6px",
        color: "white",
        fontSize: "11px",
        height: "100%",
        overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "3px" }}>
        {job.priority === "urgent" && <span>⚡</span>}
        <span style={{ fontWeight: 700 }}>{job.customer.name}</span>
      </div>
      <div style={{ opacity: 0.85, fontSize: "10px", marginTop: "1px" }}>
        {job.customer.address}
      </div>
      {job.serviceType && (
        <div style={{ opacity: 0.85, fontSize: "10px" }}>{job.serviceType}</div>
      )}
      <div style={{ opacity: 0.8, fontSize: "10px", marginTop: "2px" }}>
        <span aria-hidden>👤 </span>
        <span>{job.technician?.name ?? "Unassigned"}</span>
      </div>
      <span
        style={{
          background: "rgba(255,255,255,0.25)",
          borderRadius: "3px",
          padding: "0 3px",
          fontSize: "9px",
          marginTop: "2px",
          display: "inline-block",
        }}
      >
        {formatStatus(job.status)}
      </span>
    </div>
  )
}
