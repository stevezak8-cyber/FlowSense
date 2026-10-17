import { describe, it, expect } from "vitest"
import type { ApiJob } from "@/api/types"
import { deriveJobBoard } from "../job-board"

// Wed Oct 14 2026, 1pm local
const NOW = new Date(2026, 9, 14, 13, 0, 0)

let n = 0
function job(over: Partial<ApiJob> & { daysFromToday: number; hour?: number }): ApiJob {
  const { daysFromToday, hour = 9, ...rest } = over
  const at = new Date(2026, 9, 14 + daysFromToday, hour, 0, 0)
  return { id: `j${++n}`, status: "scheduled", priority: "normal", scheduledAt: at.toISOString(), ...rest } as ApiJob
}

describe("deriveJobBoard", () => {
  it("doesn't count a technician's whole history as today", () => {
    const history = Array.from({ length: 60 }, (_, i) => job({ daysFromToday: -(i + 1), status: "completed" }))
    const today = [
      job({ daysFromToday: 0, hour: 8, status: "completed" }),
      job({ daysFromToday: 0, hour: 10, status: "completed" }),
      job({ daysFromToday: 0, hour: 13, status: "in_progress" }),
      job({ daysFromToday: 0, hour: 15, status: "scheduled" }),
    ]
    const b = deriveJobBoard([...history, ...today], NOW)
    expect(b.totalToday).toBe(4)
    expect(b.completedToday).toHaveLength(2)
    expect(b.leftToday).toBe(2)
    expect(b.progressPct).toBe(50)
  })

  it("keeps upcoming days in the open list but out of today's numbers", () => {
    const b = deriveJobBoard([job({ daysFromToday: 0, hour: 15 }), job({ daysFromToday: 1 }), job({ daysFromToday: 3 })], NOW)
    expect(b.open).toHaveLength(3)
    expect(b.leftToday).toBe(1)
    expect(b.totalToday).toBe(1)
  })

  it("counts a job left open from an earlier day against today", () => {
    const b = deriveJobBoard([job({ daysFromToday: -1, status: "in_progress" })], NOW)
    expect(b.leftToday).toBe(1)
    expect(b.open).toHaveLength(1)
  })

  it("only lists open high and urgent jobs as priority", () => {
    const b = deriveJobBoard(
      [
        job({ daysFromToday: 0, priority: "urgent" }),
        job({ daysFromToday: 1, priority: "high" }),
        job({ daysFromToday: -2, priority: "high", status: "completed" }),
        job({ daysFromToday: 0, priority: "normal" }),
      ],
      NOW,
    )
    expect(b.priority).toHaveLength(2)
    expect(b.priority.every((j) => j.status !== "completed")).toBe(true)
  })

  it("shows cancellations from today onward, not old ones", () => {
    const b = deriveJobBoard([job({ daysFromToday: -5, status: "cancelled" }), job({ daysFromToday: 0, status: "cancelled" }), job({ daysFromToday: 2, status: "cancelled" })], NOW)
    expect(b.cancelled).toHaveLength(2)
  })

  it("reports 0% on an empty day instead of dividing by zero", () => {
    expect(deriveJobBoard([], NOW)).toMatchObject({ totalToday: 0, leftToday: 0, progressPct: 0 })
  })

  it("reports 100% when everything due today is finished", () => {
    const b = deriveJobBoard([job({ daysFromToday: 0, hour: 8, status: "completed" }), job({ daysFromToday: 0, hour: 9, status: "completed" })], NOW)
    expect(b.progressPct).toBe(100)
  })
})

