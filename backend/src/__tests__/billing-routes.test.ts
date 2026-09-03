import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// Mock stripe service
vi.mock("../services/stripe.js", () => ({
  stripe: null,
  getPriceId: vi.fn(),
}));

// Mock prisma
vi.mock("../lib/prisma.js", () => ({
  prisma: {
    organization: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import * as stripeModule from "../services/stripe.js";
import { prisma } from "../lib/prisma.js";
import { billingRouter } from "../routes/billing.js";

function buildApp(role = "office") {
  const app = express();
  app.use(express.json());
  // Inject fake user
  app.use((req: any, _res, next) => {
    req.user = { id: "user-1", organizationId: "org-1", role };
    next();
  });
  app.use("/billing", billingRouter);
  return app;
}

describe("POST /billing/portal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 503 when Stripe is not configured", async () => {
    (stripeModule as any).stripe = null;
    (prisma.organization.findUnique as any).mockResolvedValue({ id: "org-1", stripeCustomerId: null });

    const res = await request(buildApp()).post("/billing/portal");
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/not configured/i);
  });

  it("returns 404 when org has no stripeCustomerId", async () => {
    (stripeModule as any).stripe = {};
    (prisma.organization.findUnique as any).mockResolvedValue({ id: "org-1", stripeCustomerId: null });

    const res = await request(buildApp()).post("/billing/portal");
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/no billing account/i);
  });

  it("returns url on success", async () => {
    const fakeStripe = {
      billingPortal: {
        sessions: {
          create: vi.fn().mockResolvedValue({ url: "https://billing.stripe.com/session/abc" }),
        },
      },
    };
    (stripeModule as any).stripe = fakeStripe;
    (prisma.organization.findUnique as any).mockResolvedValue({ id: "org-1", stripeCustomerId: "cus_123" });

    const res = await request(buildApp()).post("/billing/portal");
    expect(res.status).toBe(200);
    expect(res.body.url).toBe("https://billing.stripe.com/session/abc");
  });
});

describe("POST /billing/upgrade", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 403 when user is not admin", async () => {
    const res = await request(buildApp("office"))
      .post("/billing/upgrade")
      .send({ organizationId: "org-1", plan: "fleet" });
    expect(res.status).toBe(403);
  });
});
