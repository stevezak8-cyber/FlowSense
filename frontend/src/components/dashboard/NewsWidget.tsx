import { useEffect, useState } from "react"
import { api } from "@/api/client"
import { Loader2, Newspaper, ExternalLink, Globe } from "lucide-react"
import { cn } from "@/lib/utils"

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
  return `${Math.floor(hrs / 24)}d ago`
}

function ArticleList({ articles }: { articles: NewsArticle[] }) {
  if (!articles.length) return (
    <p className="text-sm text-muted-foreground py-4 text-center">No articles available right now.</p>
  )
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
            {i + 1}
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
  const [tab, setTab] = useState<"hvac" | "general">("hvac")

  useEffect(() => {
    api.get<NewsArticle[]>("/api/dashboard/news")
      .then(setArticles)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const hvac = articles.filter(a => a.category === "hvac")
  const general = articles.filter(a => a.category === "general")

  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
      {/* Tab switcher */}
      <div className="flex items-center gap-1 rounded-xl bg-muted/50 p-1">
        <button
          onClick={() => setTab("hvac")}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition-all",
            tab === "hvac"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Newspaper className="h-3.5 w-3.5" />
          HVAC Industry
        </button>
        <button
          onClick={() => setTab("general")}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition-all",
            tab === "general"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Globe className="h-3.5 w-3.5" />
          U.S. News
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground py-4">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Loading news…</span>
        </div>
      ) : tab === "hvac" ? (
        <div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] text-muted-foreground">AI summarized</span>
          </div>
          <ArticleList articles={hvac} />
        </div>
      ) : (
        <div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] text-muted-foreground">Reuters · NPR</span>
          </div>
          <ArticleList articles={general} />
        </div>
      )}
    </div>
  )
}
