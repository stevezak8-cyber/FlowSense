import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "../lib/prisma.js";

// Silent skip pattern — consistent with pre-arrival.ts and email.ts
const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.log("[CompletionAI] Skipped — no ANTHROPIC_API_KEY set");
}

const anthropic = apiKey ? new Anthropic({ apiKey }) : null;

interface TechInput {
  actionsTaken: string;
  partsUsed: string[];
  notes?: string;
}

type CompletionResult =
  | { summary: string }
  | { error: "not_configured" }
  | { error: "failed" };

export async function generateCompletionSummary(
  jobId: string,
  techInput: TechInput
): Promise<CompletionResult> {
  if (!anthropic) return { error: "not_configured" };

  try {
    const job = await prisma.job.findFirst({
      where: { id: jobId },
      include: { customer: true },
    });
    if (!job) {
      console.error(`[CompletionAI] Job ${jobId} not found`);
      return { error: "failed" };
    }

    const systemPrompt =
      "You are an HVAC service documentation assistant. Generate a concise, professional 2-3 sentence summary of the completed service call. The summary should be suitable for customer-facing records and internal documentation. Write in past tense, be specific about what was done, and mention any parts replaced.";

    const userPrompt = `## Technician's Input
- Actions taken: ${techInput.actionsTaken}
- Parts used: ${techInput.partsUsed.length > 0 ? techInput.partsUsed.join(", ") : "None"}${techInput.notes ? `\n- Additional notes: ${techInput.notes}` : ""}

## Job Details
- Equipment: ${job.equipmentType ?? "Not specified"}
- Service type: ${job.serviceType ?? "Not specified"}
- Symptoms: ${job.symptomSummary ?? "Not provided"}
- Priority: ${job.priority}${job.preArrivalNotes ? `\n\n## Pre-Arrival Assessment\n${job.preArrivalNotes}` : ""}

## Customer
- Name: ${job.customer.name}
- Address: ${job.customer.address}`;

    const response = await anthropic.messages.create({
      model: "claude-haiku-4-20250514",
      max_tokens: 400,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      console.error("[CompletionAI] No text content in response");
      return { error: "failed" };
    }

    return { summary: textBlock.text };
  } catch (error) {
    console.error("[CompletionAI] Error generating summary:", error);
    return { error: "failed" };
  }
}
