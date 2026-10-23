import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("../lib/prisma.js", () => ({ prisma: { user: { updateMany: vi.fn() } } }))

import { prisma } from "../lib/prisma.js"
import { recordActivity, recordLogin, resetActivityTracking, ACTIVITY_WRITE_INTERVAL_MS } from "../services/user-activity.js"

const updateMany = vi.mocked(prisma.user.updateMany)

beforeEach(() => {
  vi.clearAllMocks()
  resetActivityTracking()
  updateMany.mockResolvedValue({ count: 1 } as never)
})

describe("recordActivity", () => {
  it("writes lastActiveAt for a user's first request", () => {
    recordActivity("u1", 1_000_000)
    expect(updateMany).toHaveBeenCalledTimes(1)
    expect(updateMany).toHaveBeenCalledWith({ where: { id: "u1" }, data: { lastActiveAt: new Date(1_000_000) } })
  })

  it("skips the write for repeat requests inside the window, and writes again after it", () => {
    recordActivity("u1", 1_000_000)
    recordActivity("u1", 1_000_000 + ACTIVITY_WRITE_INTERVAL_MS - 1)
    expect(updateMany).toHaveBeenCalledTimes(1)
    recordActivity("u1", 1_000_000 + ACTIVITY_WRITE_INTERVAL_MS)
    expect(updateMany).toHaveBeenCalledTimes(2)
  })

  it("tracks each user separately", () => {
    recordActivity("u1", 1_000_000)
    recordActivity("u2", 1_000_001)
    expect(updateMany).toHaveBeenCalledTimes(2)
  })

  it("never throws or rejects when the database fails, and retries on the next request", async () => {
    updateMany.mockRejectedValueOnce(new Error("db down"))
    expect(() => recordActivity("u1", 1_000_000)).not.toThrow()
    await new Promise((r) => setTimeout(r, 0))
    recordActivity("u1", 1_000_001)
    expect(updateMany).toHaveBeenCalledTimes(2)
  })

  it("survives a synchronous failure too", () => {
    updateMany.mockImplementationOnce(() => { throw new Error("boom") })
    expect(() => recordActivity("u1", 1_000_000)).not.toThrow()
  })
})

describe("recordLogin", () => {
  it("stamps both lastLoginAt and lastActiveAt", async () => {
    const now = new Date("2026-10-22T20:00:00Z")
    await recordLogin("u1", now)
    expect(updateMany).toHaveBeenCalledWith({ where: { id: "u1" }, data: { lastLoginAt: now, lastActiveAt: now } })
  })

  it("starts the activity window so the next request doesn't write again", async () => {
    await recordLogin("u1", new Date())
    updateMany.mockClear()
    recordActivity("u1")
    expect(updateMany).not.toHaveBeenCalled()
  })

  it("never throws, so a tracking failure can't block signing in", async () => {
    updateMany.mockRejectedValue(new Error("db down"))
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    await expect(recordLogin("u1")).resolves.toBeUndefined()
    spy.mockRestore()
  })
})
