// A small, curated set of well-known, encouraging references — deliberately
// avoids genealogies/ritual-law passages a true "random verse" endpoint would
// surface. One is picked deterministically per UTC day, then the actual verse
// text is fetched live (not hardcoded) from bible-api.com, which serves the
// public-domain KJV text.
const REFERENCES = [
  "joshua 1:9",
  "philippians 4:13",
  "proverbs 3:5-6",
  "jeremiah 29:11",
  "isaiah 40:31",
  "psalm 23:1",
  "psalm 46:1",
  "psalm 118:24",
  "romans 8:28",
  "romans 12:2",
  "2 corinthians 5:17",
  "galatians 6:9",
  "ephesians 2:10",
  "colossians 3:23",
  "1 corinthians 10:13",
  "1 peter 5:7",
  "matthew 6:34",
  "matthew 11:28",
  "john 14:27",
  "james 1:5",
  "proverbs 16:3",
  "proverbs 22:29",
  "psalm 37:4",
  "psalm 121:1-2",
  "isaiah 41:10",
  "deuteronomy 31:6",
  "habakkuk 3:19",
  "2 timothy 1:7",
  "hebrews 12:1",
  "philippians 4:6-7",
  "proverbs 12:24",
  "colossians 3:17",
  "psalm 90:17",
  "proverbs 13:4",
  "1 thessalonians 5:16-18",
  "micah 6:8",
  "psalm 143:8",
  "lamentations 3:22-23",
]

interface Verse {
  reference: string
  text: string
  translation: string
  date: string
}

const cache = new Map<string, Verse>()

function todayKey(): string {
  return new Date().toISOString().slice(0, 10) // YYYY-MM-DD (UTC)
}

function referenceForDate(dateKey: string): string {
  // Deterministic pick — same reference for everyone on a given UTC day,
  // cycling through the list over ~5 weeks before repeating.
  const dayOfEpoch = Math.floor(new Date(`${dateKey}T00:00:00Z`).getTime() / 86_400_000)
  const idx = ((dayOfEpoch % REFERENCES.length) + REFERENCES.length) % REFERENCES.length
  return REFERENCES[idx]
}

// A small local fallback set (same references, pre-fetched text) in case
// bible-api.com is unreachable — keeps this low-stakes feature from ever
// showing an error state.
const FALLBACK: Record<string, string> = {
  "joshua 1:9": "Have not I commanded thee? Be strong and of a good courage; be not afraid, neither be thou dismayed: for the LORD thy God is with thee whithersoever thou goest.",
  "philippians 4:13": "I can do all things through Christ which strengtheneth me.",
  "psalm 23:1": "The LORD is my shepherd; I shall not want.",
}

function cleanText(text: string): string {
  return text.replace(/\s+/g, " ").trim()
}

export async function getVerseOfTheDay(): Promise<Verse> {
  const dateKey = todayKey()
  const cached = cache.get(dateKey)
  if (cached) return cached

  const reference = referenceForDate(dateKey)

  try {
    const res = await fetch(`https://bible-api.com/${encodeURIComponent(reference)}?translation=kjv`, {
      signal: AbortSignal.timeout(8_000),
    })
    if (!res.ok) throw new Error(`bible-api.com responded ${res.status}`)
    const data = (await res.json()) as { reference?: string; text?: string }
    if (!data.text) throw new Error("bible-api.com returned no text")

    const verse: Verse = {
      reference: data.reference ?? reference,
      text: cleanText(data.text),
      translation: "KJV",
      date: dateKey,
    }
    cache.set(dateKey, verse)
    return verse
  } catch (error) {
    console.error("[VerseOfTheDay] Live fetch failed, using fallback:", error)
    const fallbackText = FALLBACK[reference] ?? FALLBACK["philippians 4:13"]
    const verse: Verse = {
      reference: reference.replace(/\b\w/g, (c) => c.toUpperCase()),
      text: fallbackText,
      translation: "KJV",
      date: dateKey,
    }
    return verse
  }
}
