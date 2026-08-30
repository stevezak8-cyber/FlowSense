import { useEffect, useState } from "react"
import { api } from "@/api/client"
import { Loader2, Newspaper, ExternalLink, Globe } from "lucide-react"

interface NewsArticle {
  title: string
  summary: string
  url: string
  publishedAt: string
  source: string
  category: "hvac" | "general"
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const hrs = Math.floor(diff / 3600000)
  if (hrs < 1) return "just now"
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

function ArticleList({ articles, startIndex }: { articles: NewsArticle[]; startIndex: number }) {
  return (
    <div className="space-y-1">
      {articles.map((article, i) => (
        <a
          key={i}
          href={article.url}
          target="_blank"
          rel="noopener noreferrer"
          className="group flex items-start gap-3 rounded-xl p-2.5 hover:bg-muted/50 transition-colors -mx-2.5"
        >
          <div className="flex-shrink-0 mt-0.5 flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary text-xs font-bold">
            {startIndex + i + 1}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-foreground leading-snug group-hover:text-primary transition-colors line-clamp-2">
              {article.title}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed line-clamp-2">
              {article.summary}
            </p>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[9px] font-medium text-muted-foreground/60">{article.source}</span>
              <span className="text-[9px] text-muted-foreground/40">·</span>
              <span className="text-[9px] text-muted-foreground/60">{timeAgo(article.publishedAt)}</span>
            </div>
          </div>
          <ExternalLink className="h-3 w-3 text-muted-foreground/40 flex-shrink-0 mt-0.5 group-hover:text-primary transition-colors" />
        </a>
      ))}
    </div>
  )
}

export function NewsWidget() {
  const [articles, setArticles] = useState<NewsArticle[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get<NewsArticle[]>("/api/dashboard/news")
      .then(setArticles)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="rounded-2xl border border-border/60 bg-card shadow-sm p-5 flex items-center gap-2 text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      <span className="text-sm">Loading news…</span>
    </div>
  )

  if (!articles.length) return (
    <div className="rounded-2xl border border-border/60 bg-card shadow-sm p-5 flex items-center gap-2 text-muted-foreground">
      <Newspaper className="h-4 w-4" />
      <span className="text-sm">News unavailable right now.</span>
    </div>
  )

  const hvac = articles.filter(a => a.category === "hvac")
  const general = articles.filter(a => a.category === "general")

  return (
    <div className="rounded-2xl border border-border/60 bg-card shadow-sm p-5 space-y-5">
      {hvac.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Newspaper className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-bold text-foreground">HVAC Industry</h3>
            <span className="ml-auto text-[10px] text-muted-foreground">AI summarized</span>
          </div>
          <ArticleList articles={hvac} startIndex={0} />
        </div>
      )}

      {hvac.length > 0 && general.length > 0 && (
        <div className="border-t border-border/60" />
      )}

      {general.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-bold text-foreground">Today's News</h3>
          </div>
          <ArticleList articles={general} startIndex={hvac.length} />
        </div>
      )}
    </div>
  )
}
