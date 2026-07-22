import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { UnassignedStrip } from "../UnassignedStrip"
import type { ApiJob } from "@/api/types"

function makeJob(id: string, overrides: Partial<ApiJob> = {}): ApiJob {
  return {
    id,
    organizationId: "org-1",
    customerId: "cust-1",
    technicianId: "tech-1",
    status: "pending",
    priority: "normal",
    scheduledAt: "2026-06-20T09:00:00.000Z",
    symptomSummary: null,
    equipmentId: null,
    equipmentType: "furnace",
    equipmentNotes: null,
    serviceType: "repair",
    preArrivalNotes: null,
    suggestedParts: [],
    suggestedTools: [],
    riskFlags: [],
    summary: null,
    actionsTaken: null,
    partsUsed: [],
    photos: [],
    completedAt: null,
    createdAt: "2026-06-20T00:00:00.000Z",
    updatedAt: "2026-06-20T00:00:00.000Z",
    customer: { id: "cust-1", name: "Sarah Johnson", address: "123 Oak St" },
    technician: { id: "tech-1", name: "Mike Thompson" },
    ...overrides,
  }
}

describe("UnassignedStrip", () => {
  it("shows only jobs without a technicianId", () => {
    const jobs = [
      makeJob("job-1", {
        technicianId: "tech-1",
        technician: { id: "tech-1", name: "Mike" },
        customer: { id: "c1", name: "Assigned Customer", address: "1 Main St" },
      }),
      makeJob("job-2", { technicianId: null, technician: null }),
      makeJob("job-3", { technicianId: null, technician: null, customer: { id: "c2", name: "Bob Martinez", address: "456 Elm" } }),
    ]
    render(<UnassignedStrip jobs={jobs} />)
    expect(screen.queryByText(/Assigned Customer/)).not.toBeInTheDocument()
    expect(screen.getByText(/Sarah Johnson/)).toBeInTheDocument()
    expect(screen.getByText(/Bob Martinez/)).toBeInTheDocument()
  })

  it("renders nothing when all jobs are assigned", () => {
    const jobs = [makeJob("job-1")]
    const { container } = render(<UnassignedStrip jobs={jobs} />)
    expect(container.textContent).not.toContain("Sarah Johnson")
  })

  it("highlights urgent unassigned jobs in red", () => {
    const jobs = [makeJob("job-1", { technicianId: null, technician: null, priority: "urgent" })]
    render(<UnassignedStrip jobs={jobs} />)
    const pill = screen.getByText(/Sarah Johnson/)
    expect(pill.closest("[data-urgent]")).toHaveAttribute("data-urgent", "true")
  })

  it("renders UNASSIGNED JOBS label when there are unassigned jobs", () => {
    const jobs = [makeJob("job-1", { technicianId: null, technician: null })]
    render(<UnassignedStrip jobs={jobs} />)
    expect(screen.getByText("UNASSIGNED JOBS")).toBeInTheDocument()
  })

  it("renders nothing when there are no unassigned jobs", () => {
    const jobs = [makeJob("job-1")]
    const { container } = render(<UnassignedStrip jobs={jobs} />)
    expect(container.firstChild).toBeNull()
  })

  it("sets data-job-id on each pill to the job id", () => {
    const jobs = [makeJob("job-99", { technicianId: null, technician: null })]
    render(<UnassignedStrip jobs={jobs} />)
    const pill = screen.getByText(/Sarah Johnson/).closest("[data-job-id]")
    expect(pill).toHaveAttribute("data-job-id", "job-99")
  })
})
