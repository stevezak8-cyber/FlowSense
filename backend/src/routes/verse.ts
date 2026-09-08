import { Router } from "express"
import { getVerseOfTheDay } from "../services/verse-of-the-day.js"

export const verseRouter = Router()

verseRouter.get("/", async (_req, res) => {
  try {
    const verse = await getVerseOfTheDay()
    res.json(verse)
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Failed to load verse of the day" })
  }
})
