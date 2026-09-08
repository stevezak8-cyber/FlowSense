import { useEffect, useState } from "react"
import { api } from "@/api/client"
import { BookOpen, Loader2 } from "lucide-react"

interface Verse {
  reference: string
  text: string
  translation: string
}

export function VerseOfTheDay() {
  const [verse, setVerse] = useState<Verse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    api
      .get<Verse>("/api/verse-of-the-day")
      .then(setVerse)
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-card p-5 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Loading verse of the day…</span>
      </div>
    )
  }

  if (error || !verse) return null

  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
      <div className="flex items-center gap-2 text-muted-foreground">
        <BookOpen className="h-3.5 w-3.5" />
        <p className="text-[10px] font-bold uppercase tracking-wider">Verse of the Day</p>
      </div>
      <p className="text-sm italic leading-relaxed text-foreground">&ldquo;{verse.text}&rdquo;</p>
      <p className="text-xs font-semibold text-muted-foreground">
        {verse.reference} ({verse.translation})
      </p>
    </div>
  )
}
