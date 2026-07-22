import Anthropic from "@anthropic-ai/sdk"
import { prisma } from "../lib/prisma.js"
import { AI_MODEL } from "../lib/ai-config.js"

const apiKey = process.env.ANTHROPIC_API_KEY
if (!apiKey) {
  console.log("[FieldAI] Skipped — no ANTHROPIC_API_KEY set")
}

const anthropic = apiKey ? new Anthropic({ apiKey }) : null

export async function streamFieldAiResponse(
  jobId: string,
  userId: string,
  organizationId: string,
  onToken: (token: string) => void,
  onDone: (fullText: string) => void,
  onError: (err: Error) => void
): Promise<void> {
  if (!anthropic) {
    onError(new Error("not_configured"))
    return
  }

  try {
    // Load job — verify it belongs to this org
    const job = await prisma.job.findFirst({
      where: { id: jobId, organizationId },
      include: {
        customer: {
          include: {
            jobs: {
              where: { status: "completed" },
              orderBy: { completedAt: "desc" },
              take: 5,
              select: {
                completedAt: true,
                equipmentType: true,
                symptomSummary: true,
                summary: true,
                actionsTaken: true,
                partsUsed: true,
              },
            },
          },
        },
      },
    })

    if (!job) {
      onError(new Error("job_not_found"))
      return
    }

    // Load technician (graceful degrade if not found)
    const tech = await prisma.technician.findFirst({
      where: { user: { id: userId } },
      select: { name: true, epa608Level: true, skills: true },
    })

    // Org equipment history — last 5 completed jobs with same equipmentType
    const orgHistory = job.equipmentType
      ? await prisma.job.findMany({
          where: {
            organizationId,
            status: "completed",
            equipmentType: job.equipmentType,
            id: { not: jobId },
          },
          orderBy: { completedAt: "desc" },
          take: 5,
          select: {
            completedAt: true,
            symptomSummary: true,
            summary: true,
            actionsTaken: true,
            partsUsed: true,
          },
        })
      : []

    // Load conversation history for this job
    const history = await prisma.aiMessage.findMany({
      where: { jobId },
      orderBy: { createdAt: "asc" },
    })

    // Format customer history
    const customerHistoryText =
      job.customer.jobs.length > 0
        ? job.customer.jobs
            .map(
              (j, i) =>
                `${i + 1}. ${j.completedAt?.toLocaleDateString() ?? "?"} — ${j.equipmentType ?? "unknown"}: ${j.symptomSummary ?? "no symptoms"} | Actions: ${j.actionsTaken ?? "?"} | Parts: ${j.partsUsed.join(", ") || "none"}`
            )
            .join("\n")
        : "No prior service history for this customer."

    const orgHistoryText =
      orgHistory.length > 0
        ? orgHistory
            .map(
              (j, i) =>
                `${i + 1}. ${j.completedAt?.toLocaleDateString() ?? "?"}: ${j.symptomSummary ?? "no symptoms"} | Actions: ${j.actionsTaken ?? "?"} | Parts: ${j.partsUsed.join(", ") || "none"}`
            )
            .join("\n")
        : `No prior org history for ${job.equipmentType ?? "this equipment type"}.`

    const systemPrompt = `You are FlowSense AI, an expert HVAC field assistant. You help technicians diagnose issues, look up error codes, and find specifications in the field. Be concise and practical — technicians are reading on a phone while on a job site.

CURRENT JOB:
- Equipment: ${job.equipmentType ?? "Not specified"}
- Symptoms: ${job.symptomSummary ?? "Not provided"}
- Equipment notes: ${job.equipmentNotes ?? "None"}
- Service type: ${job.serviceType ?? "Not specified"}
- Address: ${job.customer.address}
- Scheduled: ${job.scheduledAt.toLocaleDateString()}

TECHNICIAN:
- Name: ${tech?.name ?? "Unknown"}
- EPA 608: ${tech?.epa608Level ?? "Not on file"}
- Skills: ${tech?.skills?.join(", ") || "Not specified"}

CUSTOMER HISTORY (last 5 jobs):
${customerHistoryText}

ORG HISTORY — ${job.equipmentType ?? "all types"} (last 5 org-wide):
${orgHistoryText}`

    // Build messages array from history
    const messages: Anthropic.MessageParam[] = history.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }))

    let fullText = ""

    const stream = anthropic.messages.stream({
      model: AI_MODEL,
      max_tokens: 1024,
      system: systemPrompt,
      messages,
    })

    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        fullText += event.delta.text
        onToken(event.delta.text)
      }
    }

    await stream.finalMessage()
    onDone(fullText)
  } catch (err) {
    onError(err instanceof Error ? err : new Error(String(err)))
  }
}
