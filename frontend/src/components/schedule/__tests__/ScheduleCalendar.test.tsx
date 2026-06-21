import { describe, it, expect } from "vitest"
import { jobsToEvents } from "../ScheduleCalendar"
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
    customer: { id: "cust-1", name: "Sarah Johnson", address: "123 Oak St" },
    technician: { id: "tech-1", name: "Mike Thompson" },
    ...overrides,
  }
}

describe("jobsToEvents", () => {
  it("maps job id to event id", () => {
    const events = jobsToEvents([makeJob({ id: "abc-123" })])
    expect(events[0].id).toBe("abc-123")
  })

  it("sets start from scheduledAt", () => {
    const events = jobsToEvents([makeJob({ scheduledAt: "2026-06-20T09:00:00.000Z" })])
    expect(events[0].start).toBe("2026-06-20T09:00:00.000Z")
  })

  it("sets end to scheduledAt + 2 hours", () => {
    const events = jobsToEvents([makeJob({ scheduledAt: "2026-06-20T09:00:00.000Z" })])
    expect(events[0].end).toBe("2026-06-20T11:00:00.000Z")
  })

  it("stores the full ApiJob in extendedProps.job", () => {
    const job = makeJob()
    const events = jobsToEvents([job])
    expect(events[0].extendedProps?.job).toEqual(job)
  })

  it("marks completed jobs as non-editable", () => {
    const events = jobsToEvents([makeJob({ status: "completed" })])
    expect(events[0].editable).toBe(false)
  })

  it("marks cancelled jobs as non-editable", () => {
    const events = jobsToEvents([makeJob({ status: "cancelled" })])
    expect(events[0].editable).toBe(false)
  })

  it("marks scheduled jobs as editable", () => {
    const events = jobsToEvents([makeJob({ status: "scheduled" })])
    expect(events[0].editable).toBe(true)
  })
})
