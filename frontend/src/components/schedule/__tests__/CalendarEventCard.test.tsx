import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { CalendarEventCard } from "../CalendarEventCard"
import type { ApiJob } from "@/api/types"

function makeJob(overrides: Partial<ApiJob> = {}): ApiJob {
  return {
    id: "job-1",
    organizationId: "org-1",
    customerId: "cust-1",
    technicianId: "tech-1",
    status: "scheduled",
    priority: "normal",
    scheduledAt: "2026-06-20T09:00:00.000Z",
    symptomSummary: null,
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
    customer: { id: "cust-1", name: "Sarah Johnson", address: "123 Oak St, Austin TX" },
    technician: { id: "tech-1", name: "Mike Thompson" },
    ...overrides,
  }
}

describe("CalendarEventCard", () => {
  it("renders customer name", () => {
    render(<CalendarEventCard job={makeJob()} />)
    expect(screen.getByText("Sarah Johnson")).toBeInTheDocument()
  })

  it("renders customer address", () => {
    render(<CalendarEventCard job={makeJob()} />)
    expect(screen.getByText("123 Oak St, Austin TX")).toBeInTheDocument()
  })

  it("renders service type", () => {
    render(<CalendarEventCard job={makeJob()} />)
    expect(screen.getByText(/repair/i)).toBeInTheDocument()
  })

  it("renders technician name", () => {
    render(<CalendarEventCard job={makeJob()} />)
    expect(screen.getByText("Mike Thompson")).toBeInTheDocument()
  })

  it("renders status badge", () => {
    render(<CalendarEventCard job={makeJob({ status: "en_route" })} />)
    expect(screen.getByText(/en.route/i)).toBeInTheDocument()
  })

  it("shows urgent indicator for urgent priority", () => {
    render(<CalendarEventCard job={makeJob({ priority: "urgent" })} />)
    expect(screen.getByText("⚡")).toBeInTheDocument()
  })

  it("applies blue background for scheduled status", () => {
    const { container } = render(<CalendarEventCard job={makeJob({ status: "scheduled" })} />)
    const card = container.firstChild as HTMLElement
    expect(card.style.backgroundColor).toBe("rgb(59, 130, 246)")
  })

  it("applies red background for urgent priority regardless of status", () => {
    const { container } = render(
      <CalendarEventCard job={makeJob({ status: "scheduled", priority: "urgent" })} />
    )
    const card = container.firstChild as HTMLElement
    expect(card.style.backgroundColor).toBe("rgb(220, 38, 38)")
  })

  it("shows Unassigned when technician is null", () => {
    render(<CalendarEventCard job={makeJob({ technicianId: null, technician: null })} />)
    expect(screen.getByText("Unassigned")).toBeInTheDocument()
  })
})
