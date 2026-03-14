import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma.js";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";

export const authRouter = Router();

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is required");
}
const JWT_EXPIRES_IN = "7d";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// POST /api/auth/login (public)
authRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid email or password format" });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email: parsed.data.email },
    });

    if (!user || !user.passwordHash) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const valid = await bcrypt.compare(parsed.data.password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const token = jwt.sign(
      { userId: user.id, role: user.role, organizationId: user.organizationId },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        organizationId: user.organizationId,
      },
    });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Login failed" });
  }
});

// GET /api/auth/me — uses middleware, no inline JWT verification
authRouter.get("/me", requireAuth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
    });

    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }

    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      organizationId: user.organizationId,
    });
  } catch {
    return res.status(500).json({ error: "Failed to fetch user" });
  }
});

// GET /api/auth/me/profile — returns linked Technician or Customer record
authRouter.get("/me/profile", requireAuth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      include: {
        technician: {
          include: {
            vehicle: { select: { id: true, name: true } },
            jobs: {
              orderBy: { scheduledAt: "desc" },
              take: 20,
              include: {
                customer: { select: { id: true, name: true, address: true } },
              },
            },
          },
        },
        customer: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (user.role === "technician" && user.technician) {
      return res.json({ role: "technician", profile: user.technician });
    }
    if (user.role === "customer" && user.customer) {
      return res.json({ role: "customer", profile: user.customer });
    }

    return res.json({ role: user.role, profile: null });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Failed to fetch profile" });
  }
});

// POST /api/auth/logout — client-side only (clear localStorage), this is a no-op
authRouter.post("/logout", (_req, res) => {
  res.json({ ok: true });
});
