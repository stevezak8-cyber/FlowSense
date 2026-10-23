import { describe, it, expect } from "vitest"
import { timeAgo, isActiveToday, weekSummary, byRecentActivity } from "../activity"

const NOW = new Date("2026-10-23T12:00:00Z").getTime()
const ago = (ms: number) => new Date(NOW - ms).toISOString()
const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR

describe("timeAgo", () => {
  it("shows a dash for never", () => {
    expect(timeAgo(null, NOW)).toBe("—")
    expect(timeAgo("not a date", NOW)).toBe("—")
  })
  it("steps through just now, minutes, hours, days", () => {
    expect(timeAgo(ago(20_000), NOW)).toBe("just now")
    expect(timeAgo(ago(12 * MIN), NOW)).toBe("12m ago")
    expect(timeAgo(ago(5 * HOUR + 30 * MIN), NOW)).toBe("5h ago")
    expect(timeAgo(ago(3 * DAY), NOW)).toBe("3d ago")
  })
  it("switches to a date after two weeks", () => {
    expect(timeAgo(ago(20 * DAY), NOW)).not.toMatch(/ago/)
  })
})

describe("isActiveToday", () => {
  it("is true within 24h and false after, or when never seen", () => {
    expect(isActiveToday(ago(23 * HOUR), NOW)).toBe(true)
    expect(isActiveToday(ago(25 * HOUR), NOW)).toBe(false)
    expect(isActiveToday(null, NOW)).toBe(false)
  })
})

describe("weekSummary", () => {
  it("is null when nothing real happened", () => {
    expect(weekSummary({ customers7d: 0, jobs7d: 0 })).toBeNull()
  })
  it("pluralises and joins", () => {
    expect(weekSummary({ customers7d: 1, jobs7d: 0 })).toBe("1 customer")
    expect(weekSummary({ customers7d: 2, jobs7d: 1 })).toBe("2 customers · 1 job")
    expect(weekSummary({ customers7d: 0, jobs7d: 9 })).toBe("9 jobs")
  })
})

describe("byRecentActivity", () => {
  it("orders newest first, never-seen last, without changing the input", () => {
    const orgs = [
      { n: "never", activity: { lastActiveAt: null } },
      { n: "old", activity: { lastActiveAt: ago(5 * DAY) } },
      { n: "new", activity: { lastActiveAt: ago(1 * HOUR) } },
      { n: "never2", activity: { lastActiveAt: null } },
    ]
    expect(byRecentActivity(orgs).map((o) => o.n)).toEqual(["new", "old", "never", "never2"])
    expect(orgs[0].n).toBe("never")
  })
})
