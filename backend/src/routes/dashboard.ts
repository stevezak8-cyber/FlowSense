import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { getAtRiskReasons, getAnalyticsNarrative } from "../services/analytics-ai.js";
import type { AnalyticsTrends } from "../services/analytics-ai.js";

export const dashboardRouter = Router();

// GET /api/dashboard/stats
dashboardRouter.get("/stats", async (req, res) => {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // Sunday
    const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      totalJobs,
      activeJobs,
      completedToday,
      scheduledThisWeek,
      urgentJobs,
      totalTechnicians,
      totalCustomers,
      completedJobs,
    ] = await Promise.all([
      prisma.job.count({ where: { organizationId: req.user!.organizationId } }),
      prisma.job.count({
        where: {
          organizationId: req.user!.organizationId,
          status: { in: ["scheduled", "en_route", "in_progress"] },
        },
      }),
      prisma.job.count({
        where: {
          organizationId: req.user!.organizationId,
          status: "completed",
          completedAt: { gte: todayStart, lt: todayEnd },
        },
      }),
      prisma.job.count({
        where: {
          organizationId: req.user!.organizationId,
          scheduledAt: { gte: weekStart, lt: weekEnd },
        },
      }),
      prisma.job.count({
        where: { organizationId: req.user!.organizationId, priority: "urgent", status: { not: "completed" } },
      }),
      prisma.technician.count({ where: { organizationId: req.user!.organizationId } }),
      prisma.customer.count({ where: { organizationId: req.user!.organizationId } }),
      prisma.job.count({ where: { organizationId: req.user!.organizationId, status: "completed" } }),
    ]);

    // Revenue MTD from invoices
    const revenueResult = await prisma.invoice.aggregate({
      where: {
        organizationId: req.user!.organizationId,
        status: "paid",
        issuedDate: { gte: monthStart },
      },
      _sum: { amount: true },
    });
    const revenueMtd = revenueResult._sum.amount ?? 0;

    // Org city for weather widget
    const org = await prisma.organization.findUnique({
      where: { id: req.user!.organizationId },
      select: { address: true },
    });
    const city = org?.address ?? undefined;

    res.json({
      totalJobs,
      activeJobs,
      completedToday,
      scheduledThisWeek,
      urgentJobs,
      totalTechnicians,
      totalCustomers,
      completedJobs,
      revenueMtd,
      city,
    });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Failed to get stats" });
  }
});

// GET /api/dashboard/chart - weekly job volume
dashboardRouter.get("/chart", async (req, res) => {
  try {
    const now = new Date();
    const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // Sunday

    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const chartData = [];

    for (let i = 0; i < 7; i++) {
      const dayStart = new Date(weekStart.getTime() + i * 24 * 60 * 60 * 1000);
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

      const [scheduled, completed] = await Promise.all([
        prisma.job.count({
          where: {
            organizationId: req.user!.organizationId,
            scheduledAt: { gte: dayStart, lt: dayEnd },
          },
        }),
        prisma.job.count({
          where: {
            organizationId: req.user!.organizationId,
            status: "completed",
            completedAt: { gte: dayStart, lt: dayEnd },
          },
        }),
      ]);

      chartData.push({ day: days[i], scheduled, completed });
    }

    res.json(chartData);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Failed to get chart data" });
  }
});

async function getAnalyticsTrends(
  organizationId: string,
  sixMonthsAgo: Date
): Promise<AnalyticsTrends> {
  const twelveMonthsAgo = new Date()
  twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1)

  const [invoices, completedJobs, overdueCount, warrantyCount, noRecentJobCount] = await Promise.all([
    prisma.invoice.findMany({
      where: {
        organizationId,
        status: "paid",
        issuedDate: { gte: sixMonthsAgo },
      },
      select: { issuedDate: true, amount: true },
    }),
    prisma.job.findMany({
      where: {
        organizationId,
        status: "completed",
        completedAt: { gte: sixMonthsAgo },
      },
      select: { completedAt: true, equipmentType: true },
    }),
    prisma.equipment.count({
      where: {
        organizationId,
        lastServicedAt: { not: null },
        serviceIntervalMonths: { not: null },
      },
    }),
    prisma.equipment.count({
      where: {
        organizationId,
        warrantyExpiry: {
          gte: new Date(),
          lte: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
        },
      },
    }),
    prisma.customer.count({
      where: {
        organizationId,
        jobs: {
          some: { status: "completed" },
          none: { status: "completed", completedAt: { gte: twelveMonthsAgo } },
        },
      },
    }),
  ])

  const revenueMap = new Map<string, number>()
  for (const inv of invoices) {
    const d = new Date(inv.issuedDate)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    revenueMap.set(key, (revenueMap.get(key) ?? 0) + inv.amount)
  }
  const revenueTrend = Array.from(revenueMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, revenue]) => ({ month, revenue }))

  const jobMap = new Map<string, number>()
  const equipMap = new Map<string, number>()
  for (const job of completedJobs) {
    if (job.completedAt) {
      const d = new Date(job.completedAt)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
      jobMap.set(key, (jobMap.get(key) ?? 0) + 1)
    }
    if (job.equipmentType) {
      equipMap.set(job.equipmentType, (equipMap.get(job.equipmentType) ?? 0) + 1)
    }
  }
  const jobTrend = Array.from(jobMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, jobs]) => ({ month, jobs }))
  const equipmentBreakdown = Array.from(equipMap.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([type, count]) => ({ type, count }))

  const atRiskCount = overdueCount + warrantyCount + noRecentJobCount

  return { revenueTrend, jobTrend, equipmentBreakdown, atRiskCount }
}

// GET /api/dashboard/analytics/data
dashboardRouter.get("/analytics/data", async (req, res) => {
  if (req.user!.role !== "office") return res.status(403).json({ error: "Forbidden" })
  try {
    const now = new Date()
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1)
    const twelveMonthsAgo = new Date(now)
    twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1)
    const ninetyDaysFromNow = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000)
    const orgId = req.user!.organizationId

    const [trends, overdueEquipment, warrantyEquipment, noRecentJobCustomers] =
      await Promise.all([
        getAnalyticsTrends(orgId, sixMonthsAgo),
        prisma.equipment.findMany({
          where: {
            organizationId: orgId,
            lastServicedAt: { not: null },
            serviceIntervalMonths: { not: null },
          },
          select: {
            customerId: true,
            lastServicedAt: true,
            serviceIntervalMonths: true,
            customer: { select: { id: true, name: true, address: true } },
          },
        }),
        prisma.equipment.findMany({
          where: {
            organizationId: orgId,
            warrantyExpiry: { gte: now, lte: ninetyDaysFromNow },
          },
          select: {
            customerId: true,
            customer: { select: { id: true, name: true, address: true } },
          },
        }),
        prisma.customer.findMany({
          where: {
            organizationId: orgId,
            jobs: {
              some: { status: "completed" },
              none: { status: "completed", completedAt: { gte: twelveMonthsAgo } },
            },
          },
          select: { id: true, name: true, address: true },
        }),
      ])

    const { revenueTrend, jobTrend, equipmentBreakdown } = trends
    const forecastEntries = revenueTrend.slice(-3)
    const projectedRevenue =
      forecastEntries.length === 0
        ? 0
        : forecastEntries.reduce((sum, e) => sum + e.revenue, 0) / forecastEntries.length
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    const forecastMonth = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, "0")}`

    const atRiskMap = new Map<
      string,
      { customerId: string; name: string; address: string; flags: string[] }
    >()

    const addFlag = (customerId: string, name: string, address: string, flag: string) => {
      const existing = atRiskMap.get(customerId)
      if (existing) {
        if (!existing.flags.includes(flag)) existing.flags.push(flag)
      } else {
        atRiskMap.set(customerId, { customerId, name, address, flags: [flag] })
      }
    }

    for (const eq of overdueEquipment) {
      if (!eq.lastServicedAt || !eq.serviceIntervalMonths || !eq.customer) continue
      const dueDate = new Date(eq.lastServicedAt)
      dueDate.setMonth(dueDate.getMonth() + eq.serviceIntervalMonths)
      if (dueDate < now) {
        addFlag(eq.customerId, eq.customer.name, eq.customer.address, "overdue_service")
      }
    }
    for (const eq of warrantyEquipment) {
      if (!eq.customer) continue
      addFlag(eq.customerId, eq.customer.name, eq.customer.address, "warranty_expiring")
    }
    for (const c of noRecentJobCustomers) {
      addFlag(c.id, c.name, c.address, "no_recent_job")
    }

    const atRiskList = Array.from(atRiskMap.values())
    const reasons = await getAtRiskReasons(
      atRiskList.map((c) => ({ customerId: c.customerId, name: c.name, flags: c.flags }))
    )
    const atRisk = atRiskList.map((c) => ({
      ...c,
      aiReason: reasons[c.customerId] ?? null,
    }))

    res.json({
      revenueTrend,
      jobTrend,
      forecast: { month: forecastMonth, projectedRevenue },
      equipmentBreakdown,
      atRisk,
    })
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Failed to get analytics" })
  }
})

// GET /api/dashboard/analytics/insights
dashboardRouter.get("/analytics/insights", async (req, res) => {
  if (req.user!.role !== "office") return res.status(403).json({ error: "Forbidden" })
  try {
    const now = new Date()
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1)
    const trends = await getAnalyticsTrends(req.user!.organizationId, sixMonthsAgo)
    const narrative = await getAnalyticsNarrative(trends)
    res.json({ narrative })
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Failed to get insights" })
  }
})

// ── Weather ──────────────────────────────────────────────────────────────────
// GET /api/dashboard/weather?city=Denver,CO
// Uses Open-Meteo (free, no key) + Nominatim geocoding
dashboardRouter.get("/weather", async (req, res) => {
  if (req.user!.role !== "office") return res.status(403).json({ error: "Forbidden" })

  const city = (req.query.city as string) || "Denver, CO"

  try {
    // Geocode the city
    const geoRes = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city)}&format=json&limit=1`,
      { headers: { "User-Agent": "Pneuros-HVAC-App/1.0" } }
    )
    const geoData = await geoRes.json() as Array<{ lat: string; lon: string; display_name: string }>
    if (!geoData.length) return res.status(404).json({ error: "City not found" })

    const { lat, lon } = geoData[0]

    // Fetch weather from Open-Meteo
    const weatherRes = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,apparent_temperature,weathercode,windspeed_10m,relativehumidity_2m` +
      `&daily=temperature_2m_max,temperature_2m_min,weathercode,precipitation_probability_max` +
      `&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=auto&forecast_days=5`
    )
    const weather = await weatherRes.json() as {
      current: { temperature_2m: number; apparent_temperature: number; weathercode: number; windspeed_10m: number; relativehumidity_2m: number }
      daily: { time: string[]; temperature_2m_max: number[]; temperature_2m_min: number[]; weathercode: number[]; precipitation_probability_max: number[] }
    }

    res.json({ city: geoData[0].display_name.split(",")[0], lat, lon, ...weather })
  } catch (e) {
    res.status(500).json({ error: "Weather unavailable" })
  }
})

// ── HVAC Industry News ────────────────────────────────────────────────────────
// GET /api/dashboard/news
interface NewsArticle {
  title: string
  summary: string
  url: string
  publishedAt: string
  source: string
  category: "hvac" | "general"
}

let newsCache: { articles: NewsArticle[]; fetchedAt: number } | null = null

async function fetchRssFeed(url: string, source: string, category: NewsArticle["category"], maxItems = 3): Promise<NewsArticle[]> {
  try {
    const rssRes = await fetch(url, {
      headers: { "User-Agent": "Pneuros-HVAC-App/1.0", "Accept": "application/rss+xml,application/xml,text/xml" },
      signal: AbortSignal.timeout(8000),
    })
    const xml = await rssRes.text()
    const items: NewsArticle[] = []
    const itemRegex = /<item>([\s\S]*?)<\/item>/g
    let match
    while ((match = itemRegex.exec(xml)) !== null && items.length < maxItems) {
      const item = match[1]
      const title = item.match(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/)?.[1]?.trim()
      const link = item.match(/<link>([^<]+)<\/link>/)?.[1]?.trim() ||
                   item.match(/<guid[^>]*isPermaLink="true"[^>]*>([^<]+)<\/guid>/)?.[1]?.trim() ||
                   item.match(/<guid[^>]*>([^<]+)<\/guid>/)?.[1]?.trim()
      const pubDate = item.match(/<pubDate>(.*?)<\/pubDate>/)?.[1]?.trim()
      const desc = item.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/)?.[1]
        ?.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").trim().slice(0, 300)
      if (title && link) {
        items.push({
          title: title.replace(/&amp;/g, "&").replace(/&#8217;/g, "'").replace(/&#8216;/g, "'"),
          summary: desc || title,
          url: link,
          publishedAt: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
          source,
          category,
        })
      }
    }
    return items
  } catch {
    return []
  }
}

dashboardRouter.get("/news", async (req, res) => {
  if (req.user!.role !== "office") return res.status(403).json({ error: "Forbidden" })

  if (newsCache && Date.now() - newsCache.fetchedAt < 60 * 60 * 1000) {
    return res.json(newsCache.articles)
  }

  try {
    const [hvac1, hvac2, hvac3, general1, general2] = await Promise.all([
      fetchRssFeed("https://www.achrnews.com/rss/topic/2648", "ACHR News", "hvac", 3),
      fetchRssFeed("https://www.achrnews.com/rss/all", "ACHR News", "hvac", 3),
      fetchRssFeed("https://www.hpac.com/rss/all", "HPAC Engineering", "hvac", 2),
      fetchRssFeed("https://feeds.reuters.com/reuters/domesticNews", "Reuters", "general", 4),
      fetchRssFeed("https://feeds.npr.org/1003/rss.xml", "NPR", "general", 3),
    ])

    // Deduplicate HVAC articles by title
    const hvacSeen = new Set<string>()
    const hvacArticles: NewsArticle[] = []
    for (const a of [...hvac1, ...hvac2, ...hvac3]) {
      if (!hvacSeen.has(a.title)) { hvacSeen.add(a.title); hvacArticles.push(a) }
      if (hvacArticles.length >= 5) break
    }

    const generalArticles = [...general1, ...general2].slice(0, 5)

    const allArticles = [...hvacArticles, ...generalArticles]

    // AI summarize if available
    const anthropicKey = process.env.ANTHROPIC_API_KEY
    if (anthropicKey && allArticles.length > 0) {
      try {
        const { default: Anthropic } = await import("@anthropic-ai/sdk")
        const client = new Anthropic({ apiKey: anthropicKey })
        const prompt = `Summarize each headline in one crisp sentence (max 20 words). Return as JSON array of strings in the same order:\n${allArticles.map((a, i) => `${i + 1}. ${a.title}`).join("\n")}`
        const msg = await client.messages.create({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 600,
          messages: [{ role: "user", content: prompt }],
        })
        const raw = (msg.content[0] as { text: string }).text
        const jsonMatch = raw.match(/\[[\s\S]*\]/)
        if (jsonMatch) {
          const summaries = JSON.parse(jsonMatch[0]) as string[]
          summaries.forEach((s, i) => { if (allArticles[i] && s) allArticles[i].summary = s })
        }
      } catch { /* use raw descriptions */ }
    }

    newsCache = { articles: allArticles, fetchedAt: Date.now() }
    res.json(allArticles)
  } catch (e) {
    res.status(500).json({ error: "News unavailable" })
  }
})
