import { Router, type Request, type Response } from "express";
import Stripe from "stripe";
import { prisma } from "../lib/prisma.js";
import { sendDepositReceiptEmail, sendInvoiceReceiptEmail } from "../services/email.js";
import { notifyOfficeDepositReceived, notifyOfficePaymentReceived } from "../services/org-notifications.js";
import { createNotification } from "../services/create-notification.js";

export const webhooksRouter = Router();

// POST /webhooks/stripe
// Receives Stripe events and updates local state.
// IMPORTANT: this route must receive the raw (unparsed) body — mount it
// BEFORE express.json() in index.ts using express.raw({ type: "application/json" }).
webhooksRouter.post("/stripe", async (req: Request, res: Response) => {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripeKey) {
    return res.status(503).json({ error: "Stripe not configured" });
  }

  const stripe = new Stripe(stripeKey, { apiVersion: "2026-04-22.dahlia" });

  // If a webhook secret is configured, verify the signature.
  // In development without a secret, we skip verification (useful for Stripe CLI testing).
  let event: Stripe.Event;

  if (webhookSecret) {
    const sig = req.headers["stripe-signature"];
    if (!sig) {
      return res.status(400).json({ error: "Missing stripe-signature header" });
    }
    try {
      event = stripe.webhooks.constructEvent(req.body as Buffer, sig, webhookSecret);
    } catch (err) {
      console.error("Stripe webhook signature verification failed:", err);
      return res.status(400).json({ error: "Invalid signature" });
    }
  } else {
    // No secret configured — parse body directly (dev/testing only)
    try {
      event = JSON.parse((req.body as Buffer).toString()) as Stripe.Event;
    } catch {
      return res.status(400).json({ error: "Invalid JSON" });
    }
  }

  // Handle relevant events
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const { invoiceId, estimateId, jobId, organizationId } = session.metadata ?? {};

      // Handle invoice payment (existing path)
      if (invoiceId) {
        try {
          await prisma.invoice.update({
            where: { id: invoiceId },
            data: { status: "paid" },
          });
          console.log(`Invoice ${invoiceId} marked as paid via Stripe`);
        } catch (err) {
          console.error(`Failed to mark invoice ${invoiceId} as paid:`, err);
          return res.status(500).json({ error: "Failed to update invoice" });
        }

        // Notifications — fire-and-forget; failures must not affect webhook response
        try {
          const [paidInvoice, org] = await Promise.all([
            prisma.invoice.findUnique({
              where: { id: invoiceId },
              include: { customer: { select: { name: true, email: true } } },
            }),
            prisma.organization.findUnique({
              where: { id: organizationId },
              select: { name: true, phone: true, email: true },
            }),
          ])

          if (paidInvoice && org) {
            sendInvoiceReceiptEmail({
              invoiceId: paidInvoice.id,
              amount: paidInvoice.amount,
              description: paidInvoice.description,
              issuedDate: paidInvoice.issuedDate,
              customerName: paidInvoice.customer.name,
              customerEmail: paidInvoice.customer.email,
              orgName: org.name,
              orgContactPhone: org.phone,
              orgContactEmail: org.email,
            }).catch((e: unknown) => console.error("[Webhook] Invoice receipt email failed:", e))

            notifyOfficePaymentReceived({
              invoiceId: paidInvoice.id,
              amount: paidInvoice.amount,
              description: paidInvoice.description,
              customerName: paidInvoice.customer.name,
              orgId: organizationId,
            }).catch((e: unknown) => console.error("[Webhook] Office payment notification failed:", e))

            createNotification({
              organizationId,
              type: "payment.received",
              title: "Payment Received",
              body: `$${paidInvoice.amount.toFixed(2)} from ${paidInvoice.customer.name}`,
              link: `/office/revenue`,
            }).catch(console.error)
          }
        } catch (e) {
          console.error("[Webhook] Failed to fetch invoice/org for notifications:", e)
          // intentionally do not return error — invoice is already marked paid
        }
      }

      // Handle estimate deposit (new path)
      if (estimateId && jobId) {
        const estimate = await prisma.estimate.findUnique({
          where: { id: estimateId },
          select: { id: true, depositPaidAt: true, organizationId: true },
        });
        if (estimate && !estimate.depositPaidAt) {
          if (estimate.organizationId !== organizationId) {
            console.error("[Webhook] Org mismatch on estimate deposit", estimateId);
          } else {
            try {
              await prisma.estimate.update({
                where: { id: estimateId },
                data: { depositPaidAt: new Date() },
              });
              await prisma.job.update({
                where: { id: jobId },
                data: { status: "confirmed" },
              });
              sendDepositReceiptEmail(estimateId).catch((err: unknown) =>
                console.error("[Webhook] Receipt email failed:", err)
              );
              notifyOfficeDepositReceived(estimateId).catch((err: unknown) =>
                console.error("[Webhook] Office notification failed:", err)
              );
            } catch (err) {
              console.error("[Webhook] Failed to process deposit for estimate", estimateId, err);
              // Return 200 so Stripe doesn't retry — idempotency guard handles any partial state
            }
          }
        }
      }

      break;
    }

    case "checkout.session.expired": {
      // Session expired without payment — nothing to update, just acknowledge
      break;
    }

    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const org = await prisma.organization.findFirst({
        where: { stripeCustomerId: sub.customer as string },
      });
      if (!org) break;

      const priceId = sub.items.data[0]?.price?.id;
      let plan: string = org.plan;
      if (priceId === process.env.STRIPE_PRICE_ID_SHOP) plan = sub.status === "trialing" ? "trial" : "shop";
      else if (priceId === process.env.STRIPE_PRICE_ID_FLEET) plan = "fleet";
      else if (priceId === process.env.STRIPE_PRICE_ID_ENTERPRISE) plan = "enterprise";

      const trialEnd = sub.trial_end ? new Date(sub.trial_end * 1000) : null;

      await prisma.organization.update({
        where: { id: org.id },
        data: {
          plan,
          stripeSubscriptionId: sub.id,
          ...(trialEnd ? { trialEndsAt: trialEnd } : {}),
        },
      });
      break;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const org = await prisma.organization.findFirst({
        where: { stripeCustomerId: sub.customer as string },
      });
      if (!org || org.plan === "cancelled") break;
      await prisma.organization.update({ where: { id: org.id }, data: { plan: "cancelled" } });
      break;
    }

    case "invoice.payment_succeeded": {
      const inv = event.data.object as Stripe.Invoice;
      // Only handle subscription invoices — customer job invoices handled by checkout.session.completed
      if (!inv.parent?.subscription_details?.subscription) break;
      const org = await prisma.organization.findFirst({
        where: { stripeCustomerId: inv.customer as string },
      });
      if (!org) break;

      const priceId = (inv.lines?.data[0] as { price?: { id: string } })?.price?.id;
      let plan = org.plan;
      if (priceId === process.env.STRIPE_PRICE_ID_SHOP) plan = "shop";
      else if (priceId === process.env.STRIPE_PRICE_ID_FLEET) plan = "fleet";
      else if (priceId === process.env.STRIPE_PRICE_ID_ENTERPRISE) plan = "enterprise";

      if (plan !== org.plan) {
        await prisma.organization.update({ where: { id: org.id }, data: { plan } });
      }
      break;
    }

    case "invoice.payment_failed": {
      const inv = event.data.object as Stripe.Invoice;
      if (!inv.parent?.subscription_details?.subscription) break;
      const failedOrg = await prisma.organization.findFirst({
        where: { stripeCustomerId: inv.customer as string },
      });
      if (!failedOrg) break;
      await prisma.organization.update({
        where: { id: failedOrg.id },
        data: { plan: "payment_failed" },
      });
      createNotification({
        organizationId: failedOrg.id,
        type: "payment.failed",
        title: "Payment Failed",
        body: "A subscription payment failed. Update billing to restore access.",
        link: `/office/settings`,
      }).catch(console.error)
      console.warn(`[webhook] Payment failed — org ${failedOrg.id} plan set to payment_failed`);
      break;
    }

    default:
      // Unhandled event type — acknowledge receipt so Stripe doesn't retry
      break;
  }

  res.json({ received: true });
});
