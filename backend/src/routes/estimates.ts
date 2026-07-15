import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { generateEstimate } from "../services/estimate-ai.js";
import { sendEmail } from "../services/email.js";
import { sendEstimateReadySms } from "../services/sms.js";
import { stripe } from "../services/stripe.js";
import { z } from "zod";

export const estimatesRouter = Router();
export const publicEstimatesRouter = Router();

const approveSchema = z.object({
  tier: z.enum(["good", "better", "best"]),
  signatureData: z.string().min(1),
});

// ─── Auth-protected routes (estimatesRouter) ──────────────────────────────────

// POST /api/estimates/generate
estimatesRouter.post("/generate", async (req, res) => {
  const { jobId } = req.body;
  if (!jobId) return res.status(400).json({ error: "jobId is required" });

  const result = await generateEstimate(jobId, req.user!.organizationId);

  if ("error" in result) {
    if (result.error === "not_configured") return res.status(503).json({ error: "AI not configured" });
    if (result.error === "job_not_found") return res.status(404).json({ error: "Job not found" });
    return res.status(500).json({ error: "Failed to generate estimate" });
  }

  const estimate = await prisma.estimate.findFirst({
    where: { id: result.estimateId },
    include: { lines: { include: { pricebookItem: true } } },
  });

  res.status(201).json(estimate);
});

// GET /api/estimates/:id
estimatesRouter.get("/:id", async (req, res) => {
  const estimate = await prisma.estimate.findFirst({
    where: { id: req.params.id, organizationId: req.user!.organizationId },
    include: { lines: { include: { pricebookItem: true } } },
  });
  if (!estimate) return res.status(404).json({ error: "Estimate not found" });
  res.json(estimate);
});

// PATCH /api/estimates/:id
estimatesRouter.patch("/:id", async (req, res) => {
  const estimate = await prisma.estimate.findFirst({
    where: { id: req.params.id, organizationId: req.user!.organizationId },
  });
  if (!estimate) return res.status(404).json({ error: "Estimate not found" });
  if (estimate.status !== "draft") return res.status(400).json({ error: "Only draft estimates can be edited" });

  const linesSchema = z.array(
    z.object({
      pricebookItemId: z.string().nullable().optional(),
      tier: z.enum(["good", "better", "best"]),
      name: z.string().min(1),
      quantity: z.number().positive(),
      unitPrice: z.number().nonnegative(),
      locked: z.boolean().optional(),
      source: z.string().optional(),
    })
  );

  const parsed = linesSchema.safeParse(req.body.lines);
  if (!parsed.success) return res.status(400).json({ error: "Invalid lines", details: parsed.error.flatten() });

  await prisma.estimateLine.deleteMany({ where: { estimateId: req.params.id, locked: false } });
  await prisma.estimateLine.createMany({
    data: parsed.data.map((l) => ({ ...l, estimateId: req.params.id })),
  });

  const updated = await prisma.estimate.findFirst({
    where: { id: req.params.id },
    include: { lines: true },
  });
  res.json(updated);
});

// POST /api/estimates/:id/send
estimatesRouter.post("/:id/send", async (req, res) => {
  const estimate = await prisma.estimate.findFirst({
    where: { id: req.params.id, organizationId: req.user!.organizationId },
    include: { job: { include: { customer: true } } },
  });
  if (!estimate) return res.status(404).json({ error: "Estimate not found" });

  const sentAt = new Date();
  const expiresAt = new Date(sentAt.getTime() + 48 * 60 * 60 * 1000);

  const updated = await prisma.estimate.update({
    where: { id: req.params.id },
    data: { status: "sent", sentAt, expiresAt },
  });

  const portalUrl = `${process.env.FRONTEND_URL ?? "http://localhost:5173"}/customer/estimates/${(estimate as any).token}`;

  try {
    await sendEmail({
      to: (estimate as any).job.customer.email ?? "",
      subject: `Your estimate from FlowSense — expires in 48 hours`,
      html: `<p>Hi ${(estimate as any).job.customer.name},</p>
<p>Your estimate for <strong>${(estimate as any).job.title}</strong> is ready to review.</p>
<p><a href="${portalUrl}">View Your Estimate</a></p>
<p>This link expires in 48 hours.</p>`,
    });
  } catch {
    console.error("[Estimates] Failed to send estimate email");
  }

  sendEstimateReadySms(req.params.id).catch(console.error)

  res.json(updated);
});

// ─── Public token routes (publicEstimatesRouter) ──────────────────────────────
// Mounted at /api/estimates/token — routes here are relative (/:token not /token/:token)

publicEstimatesRouter.get("/:token", async (req, res) => {
  const estimate = await prisma.estimate.findFirst({
    where: { token: req.params.token },
    include: {
      lines: { include: { pricebookItem: true } },
      job: { select: { title: true, address: true } },
    },
  });

  if (!estimate) return res.status(404).json({ error: "Estimate not found" });

  if (estimate.expiresAt && estimate.expiresAt < new Date()) {
    return res.status(410).json({ error: "This estimate has expired — please contact us to request a new one." });
  }

  res.json(estimate);
});

publicEstimatesRouter.post("/:token/approve", async (req, res) => {
  const estimate = await prisma.estimate.findFirst({
    where: { token: req.params.token },
    include: { lines: true },
  });

  if (!estimate) return res.status(404).json({ error: "Estimate not found" });
  if (estimate.status === "approved") return res.status(409).json({ error: "This estimate has already been approved." });
  if (estimate.expiresAt && estimate.expiresAt < new Date()) {
    return res.status(410).json({ error: "Estimate has expired." });
  }

  const parsed = approveSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid data", details: parsed.error.flatten() });

  const { tier, signatureData } = parsed.data;

  const org = await prisma.organization.findUnique({
    where: { id: estimate.organizationId },
    select: { estimateDepositThreshold: true, estimateDepositPercent: true },
  });

  const tierLines = estimate.lines.filter((l) => l.tier === tier);
  const total = tierLines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
  const depositAmount =
    org && total >= org.estimateDepositThreshold
      ? Math.round((total * org.estimateDepositPercent) / 100)
      : null;

  const updated = await prisma.estimate.update({
    where: { id: estimate.id },
    data: {
      status: "approved",
      selectedTier: tier,
      signatureData,
      signedAt: new Date(),
      approvedAt: new Date(),
      depositAmount,
    },
  });

  await prisma.job.update({
    where: { id: estimate.jobId },
    data: { status: "in_progress" },
  });

  res.json(updated);
});

publicEstimatesRouter.post("/:token/deposit", async (req, res) => {
  const { token } = req.params;

  type EstimateWithRelations = Awaited<ReturnType<typeof prisma.estimate.findUnique>> & {
    job: { title: string };
    organization: { stripeConnectAccountId: string | null; stripeConnectOnboarded: boolean };
  };

  const estimate = await prisma.estimate.findUnique({
    where: { token },
    include: {
      job: { select: { title: true } },
      organization: { select: { stripeConnectAccountId: true, stripeConnectOnboarded: true } },
    },
  }) as EstimateWithRelations | null;

  if (!estimate) return res.status(404).json({ error: "Estimate not found" });
  if (estimate.status !== "approved") return res.status(400).json({ error: "Estimate has not been approved" });
  if (estimate.depositPaidAt) return res.status(409).json({ error: "Deposit already paid" });
  if (!estimate.depositAmount) return res.status(400).json({ error: "No deposit required" });
  if (estimate.stripePaymentIntentId) return res.status(409).json({ error: "Payment already initiated" });
  if (!estimate.organization.stripeConnectOnboarded || !estimate.organization.stripeConnectAccountId) {
    return res.status(503).json({ error: "Payments not configured for this business" });
  }
  if (!stripe) return res.status(503).json({ error: "Stripe not configured" });

  const frontendUrl = process.env.FRONTEND_URL ?? "";
  const session = await stripe.checkout.sessions.create(
    {
      payment_method_types: ["card"],
      mode: "payment",
      line_items: [{
        price_data: {
          currency: "usd",
          product_data: { name: `Deposit — ${estimate.job.title}` },
          unit_amount: Math.round(estimate.depositAmount * 100),
        },
        quantity: 1,
      }],
      metadata: {
        estimateId: estimate.id,
        jobId: estimate.jobId,
        organizationId: estimate.organizationId,
      },
      success_url: `${frontendUrl}/customer/estimates/${token}?deposit=paid`,
      cancel_url: `${frontendUrl}/customer/estimates/${token}?deposit=cancelled`,
    },
    { stripeAccount: estimate.organization.stripeConnectAccountId }
  );

  await prisma.estimate.update({
    where: { id: estimate.id },
    data: { stripePaymentIntentId: session.id },
  });

  return res.json({ url: session.url });
});
