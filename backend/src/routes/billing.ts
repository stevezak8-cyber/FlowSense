import { Router } from "express";
import type { RequestHandler } from "express";
import crypto from "crypto";
import { prisma } from "../lib/prisma.js";
import { stripe, getPriceId } from "../services/stripe.js";

export const billingRouter = Router();

// POST /billing/portal — create a Stripe billing portal session
billingRouter.post("/portal", async (req, res) => {
  const user = req.user!;

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
      return_url: `${process.env.FRONTEND_URL ?? "http://localhost:5173"}/office/settings`,
    });
    return res.json({ url: session.url });
  } catch {
    return res.status(503).json({ error: "Billing portal temporarily unavailable" });
  }
});

// POST /billing/upgrade — upgrade org subscription plan (admin only)
billingRouter.post("/upgrade", async (req, res) => {
  const user = req.user!;

  const { organizationId, plan } = req.body as { organizationId?: string; plan?: string };

  if (!organizationId || !plan) {
    return res.status(400).json({ error: "organizationId and plan are required" });
  }

  if (user.role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }

  if (!["shop", "fleet", "enterprise"].includes(plan)) {
    return res.status(400).json({ error: "plan must be one of: shop, fleet, enterprise" });
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

// GET /billing/connect — start Stripe Connect OAuth
billingRouter.get("/connect", async (req, res) => {
  const user = req.user!
  if (!["office", "admin"].includes(user.role)) {
    return res.status(403).json({ error: "Office access required" })
  }

  if (!stripe) return res.status(503).json({ error: "Stripe not configured" })

  const clientId = process.env.STRIPE_CONNECT_CLIENT_ID
  const stateSecret = process.env.STRIPE_STATE_SECRET
  const apiUrl = process.env.API_URL

  if (!clientId || !stateSecret || !apiUrl) {
    return res.status(503).json({ error: "Stripe Connect not configured" })
  }

  const organizationId = req.user!.organizationId
  const hmac = crypto.createHmac("sha256", stateSecret).update(organizationId).digest("hex")
  const state = `${organizationId}.${hmac}`

  const url = stripe.oauth.authorizeUrl({
    response_type: "code",
    client_id: clientId,
    scope: "read_write",
    state,
    redirect_uri: `${apiUrl}/api/billing/connect/callback`,
  })

  return res.json({ url })
})

// Exported for public mounting in index.ts (callback has no user session)
export const billingConnectCallbackHandler: RequestHandler = async (req, res) => {
  const frontendUrl = process.env.FRONTEND_URL ?? ""
  const errorRedirect = `${frontendUrl}/office/settings?connect=error`
  const stateSecret = process.env.STRIPE_STATE_SECRET

  const { code, state, error } = req.query as Record<string, string>

  if (error) {
    console.error("[Connect callback] Stripe OAuth error:", error)
    return res.redirect(errorRedirect)
  }

  if (!stateSecret || !state) {
    console.error("[Connect callback] Missing state or secret")
    return res.redirect(errorRedirect)
  }

  const dotIndex = state.lastIndexOf(".")
  if (dotIndex === -1) {
    console.error("[Connect callback] Malformed state token")
    return res.redirect(errorRedirect)
  }
  const organizationId = state.slice(0, dotIndex)
  const receivedHmac = state.slice(dotIndex + 1)
  const expectedHmac = crypto.createHmac("sha256", stateSecret).update(organizationId).digest("hex")

  let valid: boolean
  try {
    valid = crypto.timingSafeEqual(Buffer.from(receivedHmac, "hex"), Buffer.from(expectedHmac, "hex"))
  } catch {
    valid = false
  }
  if (!valid) {
    console.error("[Connect callback] Invalid state HMAC")
    return res.redirect(errorRedirect)
  }

  const org = await prisma.organization.findUnique({ where: { id: organizationId } })
  if (!org) {
    console.error("[Connect callback] Org not found:", organizationId)
    return res.redirect(errorRedirect)
  }

  if (!stripe) {
    console.error("[Connect callback] Stripe not configured")
    return res.redirect(errorRedirect)
  }

  let response: { stripe_user_id: string }
  try {
    response = await stripe.oauth.token({ grant_type: "authorization_code", code }) as { stripe_user_id: string }
  } catch (err) {
    console.error("[Connect callback] Token exchange failed:", err)
    return res.redirect(errorRedirect)
  }

  await prisma.organization.update({
    where: { id: organizationId },
    data: {
      stripeConnectAccountId: response.stripe_user_id,
      stripeConnectOnboarded: true,
    },
  })

  return res.redirect(`${frontendUrl}/office/settings?connect=success`)
}

// Also register in router (for tests that drive the router directly)
billingRouter.get("/connect/callback", billingConnectCallbackHandler)
