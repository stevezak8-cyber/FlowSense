import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { z } from "zod";

export const customersRouter = Router();

const createCustomerSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().min(1),
  address: z.string().min(1),
  addressLine2: z.string().optional(),
  city: z.string().min(1),
  state: z.string().min(1),
  postalCode: z.string().min(1),
  notes: z.string().optional(),
});

const updateCustomerSchema = createCustomerSchema.partial();

const ORG_ID = "default-org";

customersRouter.get("/", async (req, res) => {
  try {
    const q = (req.query.q as string)?.trim();
    const customers = await prisma.customer.findMany({
      where: {
        organizationId: ORG_ID,
        ...(q && {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { phone: { contains: q } },
            { address: { contains: q, mode: "insensitive" } },
          ],
        }),
      },
      orderBy: { name: "asc" },
      take: 100,
    });
    res.json(customers);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Failed to list customers" });
  }
});

customersRouter.get("/:id", async (req, res) => {
  try {
    const customer = await prisma.customer.findFirst({
      where: { id: req.params.id, organizationId: ORG_ID },
      include: { jobs: { take: 20, orderBy: { scheduledAt: "desc" } } },
    });
    if (!customer) return res.status(404).json({ error: "Customer not found" });
    res.json(customer);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Failed to get customer" });
  }
});

customersRouter.post("/", async (req, res) => {
  const parsed = createCustomerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  try {
    const customer = await prisma.customer.create({
      data: {
        organizationId: ORG_ID,
        ...parsed.data,
      },
    });
    res.status(201).json(customer);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Failed to create customer" });
  }
});

customersRouter.patch("/:id", async (req, res) => {
  const parsed = updateCustomerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  try {
    const customer = await prisma.customer.update({
      where: { id: req.params.id },
      data: parsed.data,
    });
    res.json(customer);
  } catch (e) {
    if ((e as { code?: string })?.code === "P2025") {
      return res.status(404).json({ error: "Customer not found" });
    }
    res.status(500).json({ error: e instanceof Error ? e.message : "Failed to update customer" });
  }
});
