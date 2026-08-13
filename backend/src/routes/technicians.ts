import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { z } from "zod";

export const techniciansRouter = Router();

const createTechnicianSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  epa608Level: z.string().optional(),
  skills: z.array(z.string()).default([]),
  isOnDuty: z.boolean().optional(),
});

const updateTechnicianSchema = createTechnicianSchema.partial();

techniciansRouter.get("/", async (req, res) => {
  try {
    const technicians = await prisma.technician.findMany({
      where: { organizationId: req.user!.organizationId },
      orderBy: { name: "asc" },
      include: { vehicle: { select: { id: true, name: true } } },
    });
    res.json(technicians);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Failed to list technicians" });
  }
});

techniciansRouter.get("/:id", async (req, res) => {
  try {
    const technician = await prisma.technician.findFirst({
      where: { id: req.params.id, organizationId: req.user!.organizationId },
      include: { vehicle: true, jobs: { take: 20, orderBy: { scheduledAt: "desc" } } },
    });
    if (!technician) return res.status(404).json({ error: "Technician not found" });
    res.json(technician);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Failed to get technician" });
  }
});

techniciansRouter.post("/", async (req, res) => {
  const parsed = createTechnicianSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  try {
    const technician = await prisma.technician.create({
      data: {
        organizationId: req.user!.organizationId,
        name: parsed.data.name,
        email: parsed.data.email,
        phone: parsed.data.phone,
        epa608Level: parsed.data.epa608Level,
        skills: parsed.data.skills,
      },
    });
    res.status(201).json(technician);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Failed to create technician" });
  }
});

techniciansRouter.delete("/:id", async (req, res) => {
  if (req.user!.role !== "office") {
    return res.status(403).json({ error: "Forbidden" });
  }
  try {
    await prisma.technician.delete({
      where: { id: req.params.id, organizationId: req.user!.organizationId },
    });
    res.status(204).send();
  } catch (e) {
    if ((e as { code?: string })?.code === "P2025") {
      return res.status(404).json({ error: "Technician not found" });
    }
    if ((e as { code?: string })?.code === "P2003") {
      return res.status(409).json({ error: "Cannot delete technician with existing jobs" });
    }
    res.status(500).json({ error: e instanceof Error ? e.message : "Failed to delete technician" });
  }
});

techniciansRouter.patch("/:id", async (req, res) => {
  const parsed = updateTechnicianSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  try {
    const technician = await prisma.technician.update({
      where: { id: req.params.id, organizationId: req.user!.organizationId },
      data: parsed.data,
    });
    res.json(technician);
  } catch (e) {
    if ((e as { code?: string })?.code === "P2025") {
      return res.status(404).json({ error: "Technician not found" });
    }
    res.status(500).json({ error: e instanceof Error ? e.message : "Failed to update technician" });
  }
});
