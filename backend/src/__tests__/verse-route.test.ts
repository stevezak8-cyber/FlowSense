import { describe, it, expect, vi, beforeEach } from "vitest"
import request from "supertest"
import express from "express"

vi.mock("../services/verse-of-the-day.js", () => ({
  getVerseOfTheDay: vi.fn(),
}))

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    organization: {
      findUnique: vi.fn(),
    },
  },
}))

import { getVerseOfTheDay } from "../services/verse-of-the-day.js"
import { prisma } from "../lib/prisma.js"
import { verseRouter } from "../routes/verse.js"

const mockGetVerse = getVerseOfTheDay as ReturnType<typeof vi.fn>
const mockFindOrg = (prisma as unknown as { organization: { findUnique: ReturnType<typeof vi.fn> } }).organization.findUnique

function makeApp() {
  const app = express()
  app.use((req, _res, next) => {
    ;(req as express.Request & { user: unknown }).user = { id: "user1", organizationId: "org1", role: "office" }
    next()
  })
  app.use("/", verseRouter)
  return app
}

beforeEach(() => {
  vi.resetAllMocks()
  mockFindOrg.mockResolvedValue({ verseOfTheDayEnabled: true })
})

describe("GET /api/verse-of-the-day", () => {
  it("returns the verse of the day when enabled", async () => {
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

  it("returns 404 when the org has disabled it", async () => {
    mockFindOrg.mockResolvedValue({ verseOfTheDayEnabled: false })
    const res = await request(makeApp()).get("/")
    expect(res.status).toBe(404)
    expect(mockGetVerse).not.toHaveBeenCalled()
  })

  it("defaults to enabled when the org lookup returns nothing", async () => {
    mockFindOrg.mockResolvedValue(null)
    mockGetVerse.mockResolvedValue({ reference: "Psalm 23:1", text: "The LORD is my shepherd", translation: "KJV", date: "2026-09-08" })
    const res = await request(makeApp()).get("/")
    expect(res.status).toBe(200)
  })

  it("returns 500 if the service throws", async () => {
    mockGetVerse.mockRejectedValue(new Error("boom"))
    const res = await request(makeApp()).get("/")
    expect(res.status).toBe(500)
  })
})
