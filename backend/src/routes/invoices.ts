import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { z } from "zod";
import Stripe from "stripe";
import { generateInvoicePdf } from "../services/invoice-pdf.js";
import { sendEmail } from "../services/email.js";

export const invoicesRouter = Router();

const createInvoiceSchema = z.object({
  jobId: z.string().min(1),
  customerId: z.string().min(1),
  description: z.string().min(1),
  amount: z.number().positive(),
  status: z.enum(["pending", "paid", "overdue"]).default("pending"),
  dueDate: z.string().datetime(),
});

const updateInvoiceSchema = createInvoiceSchema.partial();

// GET /api/invoices
invoicesRouter.get("/", async (req, res) => {
  try {
    const { role, customerId: myCustomerId } = req.user!;
    // Customers only see their own invoices; technicians/office see all
    const roleFilter = role === "customer" && myCustomerId
      ? { customerId: myCustomerId }
      : {};

    const invoices = await prisma.invoice.findMany({
      where: { organizationId: req.user!.organizationId, ...roleFilter },
      include: {
        customer: { select: { id: true, name: true } },
        job: { select: { id: true, equipmentType: true, symptomSummary: true } },
      },
      orderBy: { issuedDate: "desc" },
    });
    res.json(invoices);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Failed to list invoices" });
  }
});

// GET /api/invoices/revenue - monthly revenue data for charts
invoicesRouter.get("/revenue", async (req, res) => {
  try {
    const now = new Date();
    const months: { month: string; revenue: number; jobs: number }[] = [];

    for (let i = 5; i >= 0; i--) {
      const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      const monthName = monthDate.toLocaleString("default", { month: "short" });

      const [revenueResult, jobCount] = await Promise.all([
        prisma.invoice.aggregate({
          where: {
            organizationId: req.user!.organizationId,
            status: "paid",
            issuedDate: { gte: monthDate, lt: monthEnd },
          },
          _sum: { amount: true },
        }),
        prisma.job.count({
          where: {
            organizationId: req.user!.organizationId,
            status: "completed",
            completedAt: { gte: monthDate, lt: monthEnd },
          },
        }),
      ]);

      months.push({
        month: monthName,
        revenue: revenueResult._sum.amount ?? 0,
        jobs: jobCount,
      });
    }

    res.json(months);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Failed to get revenue data" });
  }
});

// POST /api/invoices
invoicesRouter.post("/", async (req, res) => {
  const parsed = createInvoiceSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  try {
    const invoice = await prisma.invoice.create({
      data: {
        organizationId: req.user!.organizationId,
        jobId: parsed.data.jobId,
        customerId: parsed.data.customerId,
        description: parsed.data.description,
        amount: parsed.data.amount,
        status: parsed.data.status,
        dueDate: new Date(parsed.data.dueDate),
      },
      include: {
        customer: { select: { id: true, name: true } },
        job: { select: { id: true, equipmentType: true } },
      },
    });
    res.status(201).json(invoice);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Failed to create invoice" });
  }
});

// POST /api/invoices/:id/payment-link — create a Stripe Checkout session for a pending invoice
invoicesRouter.post("/:id/payment-link", async (req, res) => {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return res.status(503).json({ error: "Payment processing is not configured" });
  }

  try {
    const invoice = await prisma.invoice.findFirst({
      where: { id: req.params.id, organizationId: req.user!.organizationId },
      include: { customer: { select: { name: true, email: true } } },
    });

    if (!invoice) return res.status(404).json({ error: "Invoice not found" });
    if (invoice.status === "paid") return res.status(400).json({ error: "Invoice is already paid" });

    const stripe = new Stripe(stripeKey, { apiVersion: "2026-04-22.dahlia" });

    const appUrl = process.env.APP_URL ?? "http://localhost:5173";

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: Math.round(invoice.amount * 100),
            product_data: {
              name: invoice.description,
              metadata: { invoiceId: invoice.id },
            },
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      customer_email: req.user!.role === "customer" ? invoice.customer.email ?? undefined : undefined,
      metadata: { invoiceId: invoice.id, organizationId: req.user!.organizationId },
      success_url: `${appUrl}/customer?payment=success&invoice=${invoice.id}`,
      cancel_url: `${appUrl}/customer/invoices`,
    });

    res.json({ url: session.url });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Failed to create payment link" });
  }
});

// GET /:id/pdf — download PDF
invoicesRouter.get("/:id/pdf", async (req, res) => {
  try {
    const invoice = await prisma.invoice.findFirst({
      where: { id: req.params.id, organizationId: req.user!.organizationId },
      include: {
        organization: { select: { name: true } },
        customer: { select: { name: true, address: true, city: true, state: true, postalCode: true } },
        job: { select: { equipmentType: true, symptomSummary: true } },
      },
    })
    if (!invoice) return res.status(404).json({ error: "Invoice not found" })

    const buffer = await generateInvoicePdf(invoice)
    const filename = `invoice-${invoice.id.slice(-8)}.pdf`
    res.setHeader("Content-Type", "application/pdf")
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`)
    res.send(buffer)
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Failed to generate PDF" })
  }
})

// POST /:id/send — email PDF to customer (office only)
invoicesRouter.post("/:id/send", async (req, res) => {
  if (req.user!.role !== "office") return res.status(403).json({ error: "Forbidden" })
  try {
    const invoice = await prisma.invoice.findFirst({
      where: { id: req.params.id, organizationId: req.user!.organizationId },
      include: {
        organization: { select: { name: true } },
        customer: { select: { name: true, address: true, city: true, state: true, postalCode: true, email: true } },
        job: { select: { equipmentType: true, symptomSummary: true } },
      },
    })
    if (!invoice) return res.status(404).json({ error: "Invoice not found" })
    if (!invoice.customer.email) return res.status(400).json({ error: "Customer has no email address" })

    const buffer = await generateInvoicePdf(invoice)
    const filename = `invoice-${invoice.id.slice(-8)}.pdf`

    await sendEmail({
      to: invoice.customer.email,
      subject: `Invoice from ${invoice.organization.name}`,
      html: `<p>Hi ${invoice.customer.name},</p><p>Please find your invoice attached. Thank you for your business.</p><p>— ${invoice.organization.name}</p>`,
      attachments: [{ filename, content: buffer, contentType: "application/pdf" }],
    })

    res.json({ sent: true })
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Failed to send invoice" })
  }
})

// PATCH /api/invoices/:id
invoicesRouter.patch("/:id", async (req, res) => {
  const parsed = updateInvoiceSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  try {
    const data: Record<string, unknown> = { ...parsed.data };
    if (data.dueDate) data.dueDate = new Date(data.dueDate as string);

    const invoice = await prisma.invoice.update({
      where: { id: req.params.id, organizationId: req.user!.organizationId },
      data,
      include: {
        customer: { select: { id: true, name: true } },
      },
    });
    res.json(invoice);
  } catch (e) {
    if ((e as { code?: string })?.code === "P2025") {
      return res.status(404).json({ error: "Invoice not found" });
    }
    res.status(500).json({ error: e instanceof Error ? e.message : "Failed to update invoice" });
  }
});
