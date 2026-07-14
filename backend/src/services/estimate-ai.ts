import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "../lib/prisma.js";
import { AI_MODEL } from "../lib/ai-config.js";

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.log("[EstimateAI] Skipped — no ANTHROPIC_API_KEY set");
}

const anthropic = apiKey ? new Anthropic({ apiKey }) : null;

// ─── Pricebook Seeding ───────────────────────────────────────────────────────

export async function seedPricebook(organizationId: string): Promise<void> {
  if (!anthropic) return;

  const existing = await prisma.pricebookItem.count({ where: { organizationId } });
  if (existing > 0) return;

  try {
    const response = await anthropic.messages.create({
      model: AI_MODEL,
      max_tokens: 4096,
      system: `You are an HVAC business consultant. Generate a starter pricebook for a new HVAC company.
Return a JSON array of exactly 40 items covering common HVAC services. Each item must have:
- name: string (clear service name)
- description: string (brief description)
- category: "cooling" | "heating" | "parts" | "labor" | "maintenance"
- unit: string (e.g. "per visit", "each", "per lb", "per hour")
- unitPrice: number (typical market price in USD, whole dollars)

Cover these categories:
- Cooling (8 items): refrigerant recharge, capacitor replacement, coil cleaning, fan motor replacement, compressor replacement, refrigerant leak detection, condenser cleaning, evaporator coil replacement
- Heating (8 items): heat exchanger inspection, igniter replacement, flame sensor replacement, gas valve replacement, blower motor replacement, furnace tune-up, pilot light service, draft inducer motor
- Parts (8 items): R-410A refrigerant per lb, run capacitor, start capacitor, contactor, 1-inch filter, 4-inch filter, belt, thermostat
- Labor (8 items): diagnostic fee, standard labor per hour, after-hours labor per hour, travel fee, emergency dispatch fee, system commissioning, permit fee allowance, warranty callback
- Maintenance (8 items): AC tune-up, furnace tune-up, full system inspection, duct cleaning, dryer vent cleaning, IAQ inspection, UV light installation, smart thermostat installation

Return ONLY valid JSON array, no markdown, no explanation.`,
      messages: [{ role: "user", content: "Generate the HVAC pricebook." }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const items = JSON.parse(text) as Array<{
      name: string;
      description: string;
      category: string;
      unit: string;
      unitPrice: number;
    }>;

    await prisma.pricebookItem.createMany({
      data: items.map((item) => ({
        ...item,
        organizationId,
        source: "ai",
        locked: false,
        active: true,
      })),
    });

    console.log(`[EstimateAI] Seeded ${items.length} pricebook items for org ${organizationId}`);
  } catch (err) {
    console.error("[EstimateAI] Seeding failed:", err);
  }
}

// ─── Estimate Generation ─────────────────────────────────────────────────────

type EstimateResult =
  | { estimateId: string }
  | { error: "not_configured" }
  | { error: "failed" }
  | { error: "job_not_found" };

export async function generateEstimate(jobId: string, organizationId: string): Promise<EstimateResult> {
  if (!anthropic) return { error: "not_configured" };

  const job = await prisma.job.findFirst({
    where: { id: jobId, organizationId },
    include: {
      customer: {
        include: {
          jobs: {
            orderBy: { createdAt: "desc" },
            take: 5,
            select: { title: true, notes: true, completedAt: true },
          },
        },
      },
    },
  });

  if (!job) return { error: "job_not_found" };

  const pricebookItems = await prisma.pricebookItem.findMany({
    where: { organizationId, active: true },
    orderBy: { category: "asc" },
  });

  const pricebookJson = JSON.stringify(
    pricebookItems.map((i) => ({ id: i.id, name: i.name, category: i.category, unitPrice: i.unitPrice, unit: i.unit }))
  );

  const jobHistory = (job.customer as any).jobs
    .map((j: any) => `- ${j.title}${j.notes ? `: ${j.notes}` : ""}`)
    .join("\n");

  try {
    const response = await anthropic.messages.create({
      model: AI_MODEL,
      max_tokens: 4096,
      system: `You are an expert HVAC estimator. Given a job description and a pricebook, generate a Good/Better/Best estimate.

TIER LOGIC:
- For REPAIR jobs (refrigerant, electrical faults, leaks): Good = fix now. Better = fix + address wear items. Best = fix + full tune-up.
- For REPLACEMENT jobs (motors, compressors, coils): Good = OEM-equivalent part, 90-day warranty. Better = OEM part, 1-year warranty. Best = premium part + 2-year warranty.

PRICEBOOK: ${pricebookJson}

Return a JSON object with this structure:
{
  "good": [{ "pricebookItemId": "...", "quantity": 1, "name": "...", "unitPrice": 0 }],
  "better": [{ "pricebookItemId": "...", "quantity": 1, "name": "...", "unitPrice": 0 }],
  "best": [{ "pricebookItemId": "...", "quantity": 1, "name": "...", "unitPrice": 0 }]
}

Rules:
- Use pricebookItemId from the pricebook when available; set to null for items not in the pricebook
- name and unitPrice must match the pricebook item exactly when pricebookItemId is set
- Each tier must build on the previous (better includes everything in good, best includes everything in better)
- Include 2-6 line items per tier
- If pricebook is empty, use reasonable HVAC market prices and set pricebookItemId to null

Return ONLY valid JSON, no markdown.`,
      messages: [
        {
          role: "user",
          content: `Job: ${(job as any).title}
Notes: ${(job as any).notes ?? "None"}
Customer equipment history:\n${jobHistory || "No prior history"}`,
        },
      ],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "{}";
    const tiers = JSON.parse(text) as {
      good: Array<{ pricebookItemId: string | null; quantity: number; name: string; unitPrice: number }>;
      better: Array<{ pricebookItemId: string | null; quantity: number; name: string; unitPrice: number }>;
      best: Array<{ pricebookItemId: string | null; quantity: number; name: string; unitPrice: number }>;
    };

    const estimate = await prisma.estimate.create({
      data: {
        organizationId,
        jobId,
        status: "draft",
        lines: {
          create: [
            ...tiers.good.map((l) => ({ ...l, tier: "good", source: "ai", locked: false })),
            ...tiers.better.map((l) => ({ ...l, tier: "better", source: "ai", locked: false })),
            ...tiers.best.map((l) => ({ ...l, tier: "best", source: "ai", locked: false })),
          ],
        },
      },
      include: { lines: true },
    });

    return { estimateId: estimate.id };
  } catch (err) {
    console.error("[EstimateAI] Generation failed:", err);
    return { error: "failed" };
  }
}
