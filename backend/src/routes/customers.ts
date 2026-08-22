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

customersRouter.get("/", async (req, res) => {
  // Customers should not browse the full customer list
  if (req.user!.role === "customer") {
    return res.status(403).json({ error: "Forbidden" });
  }
  try {
    const q = (req.query.q as string)?.trim();
    const customers = await prisma.customer.findMany({
      where: {
        organizationId: req.user!.organizationId,
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

// --- Customer self-service routes (must come before /:id) ---

const CUSTOMER_SELF_SELECT = {
  id: true,
  name: true,
  phone: true,
  email: true,
  address: true,
  smsOptOut: true,
  emailOptOut: true,
};

customersRouter.get("/me", async (req, res) => {
  const user = req.user!;
  if (user.role !== "customer" || !user.customerId) {
    return res.status(403).json({ error: "Forbidden" });
  }
  try {
    const customer = await prisma.customer.findUnique({
      where: { id: user.customerId },
      select: CUSTOMER_SELF_SELECT,
    });
    if (!customer) return res.status(404).json({ error: "Not found" });
    res.json(customer);
  } catch (e) {
    res.status(500).json({ error: "Failed to load profile" });
  }
});

customersRouter.patch("/me", async (req, res) => {
  const user = req.user!;
  if (user.role !== "customer" || !user.customerId) {
    return res.status(403).json({ error: "Forbidden" });
  }
  const { name, phone, email, address, smsOptOut, emailOptOut } = req.body;
  const data: Record<string, unknown> = {};
  if (name !== undefined) data.name = String(name);
  if (phone !== undefined) {
    if (String(phone).trim().length < 10) return res.status(400).json({ error: "Phone must be at least 10 characters" });
    data.phone = String(phone);
  }
  if (email !== undefined) {
    if (!String(email).includes("@")) return res.status(400).json({ error: "Invalid email" });
    data.email = String(email);
  }
  if (address !== undefined) data.address = String(address);
  if (typeof smsOptOut === "boolean") data.smsOptOut = smsOptOut;
  if (typeof emailOptOut === "boolean") data.emailOptOut = emailOptOut;
  try {
    const updated = await prisma.customer.update({
      where: { id: user.customerId },
      data,
      select: CUSTOMER_SELF_SELECT,
    });
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: "Failed to update profile" });
  }
});

customersRouter.get("/me/jobs", async (req, res) => {
  const user = req.user!;
  if (user.role !== "customer" || !user.customerId) {
    return res.status(403).json({ error: "Forbidden" });
  }
  try {
    const jobs = await prisma.job.findMany({
      where: {
        customerId: user.customerId,
        organizationId: user.organizationId,
        status: { in: ["completed", "cancelled"] },
      },
      select: {
        id: true,
        status: true,
        scheduledAt: true,
        completedAt: true,
        equipmentType: true,
        symptomSummary: true,
        actionsTaken: true,
        technician: { select: { name: true } },
      },
      orderBy: { scheduledAt: "desc" },
    });
    res.json(jobs);
  } catch (e) {
    res.status(500).json({ error: "Failed to load job history" });
  }
});

customersRouter.get("/me/equipment", async (req, res) => {
  const user = req.user!;
  if (user.role !== "customer" || !user.customerId) {
    return res.status(403).json({ error: "Forbidden" });
  }
  try {
    const items = await prisma.equipment.findMany({
      where: {
        customerId: user.customerId,
        organizationId: user.organizationId,
      },
      select: {
        id: true,
        equipmentType: true,
        make: true,
        model: true,
        serialNumber: true,
        installDate: true,
        warrantyExpiry: true,
        serviceIntervalMonths: true,
        lastServicedAt: true,
      },
      orderBy: { createdAt: "asc" },
    });
    res.json(items);
  } catch (e) {
    res.status(500).json({ error: "Failed to load equipment" });
  }
});

customersRouter.get("/me/plans", async (req, res) => {
  if (req.user!.role !== "customer") return res.status(403).json({ error: "Forbidden" })
  const { customerId, organizationId } = req.user!
  const plans = await prisma.maintenancePlan.findMany({
    where: { customerId: customerId!, organizationId, status: "active" },
    include: {
      items: {
        include: { equipment: { select: { make: true, model: true, equipmentType: true } } },
      },
    },
    orderBy: { startDate: "desc" },
  })
  return res.json(plans)
})

customersRouter.get("/:id", async (req, res) => {
  try {
    const customer = await prisma.customer.findFirst({
      where: { id: req.params.id, organizationId: req.user!.organizationId },
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
        organizationId: req.user!.organizationId,
        ...parsed.data,
      },
    });
    res.status(201).json(customer);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Failed to create customer" });
  }
});

customersRouter.delete("/:id", async (req, res) => {
  if (req.user!.role !== "office") {
    return res.status(403).json({ error: "Forbidden" });
  }
  try {
    await prisma.customer.delete({
      where: { id: req.params.id, organizationId: req.user!.organizationId },
    });
    res.status(204).send();
  } catch (e) {
    if ((e as { code?: string })?.code === "P2025") {
      return res.status(404).json({ error: "Customer not found" });
    }
    if ((e as { code?: string })?.code === "P2003") {
      return res.status(409).json({ error: "Cannot delete customer with existing jobs or invoices" });
    }
    res.status(500).json({ error: e instanceof Error ? e.message : "Failed to delete customer" });
  }
});

customersRouter.patch("/:id", async (req, res) => {
  const parsed = updateCustomerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  try {
    const customer = await prisma.customer.update({
      where: { id: req.params.id, organizationId: req.user!.organizationId },
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
