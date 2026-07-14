import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { z } from "zod";

export const organizationsRouter = Router();

const updateOrgSchema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  address: z.string().optional(),
  notificationPreferences: z
    .object({
      booking: z.boolean(),
      statusChange: z.boolean(),
      completion: z.boolean(),
      urgent: z.boolean(),
    })
    .optional(),
  estimateDepositThreshold: z.number().positive().optional(),
  estimateDepositPercent: z.number().int().min(1).max(100).optional(),
});

// GET /api/organizations/me — return the current user's org
organizationsRouter.get("/me", async (req, res) => {
  try {
    const org = await prisma.organization.findUnique({
      where: { id: req.user!.organizationId },
      select: {
        id: true,
        name: true,
        slug: true,
        phone: true,
        email: true,
        address: true,
        notificationPreferences: true,
        createdAt: true,
        estimateDepositThreshold: true,
        estimateDepositPercent: true,
      },
    });

    if (!org) return res.status(404).json({ error: "Organization not found" });
    res.json(org);
  } catch {
    res.status(500).json({ error: "Failed to fetch organization" });
  }
});

// PATCH /api/organizations/me — update org profile (office role only)
organizationsRouter.patch("/me", async (req, res) => {
  if (req.user!.role !== "office") {
    return res.status(403).json({ error: "Forbidden" });
  }

  const parsed = updateOrgSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid data", details: parsed.error.flatten() });
  }

  try {
    const updated = await prisma.organization.update({
      where: { id: req.user!.organizationId },
      data: parsed.data,
      select: {
        id: true,
        name: true,
        slug: true,
        phone: true,
        email: true,
        address: true,
        notificationPreferences: true,
        createdAt: true,
        estimateDepositThreshold: true,
        estimateDepositPercent: true,
      },
    });
    res.json(updated);
  } catch {
    res.status(500).json({ error: "Failed to update organization" });
  }
});
