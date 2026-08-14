import Anthropic from "@anthropic-ai/sdk"
import { AI_MODEL } from "../lib/ai-config.js"

const apiKey = process.env.ANTHROPIC_API_KEY
if (!apiKey) console.log("[AnalyticsAI] Skipped — no ANTHROPIC_API_KEY set")
const anthropic = apiKey ? new Anthropic({ apiKey }) : null

export interface AtRiskCustomer {
  customerId: string
  name: string
  flags: string[]
}

export interface AnalyticsTrends {
  revenueTrend: { month: string; revenue: number }[]
  jobTrend: { month: string; jobs: number }[]
  equipmentBreakdown: { type: string; count: number }[]
  atRiskCount: number
}

export async function getAtRiskReasons(
  customers: AtRiskCustomer[]
): Promise<Record<string, string | null>> {
  if (!anthropic || customers.length === 0) return {}

  try {
    const customerList = customers
      .map((c) => `- ID: ${c.customerId}, Name: ${c.name}, Flags: ${c.flags.join(", ")}`)
      .join("\n")

    const response = await anthropic.messages.create({
      model: AI_MODEL,
      max_tokens: 512,
      messages: [
        {
          role: "user",
          content: `You are an HVAC business assistant. For each at-risk customer below, write a one-sentence reason (≤15 words) explaining why they are at risk. Return ONLY a JSON object mapping customerId to reason string.

Customers:
${customerList}

Return format: {"customerId1": "reason here", "customerId2": "reason here"}
Return ONLY the JSON object, no other text.`,
        },
      ],
    })

    const block = response.content.find((b) => b.type === "text")
    const text = block && block.type === "text" ? block.text : ""
    const raw = JSON.parse(text) as unknown
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {}
    const result: Record<string, string | null> = {}
    for (const [k, v] of Object.entries(raw)) {
      result[k] = typeof v === "string" ? v : null
    }
    return result
  } catch (e) {
    console.error("[AnalyticsAI] getAtRiskReasons failed:", e)
    return {}
  }
}

export async function getAnalyticsNarrative(
  trends: AnalyticsTrends
): Promise<string | null> {
  if (!anthropic) return null

  try {
    const revenueLines = trends.revenueTrend
      .map((r) => `  ${r.month}: $${r.revenue.toFixed(2)}`)
      .join("\n")
    const jobLines = trends.jobTrend
      .map((j) => `  ${j.month}: ${j.jobs} jobs`)
      .join("\n")
    const equipLines = trends.equipmentBreakdown
      .map((e) => `  ${e.type}: ${e.count} jobs`)
      .join("\n")

    const response = await anthropic.messages.create({
      model: AI_MODEL,
      max_tokens: 300,
      messages: [
        {
          role: "user",
          content: `You are an HVAC business analyst. Write a 3-5 sentence narrative summary of this HVAC company's recent performance. Be specific, mention actual numbers, and highlight what's notable. Do not mention that you are an AI.

Revenue (last 6 months):
${revenueLines || "  No data"}

Jobs completed (last 6 months):
${jobLines || "  No data"}

Top equipment types:
${equipLines || "  No data"}

At-risk customers: ${trends.atRiskCount}`,
        },
      ],
    })

    const block = response.content.find((b) => b.type === "text")
    const text = block && block.type === "text" ? block.text : null
    return text?.trim() || null
  } catch (e) {
    console.error("[AnalyticsAI] getAnalyticsNarrative failed:", e)
    return null
  }
}
