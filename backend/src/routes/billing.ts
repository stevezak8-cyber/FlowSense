import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { stripe, getPriceId } from "../services/stripe.js";
import type { AuthRequest } from "../middleware/types.js";

export const billingRouter = Router();

// POST /billing/portal — create a Stripe billing portal session
billingRouter.post("/portal", async (req, res) => {
  const user = (req as AuthRequest).user;

  const org = await prisma.organization.findUnique({ where: { id: user.organizationId } });

  if (!stripe) {
    return res.status(503).json({ error: "Stripe not configured" });
  }

  if (!org?.stripeCustomerId) {
    return res.status(404).json({ error: "No billing account found" });
  }

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: org.stripeCustomerId,
      return_url: "http://localhost:5173/office/settings",
    });
    return res.json({ url: session.url });
  } catch {
    return res.status(503).json({ error: "Billing portal temporarily unavailable" });
  }
});

// POST /billing/upgrade — upgrade org subscription plan (admin only)
billingRouter.post("/upgrade", async (req, res) => {
  const user = (req as AuthRequest).user;

  const { organizationId, plan } = req.body as { organizationId?: string; plan?: string };

  if (!organizationId || !plan) {
    return res.status(400).json({ error: "organizationId and plan are required" });
  }

  if (user.role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }

  const org = await prisma.organization.findUnique({ where: { id: organizationId } });

  if (!stripe) {
    return res.status(503).json({ error: "Stripe not configured" });
  }

  if (!org?.stripeSubscriptionId) {
    return res.status(404).json({ error: "No active subscription found" });
  }

  const priceId = getPriceId(plan);
  const sub = await stripe.subscriptions.retrieve(org.stripeSubscriptionId);
  await stripe.subscriptions.update(org.stripeSubscriptionId, {
    items: [{ id: sub.items.data[0].id, price: priceId }],
  });

  await prisma.organization.update({
    where: { id: organizationId },
    data: { plan },
  });

  return res.json({ success: true, plan });
});
