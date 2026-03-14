import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { z } from "zod";

export const invoicesRouter = Router();

const ORG_ID = "default-org";

const createInvoiceSchema = z.object({
  jobId: z.string().cuid(),
  customerId: z.string().cuid(),
  description: z.string().min(1),
  amount: z.number().positive(),
  status: z.enum(["pending", "paid", "overdue"]).default("pending"),
  dueDate: z.string().datetime(),
});

const updateInvoiceSchema = createInvoiceSchema.partial();

// GET /api/invoices
invoicesRouter.get("/", async (_req, res) => {
  try {
    const invoices = await prisma.invoice.findMany({
      where: { organizationId: ORG_ID },
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
invoicesRouter.get("/revenue", async (_req, res) => {
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
            organizationId: ORG_ID,
            status: "paid",
            issuedDate: { gte: monthDate, lt: monthEnd },
          },
          _sum: { amount: true },
        }),
        prisma.job.count({
          where: {
            organizationId: ORG_ID,
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
        organizationId: ORG_ID,
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
      where: { id: req.params.id },
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
