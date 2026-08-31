import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma.js";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { stripe, getPriceId } from "../services/stripe.js";
import { seedPricebook } from "../services/estimate-ai.js";

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

const registerSchema = z.object({
  companyName: z.string().min(2, "Company name must be at least 2 characters").max(100),
  name: z.string().min(1, "Name is required").max(100),
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

// POST /api/auth/register (public) — create a new org + admin user
authRouter.post("/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0]?.message ?? "Invalid data" });
  }

  const { companyName, name, email, password } = parsed.data;

  // Generate a URL-safe slug from company name
  const baseSlug = companyName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);

  try {
    // Check email uniqueness across all orgs
    const existingUser = await prisma.user.findFirst({ where: { email } });
    if (existingUser) {
      return res.status(409).json({ error: "An account with this email already exists" });
    }

    // Make slug unique by appending a short random suffix if needed
    let slug = baseSlug || "org";
    const existing = await prisma.organization.findUnique({ where: { slug } });
    if (existing) {
      slug = `${slug}-${Math.random().toString(36).slice(2, 7)}`;
    }

    const passwordHash = await bcrypt.hash(password, 10);

    // Step 1: Create Stripe Customer (before DB write so we can store the ID)
    let stripeCustomerId: string | undefined
    if (stripe) {
      try {
        const customer = await stripe.customers.create({
          email,
          name,
          metadata: { companyName },
        })
        stripeCustomerId = customer.id
      } catch (e) {
        console.error("[register] Failed to create Stripe customer (non-fatal, continuing without):", e)
        // Continue without Stripe — org is created in trial mode, payment can be set up later
      }
    }

    // Step 2: Create org + user atomically in a DB transaction
    let org: { id: string; name: string; slug: string }
    let newUser: { id: string; email: string; name: string | null; role: string; organizationId: string }

    try {
      const result = await prisma.$transaction(async (tx) => {
        const organization = await tx.organization.create({
          data: {
            name: companyName,
            slug,
            email,
            ...(stripeCustomerId ? { stripeCustomerId, plan: "trial", trialEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) } : {}),
          },
        })
        const user = await tx.user.create({
          data: {
            email,
            name,
            passwordHash,
            role: "office",
            organizationId: organization.id,
          },
        })
        return { organization, user }
      })
      org = result.organization
      newUser = result.user
    } catch (e) {
      // DB failed — clean up the Stripe customer we already created
      if (stripeCustomerId && stripe) {
        await stripe.customers.del(stripeCustomerId).catch(() => {})
      }
      console.error("[register] DB transaction failed:", e)
      return res.status(500).json({ error: "Registration failed. Please try again." })
    }

    // Fire-and-forget pricebook seeding
    seedPricebook(org.id).catch((err) =>
      console.error("[Register] Pricebook seeding error:", err)
    );

    // Issue a JWT so the frontend can store it before redirecting to Stripe
    const token = jwt.sign(
      { userId: newUser.id, organizationId: org.id, role: newUser.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    )

    // Step 3: Create Stripe Checkout Session
    if (stripe) {
      try {
        const appUrl = process.env.APP_URL ?? "http://localhost:5173"
        const session = await stripe.checkout.sessions.create({
          mode: "subscription",
          customer: stripeCustomerId,
          line_items: [{ price: getPriceId("entry"), quantity: 1 }],
          subscription_data: { trial_period_days: 30 },
          payment_method_collection: "always",
          success_url: `${appUrl}/office?checkout=success`,
          cancel_url: `${appUrl}/register`,
          metadata: { organizationId: org.id },
        })
        return res.status(201).json({
          checkoutUrl: session.url,
          token,
          user: { id: newUser.id, email: newUser.email, name: newUser.name, role: newUser.role, organizationId: org.id },
        })
      } catch (e) {
        console.error("[register] Failed to create checkout session (non-fatal, skipping):", e)
        // Fall through — user is created, just skip the Stripe checkout
      }
    }

    // Stripe not configured (dev/test without STRIPE_SECRET_KEY) — skip checkout
    return res.status(201).json({
      token,
      user: { id: newUser.id, email: newUser.email, name: newUser.name, role: newUser.role, organizationId: org.id },
    })
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Registration failed" });
  }
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
      select: {
        id: true, email: true, name: true, role: true,
        organizationId: true, passwordHash: true,
        technicianId: true, customerId: true,
      },
    });

    if (!user || !user.passwordHash) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const valid = await bcrypt.compare(parsed.data.password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const token = jwt.sign(
      {
        userId: user.id,
        role: user.role,
        organizationId: user.organizationId,
        ...(user.technicianId && { technicianId: user.technicianId }),
        ...(user.customerId && { customerId: user.customerId }),
      },
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
      include: { organization: { select: { plan: true, trialEndsAt: true } } },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      organizationId: user.organizationId,
      organization: {
        plan: user.organization.plan,
        trialEndsAt: user.organization.trialEndsAt,
      },
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

// PATCH /api/auth/password — change the current user's password (requires current password)
authRouter.patch("/password", requireAuth, async (req, res) => {
  const schema = z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8, "New password must be at least 8 characters"),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0]?.message ?? "Invalid data" });
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
    if (!user) return res.status(404).json({ error: "User not found" });

    const valid = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
    if (!valid) return res.status(401).json({ error: "Current password is incorrect" });

    const newHash = await bcrypt.hash(parsed.data.newPassword, 10);
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: newHash } });

    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to update password" });
  }
});

// PATCH /api/auth/me — update the current user's display name
authRouter.patch("/me", requireAuth, async (req, res) => {
  const { name } = req.body as { name?: string };
  if (typeof name !== "string" || name.trim().length === 0) {
    return res.status(400).json({ error: "name is required" });
  }
  try {
    const updated = await prisma.user.update({
      where: { id: req.user!.userId },
      data: { name: name.trim() },
      select: { id: true, email: true, name: true, role: true, organizationId: true },
    });
    res.json(updated);
  } catch {
    res.status(500).json({ error: "Failed to update user" });
  }
});

// POST /api/auth/invite — office admin generates a signed invite link for a user
// Creates a User record (passwordHash = "") if none exists for that email, then
// returns a short-lived invite token. Idempotent: re-generating is safe until accepted.
authRouter.post("/invite", requireAuth, async (req, res) => {
  if (req.user!.role !== "office") {
    return res.status(403).json({ error: "Forbidden" });
  }

  const schema = z.object({
    email: z.string().email(),
    role: z.enum(["technician", "customer", "office"]),
    technicianId: z.string().optional(),
    customerId: z.string().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid data", details: parsed.error.flatten() });
  }

  const { email, role, technicianId, customerId } = parsed.data;
  const organizationId = req.user!.organizationId;

  try {
    // Check if a user with that email already exists in this org
    let user = await prisma.user.findFirst({
      where: { email, organizationId },
    });

    if (user && user.passwordHash) {
      // Already accepted an invite — don't allow re-invite
      return res.status(409).json({ error: "A user with this email has already set up their account" });
    }

    if (!user) {
      // Verify referenced technician/customer belong to this org
      if (technicianId) {
        const tech = await prisma.technician.findFirst({ where: { id: technicianId, organizationId } });
        if (!tech) return res.status(404).json({ error: "Technician not found" });
      }
      if (customerId) {
        const cust = await prisma.customer.findFirst({ where: { id: customerId, organizationId } });
        if (!cust) return res.status(404).json({ error: "Customer not found" });
      }

      user = await prisma.user.create({
        data: {
          email,
          role,
          organizationId,
          passwordHash: "", // empty until accepted
          ...(technicianId && { technicianId }),
          ...(customerId && { customerId }),
        },
      });
    }

    // Sign a short-lived invite JWT (7d)
    const token = jwt.sign(
      { type: "invite", userId: user.id, organizationId },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({ token });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Failed to create invite" });
  }
});

// GET /api/auth/invite/:token — public, validates invite token and returns invite info
authRouter.get("/invite/:token", async (req, res) => {
  try {
    const payload = jwt.verify(req.params.token, JWT_SECRET) as {
      type: string;
      userId: string;
      organizationId: string;
    };

    if (payload.type !== "invite") {
      return res.status(400).json({ error: "Invalid invite token" });
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      include: { organization: { select: { name: true } } },
    });

    if (!user) return res.status(404).json({ error: "Invite not found" });
    if (user.passwordHash) return res.status(410).json({ error: "This invite has already been accepted" });

    res.json({
      email: user.email,
      role: user.role,
      orgName: user.organization.name,
    });
  } catch {
    return res.status(400).json({ error: "Invalid or expired invite token" });
  }
});

// POST /api/auth/invite/:token/accept — public, set name + password to activate account
authRouter.post("/invite/:token/accept", async (req, res) => {
  const schema = z.object({
    name: z.string().min(1),
    password: z.string().min(8, "Password must be at least 8 characters"),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0]?.message ?? "Invalid data" });
  }

  try {
    const payload = jwt.verify(req.params.token, JWT_SECRET) as {
      type: string;
      userId: string;
      organizationId: string;
    };

    if (payload.type !== "invite") {
      return res.status(400).json({ error: "Invalid invite token" });
    }

    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user) return res.status(404).json({ error: "Invite not found" });
    if (user.passwordHash) return res.status(410).json({ error: "This invite has already been accepted" });

    const passwordHash = await bcrypt.hash(parsed.data.password, 10);
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { name: parsed.data.name, passwordHash },
    });

    // Issue a regular auth token so they're logged in immediately
    const authToken = jwt.sign(
      {
        userId: updated.id,
        role: updated.role,
        organizationId: updated.organizationId,
        ...(updated.technicianId && { technicianId: updated.technicianId }),
        ...(updated.customerId && { customerId: updated.customerId }),
      },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      token: authToken,
      user: {
        id: updated.id,
        email: updated.email,
        name: updated.name,
        role: updated.role,
        organizationId: updated.organizationId,
      },
    });
  } catch {
    return res.status(400).json({ error: "Invalid or expired invite token" });
  }
});

// POST /api/auth/logout — client-side only (clear localStorage), this is a no-op
authRouter.post("/logout", (_req, res) => {
  res.json({ ok: true });
});

// POST /api/auth/demo — one-click demo login, returns JWT for seed account
const DEMO_EMAILS: Record<string, string> = {
  office: "office@flowsense.demo",
  technician: "tech@flowsense.demo",
  customer: "customer@flowsense.demo",
};

authRouter.post("/demo", async (req, res) => {
  const role = req.body?.role as string | undefined;
  const email = role ? DEMO_EMAILS[role] : undefined;
  if (!email) {
    return res.status(400).json({ error: "role must be one of: office, technician, customer" });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, name: true, role: true, organizationId: true, technicianId: true, customerId: true },
    });

    if (!user) {
      return res.status(404).json({ error: "Demo account not found — run db seed first" });
    }

    const token = jwt.sign(
      {
        userId: user.id,
        role: user.role,
        organizationId: user.organizationId,
        ...(user.technicianId && { technicianId: user.technicianId }),
        ...(user.customerId && { customerId: user.customerId }),
      },
      JWT_SECRET,
      { expiresIn: "2h" }
    );

    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role, organizationId: user.organizationId },
    });
  } catch (e) {
    console.error("[demo] error:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/auth/forgot-password — send a password reset email
authRouter.post("/forgot-password", async (req, res) => {
  const { email } = req.body as { email?: string };
  if (!email || typeof email !== "string") {
    return res.status(400).json({ error: "Email is required" });
  }

  // Always return 200 so we don't leak whether an email is registered
  res.json({ ok: true });

  // Fire-and-forget after responding
  try {
    const user = await prisma.user.findFirst({ where: { email: email.toLowerCase().trim() } });
    if (!user) return; // silently do nothing

    const { sendEmail } = await import("../services/email.js");
    const { passwordResetHtml } = await import("../templates/password-reset.js");

    const token = jwt.sign(
      { type: "password-reset", userId: user.id },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    const appUrl = process.env.APP_URL ?? "http://localhost:5173";
    const resetUrl = `${appUrl}/reset-password/${token}`;

    await sendEmail({
      to: user.email,
      subject: "Pneuros: Reset your password",
      html: passwordResetHtml({ name: user.name, resetUrl }),
    });
  } catch (e) {
    console.error("[forgot-password] Failed to send reset email:", e);
  }
});

// POST /api/auth/reset-password/:token — verify token and set new password
authRouter.post("/reset-password/:token", async (req, res) => {
  const schema = z.object({
    password: z.string().min(8, "Password must be at least 8 characters"),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0]?.message ?? "Invalid data" });
  }

  try {
    const payload = jwt.verify(req.params.token, JWT_SECRET) as {
      type: string;
      userId: string;
    };

    if (payload.type !== "password-reset") {
      return res.status(400).json({ error: "Invalid reset token" });
    }

    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user) return res.status(404).json({ error: "User not found" });

    const passwordHash = await bcrypt.hash(parsed.data.password, 10);
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });

    res.json({ ok: true });
  } catch {
    return res.status(400).json({ error: "Invalid or expired reset link" });
  }
});
