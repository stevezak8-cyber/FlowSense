import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { z } from "zod";

export const pricebookRouter = Router();

const requireAdmin = (req: any, res: any, next: any) => {
  if (req.user?.role !== "office") return res.status(403).json({ error: "Forbidden" });
  next();
};

const itemSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  category: z.enum(["cooling", "heating", "parts", "labor", "maintenance"]),
  unit: z.string().optional(),
  unitPrice: z.number().positive(),
  locked: z.boolean().optional(),
});

const updateItemSchema = itemSchema.partial();

pricebookRouter.get("/", async (req, res) => {
  try {
    const items = await prisma.pricebookItem.findMany({
      where: { organizationId: req.user!.organizationId, active: true },
      orderBy: [{ category: "asc" }, { name: "asc" }],
    });
    res.json(items);
  } catch {
    res.status(500).json({ error: "Failed to fetch pricebook" });
  }
});

pricebookRouter.post("/", requireAdmin, async (req, res) => {
  const parsed = itemSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid data", details: parsed.error.flatten() });

  try {
    const item = await prisma.pricebookItem.create({
      data: { ...parsed.data, organizationId: req.user!.organizationId, source: "admin" },
    });
    res.status(201).json(item);
  } catch {
    res.status(500).json({ error: "Failed to create item" });
  }
});

pricebookRouter.patch("/:id", requireAdmin, async (req, res) => {
  const existing = await prisma.pricebookItem.findFirst({
    where: { id: req.params.id, organizationId: req.user!.organizationId },
  });
  if (!existing) return res.status(404).json({ error: "Item not found" });

  const parsed = updateItemSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid data", details: parsed.error.flatten() });

  try {
    const item = await prisma.pricebookItem.update({ where: { id: req.params.id }, data: parsed.data });
    res.json(item);
  } catch {
    res.status(500).json({ error: "Failed to update item" });
  }
});

pricebookRouter.delete("/:id", requireAdmin, async (req, res) => {
  const existing = await prisma.pricebookItem.findFirst({
    where: { id: req.params.id, organizationId: req.user!.organizationId },
  });
  if (!existing) return res.status(404).json({ error: "Item not found" });

  try {
    const item = await prisma.pricebookItem.update({ where: { id: req.params.id }, data: { active: false } });
    res.json(item);
  } catch {
    res.status(500).json({ error: "Failed to delete item" });
  }
});
