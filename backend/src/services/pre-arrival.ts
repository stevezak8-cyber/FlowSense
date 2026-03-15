import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "../lib/prisma.js";

// Silent skip pattern — consistent with email.ts / Resend
const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.log("[PreArrival] Skipped — no ANTHROPIC_API_KEY set");
}

const anthropic = apiKey ? new Anthropic({ apiKey }) : null;

interface PreArrivalResult {
  preArrivalNotes: string;
  suggestedParts: string[];
  suggestedTools: string[];
  riskFlags: string[];
}

export async function generatePreArrival(jobId: string): Promise<void> {
  if (!anthropic) return;

  try {
    // 1. Fetch the current job with customer and technician
    const job = await prisma.job.findFirst({
      where: { id: jobId },
      include: { customer: true, technician: true },
    });
    if (!job) {
      console.error(`[PreArrival] Job ${jobId} not found`);
      return;
    }

    // 2. Fetch customer's last 10 completed jobs
    const history = await prisma.job.findMany({
      where: { customerId: job.customerId, status: "completed" },
      orderBy: { completedAt: "desc" },
      take: 10,
      select: {
        symptomSummary: true,
        summary: true,
        actionsTaken: true,
        partsUsed: true,
        equipmentType: true,
        completedAt: true,
      },
    });

    // 3. Build the prompt
    const systemPrompt = `You are an HVAC service intelligence assistant. Analyze the job details and customer service history to generate a pre-arrival briefing for the technician. Respond with valid JSON only, matching this exact schema:

{
  "preArrivalNotes": "2-3 sentence briefing for the technician with actionable context",
  "suggestedParts": ["array of specific parts to bring based on symptoms and history"],
  "suggestedTools": ["array of specialized tools needed beyond standard toolkit"],
  "riskFlags": ["array of safety, compliance, or pattern warnings to be aware of"]
}

Return ONLY the JSON object. No markdown, no code fences, no explanation.`;

    const historyText = history.length > 0
      ? history
          .map(
            (h, i) =>
              `  ${i + 1}. [${h.completedAt?.toISOString().split("T")[0] ?? "unknown"}] ${h.equipmentType ?? "HVAC"}: ${h.symptomSummary ?? "N/A"}\n     Resolution: ${h.summary ?? h.actionsTaken ?? "N/A"}\n     Parts used: ${h.partsUsed.length > 0 ? h.partsUsed.join(", ") : "None"}`
          )
          .join("\n")
      : "  No previous service history.";

    const userPrompt = `## Current Job
- Equipment: ${job.equipmentType ?? "Not specified"}
- Service type: ${job.serviceType ?? "Not specified"}
- Priority: ${job.priority}
- Symptoms: ${job.symptomSummary ?? "Not provided"}
- Equipment notes: ${job.equipmentNotes ?? "None"}

## Customer
- Name: ${job.customer.name}
- Address: ${job.customer.address}
- Notes: ${job.customer.notes ?? "None"}

## Service History (last ${history.length} completed jobs)
${historyText}`;

    // 4. Call Claude Haiku
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-20250514",
      max_tokens: 800,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    // 5. Parse the response
    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      console.error("[PreArrival] No text content in response");
      return;
    }

    let parsed: PreArrivalResult;
    try {
      parsed = JSON.parse(textBlock.text) as PreArrivalResult;
    } catch {
      console.error("[PreArrival] Failed to parse JSON response:", textBlock.text.slice(0, 200));
      return;
    }

    // 6. Validate shape
    if (
      typeof parsed.preArrivalNotes !== "string" ||
      !Array.isArray(parsed.suggestedParts) ||
      !Array.isArray(parsed.suggestedTools) ||
      !Array.isArray(parsed.riskFlags)
    ) {
      console.error("[PreArrival] Response missing required fields");
      return;
    }

    // 7. Update the job record
    await prisma.job.update({
      where: { id: jobId },
      data: {
        preArrivalNotes: parsed.preArrivalNotes,
        suggestedParts: parsed.suggestedParts,
        suggestedTools: parsed.suggestedTools,
        riskFlags: parsed.riskFlags,
      },
    });

    console.log(`[PreArrival] Generated briefing for job ${jobId}`);
  } catch (error) {
    console.error("[PreArrival] Error generating briefing:", error);
    // Fire-and-forget safe — never throw
  }
}
