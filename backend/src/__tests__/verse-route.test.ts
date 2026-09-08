import { describe, it, expect, vi, beforeEach } from "vitest"
import request from "supertest"
import express from "express"

vi.mock("../services/verse-of-the-day.js", () => ({
  getVerseOfTheDay: vi.fn(),
}))

import { getVerseOfTheDay } from "../services/verse-of-the-day.js"
import { verseRouter } from "../routes/verse.js"

const mockGetVerse = getVerseOfTheDay as ReturnType<typeof vi.fn>

function makeApp() {
  const app = express()
  app.use("/", verseRouter)
  return app
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe("GET /api/verse-of-the-day", () => {
  it("returns the verse of the day", async () => {
    mockGetVerse.mockResolvedValue({
      reference: "Philippians 4:13",
      text: "I can do all things through Christ which strengtheneth me.",
      translation: "KJV",
      date: "2026-09-08",
    })

    const res = await request(makeApp()).get("/")
    expect(res.status).toBe(200)
    expect(res.body.reference).toBe("Philippians 4:13")
    expect(res.body.translation).toBe("KJV")
  })

  it("returns 500 if the service throws", async () => {
    mockGetVerse.mockRejectedValue(new Error("boom"))
    const res = await request(makeApp()).get("/")
    expect(res.status).toBe(500)
  })
})
