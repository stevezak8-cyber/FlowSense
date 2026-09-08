import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

describe("verse-of-the-day", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.useFakeTimers()
    global.fetch = vi.fn()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("fetches live text from bible-api.com in KJV", async () => {
    vi.setSystemTime(new Date("2026-09-08T12:00:00Z"))
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ reference: "John 3:16", text: "For God so loved the world...\n" }),
    })

    const { getVerseOfTheDay } = await import("../services/verse-of-the-day.js")
    const verse = await getVerseOfTheDay()

    expect(verse.translation).toBe("KJV")
    expect(verse.text).toBe("For God so loved the world...")
    expect(verse.reference).toBe("John 3:16")
    const url = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(url).toContain("bible-api.com")
    expect(url).toContain("translation=kjv")
  })

  it("returns the same verse for repeated calls on the same day without refetching", async () => {
    vi.setSystemTime(new Date("2026-09-08T08:00:00Z"))
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ reference: "Psalm 23:1", text: "The LORD is my shepherd" }),
    })

    const { getVerseOfTheDay } = await import("../services/verse-of-the-day.js")
    const first = await getVerseOfTheDay()
    vi.setSystemTime(new Date("2026-09-08T20:00:00Z")) // later same UTC day
    const second = await getVerseOfTheDay()

    expect(second).toEqual(first)
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it("picks a different reference on a different day", async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockImplementation(async (url: string) => ({
      ok: true,
      json: async () => ({ reference: url, text: "placeholder text" }),
    }))

    const { getVerseOfTheDay } = await import("../services/verse-of-the-day.js")

    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"))
    const day1 = await getVerseOfTheDay()

    vi.setSystemTime(new Date("2026-01-02T00:00:00Z"))
    const day2 = await getVerseOfTheDay()

    expect(day1.date).not.toBe(day2.date)
    expect(global.fetch).toHaveBeenCalledTimes(2)
  })

  it("falls back to local text when the live API fails, without throwing", async () => {
    vi.setSystemTime(new Date("2026-09-08T12:00:00Z"))
    ;(global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("network error"))

    const { getVerseOfTheDay } = await import("../services/verse-of-the-day.js")
    const verse = await getVerseOfTheDay()

    expect(verse.translation).toBe("KJV")
    expect(verse.text.length).toBeGreaterThan(0)
    expect(verse.reference.length).toBeGreaterThan(0)
  })

  it("falls back to local text when the API responds with a non-OK status", async () => {
    vi.setSystemTime(new Date("2026-09-08T12:00:00Z"))
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 503, json: async () => ({}) })

    const { getVerseOfTheDay } = await import("../services/verse-of-the-day.js")
    const verse = await getVerseOfTheDay()

    expect(verse.text.length).toBeGreaterThan(0)
  })
})
