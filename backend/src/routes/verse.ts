import { Router } from "express"
import { prisma } from "../lib/prisma.js"
import { getVerseOfTheDay } from "../services/verse-of-the-day.js"

export const verseRouter = Router()

verseRouter.get("/", async (req, res) => {
  try {
    const org = await prisma.organization.findUnique({
      where: { id: req.user!.organizationId },
      select: { verseOfTheDayEnabled: true },
    })
    if (org && org.verseOfTheDayEnabled === false) {
      return res.status(404).json({ error: "disabled" })
    }

    const verse = await getVerseOfTheDay()
    res.json(verse)
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Failed to load verse of the day" })
  }
})
