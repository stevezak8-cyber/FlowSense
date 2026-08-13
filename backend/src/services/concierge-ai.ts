import Anthropic from "@anthropic-ai/sdk"
import { prisma } from "../lib/prisma.js"
import { AI_MODEL } from "../lib/ai-config.js"

const apiKey = process.env.ANTHROPIC_API_KEY
if (!apiKey) console.log("[ConciergeAI] Skipped — no ANTHROPIC_API_KEY set")
const anthropic = apiKey ? new Anthropic({ apiKey }) : null

export interface ConciergeMessage {
  role: "user" | "assistant"
  content: string
}

export type ConciergeResult =
  | { reply: string; jobAction?: { equipmentType: string | null; symptomSummary: string; scheduledAt: Date } }
  | { error: "not_configured" }
  | { error: "failed" }

export async function getConciergeReply(
  customerId: string,
  organizationId: string,
  messages: ConciergeMessage[]
): Promise<ConciergeResult> {
  if (!anthropic) return { error: "not_configured" }

  try {
    const [customer, invoices, org] = await Promise.all([
      prisma.customer.findUnique({
        where: { id: customerId },
        select: {
          name: true, address: true, city: true, state: true, postalCode: true, phone: true, email: true,
          jobs: {
            orderBy: { scheduledAt: "desc" },
            take: 10,
            select: {
              id: true, status: true, scheduledAt: true, completedAt: true,
              equipmentType: true, symptomSummary: true, summary: true,
              technician: { select: { user: { select: { name: true } } } },
            },
          },
          equipment: {
            select: { equipmentType: true, make: true, model: true, lastServicedAt: true },
          },
        },
      }),
      prisma.invoice.findMany({
        where: { customerId, organizationId, status: { not: "paid" } },
        select: { id: true, amount: true, status: true, dueDate: true, description: true },
        orderBy: { dueDate: "asc" },
      }),
      prisma.organization.findUnique({
        where: { id: organizationId },
        select: { name: true, phone: true, email: true, address: true },
      }),
    ])

    if (!customer || !org) return { error: "failed" }

    const fmt = (d: Date | string | null) =>
      d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "unknown"
    const fmtAmt = (n: number) => `$${n.toFixed(2)}`

    const jobsText = customer.jobs.length
      ? customer.jobs.map((j) =>
          `- [${j.status}] ${j.equipmentType ?? "service"} on ${fmt(j.scheduledAt)}` +
          (j.symptomSummary ? ` — ${j.symptomSummary}` : "") +
          (j.summary ? `. ${j.summary}` : "") +
          (j.technician?.user?.name ? ` (Tech: ${j.technician.user.name})` : "")
        ).join("\n")
      : "No service history on file."

    const invoicesText = invoices.length
      ? invoices.map((i) => `- ${fmtAmt(i.amount)} due ${fmt(i.dueDate)} — ${i.description} [${i.status}]`).join("\n")
      : "No open invoices."

    const equipmentText = customer.equipment.length
      ? customer.equipment.map((e) =>
          `- ${e.equipmentType}${e.make ? `: ${e.make}` : ""}${e.model ? ` ${e.model}` : ""}` +
          (e.lastServicedAt ? `, last serviced ${fmt(e.lastServicedAt)}` : "")
        ).join("\n")
      : "No equipment on file."

    const today = new Date().toISOString()

    const systemPrompt = `You are an AI concierge for ${org.name}, an HVAC service company. You are speaking with ${customer.name}.

Your job:
- Answer questions about their service history, job status, invoices, and equipment using ONLY the data below
- Help them request a new service call
- Answer general HVAC questions (maintenance tips, troubleshooting guidance)

CUSTOMER DATA:
Name: ${customer.name}
Address: ${customer.address}, ${customer.city}, ${customer.state} ${customer.postalCode}

JOBS (most recent first):
${jobsText}

OPEN INVOICES:
${invoicesText}

EQUIPMENT:
${equipmentText}

COMPANY CONTACT:
${org.name}${org.phone ? ` · ${org.phone}` : ""}${org.email ? ` · ${org.email}` : ""}

SERVICE REQUEST PROTOCOL:
If the customer wants to schedule a new service, collect: (1) what equipment or system has the problem, (2) what symptoms they are experiencing. Then confirm with them before booking. Once confirmed, respond with your reply followed by this exact JSON on its own line:
{"action":"create_job","equipmentType":"central-ac","symptomSummary":"Not cooling — customer confirmed booking","scheduledAt":"2026-08-20T09:00:00.000Z"}

Use null for equipmentType if unknown. Use a scheduledAt approximately 2 business days from today if the customer does not specify a time. Today is ${today}.

CONSTRAINTS:
- Never fabricate job details, invoice amounts, or dates that are not in the data above
- If you don't know something, say so and offer to connect them with the office
- Keep replies concise (2-4 sentences for simple questions, up to 8 for complex ones)
- Do not mention that you are Claude or reference any AI model`

    const response = await anthropic.messages.create({
      model: AI_MODEL,
      max_tokens: 1024,
      system: systemPrompt,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    })

    const fullText = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("")

    const actionMatch = fullText.match(/^\s*(\{"action":"create_job".*?\})\s*$/m)
    if (actionMatch) {
      try {
        const parsed = JSON.parse(actionMatch[1]) as {
          action: string
          equipmentType: string | null
          symptomSummary: string
          scheduledAt: string
        }
        const cleanedReply = fullText.replace(actionMatch[0], "").trim()
        const parsedDate = new Date(parsed.scheduledAt)
        const scheduledAt = isNaN(parsedDate.getTime())
          ? new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)
          : parsedDate
        return {
          reply: cleanedReply,
          jobAction: {
            equipmentType: parsed.equipmentType ?? null,
            symptomSummary: parsed.symptomSummary,
            scheduledAt,
          },
        }
      } catch {
        // JSON parse failed — return full text as plain reply
      }
    }

    return { reply: fullText }
  } catch (e) {
    console.error("[ConciergeAI] Error:", e)
    return { error: "failed" }
  }
}
