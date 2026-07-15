import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../services/stripe.js", () => ({
  stripe: { checkout: { sessions: { create: vi.fn() } } },
}));

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    estimate: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    estimateLine: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    job: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    organization: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("../services/estimate-ai.js", () => ({
  generateEstimate: vi.fn(),
}));

vi.mock("../services/email.js", () => ({
  sendEmail: vi.fn(),
}));

import { prisma } from "../lib/prisma.js";
import { generateEstimate } from "../services/estimate-ai.js";
import { estimatesRouter, publicEstimatesRouter } from "../routes/estimates.js";
import * as stripeModule from "../services/stripe.js";
import express from "express";
import request from "supertest";

function makeApp(role = "technician") {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { id: "user-1", organizationId: "org-1", role };
    next();
  });
  app.use("/api/estimates", estimatesRouter);
  return app;
}

function makePublicApp() {
  const app = express();
  app.use(express.json());
  app.use("/", publicEstimatesRouter);
  return app;
}

describe("POST /api/estimates/generate", () => {
  beforeEach(() => vi.clearAllMocks());

  it("generates estimate from jobId", async () => {
    (generateEstimate as any).mockResolvedValue({ estimateId: "est-1" });
    (prisma.estimate.findFirst as any).mockResolvedValue({
      id: "est-1",
      status: "draft",
      lines: [],
    });

    const res = await request(makeApp()).post("/api/estimates/generate").send({ jobId: "job-1" });
    expect(res.status).toBe(201);
    expect(res.body.id).toBe("est-1");
  });

  it("returns 400 when jobId missing", async () => {
    const res = await request(makeApp()).post("/api/estimates/generate").send({});
    expect(res.status).toBe(400);
  });

  it("returns 503 when AI not configured", async () => {
    (generateEstimate as any).mockResolvedValue({ error: "not_configured" });
    const res = await request(makeApp()).post("/api/estimates/generate").send({ jobId: "job-1" });
    expect(res.status).toBe(503);
  });
});

describe("GET /:token (public router)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns estimate for valid token", async () => {
    const est = { id: "est-1", token: "tok-1", status: "sent", expiresAt: null, lines: [], job: {} };
    (prisma.estimate.findFirst as any).mockResolvedValue(est);
    const res = await request(makePublicApp()).get("/tok-1");
    expect(res.status).toBe(200);
  });

  it("returns 404 for unknown token", async () => {
    (prisma.estimate.findFirst as any).mockResolvedValue(null);
    const res = await request(makePublicApp()).get("/bad");
    expect(res.status).toBe(404);
  });

  it("returns 410 for expired estimate", async () => {
    const est = { id: "est-1", token: "tok-1", status: "sent", expiresAt: new Date("2020-01-01"), lines: [] };
    (prisma.estimate.findFirst as any).mockResolvedValue(est);
    const res = await request(makePublicApp()).get("/tok-1");
    expect(res.status).toBe(410);
  });
});

describe("POST /:token/approve (public router)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("approves estimate and updates job status", async () => {
    const est = {
      id: "est-1",
      jobId: "job-1",
      status: "sent",
      expiresAt: null,
      organizationId: "org-1",
      lines: [{ tier: "better", name: "Recharge", unitPrice: 160, quantity: 1 }],
    };
    (prisma.estimate.findFirst as any).mockResolvedValue(est);
    (prisma.estimate.update as any).mockResolvedValue({ ...est, status: "approved" });
    (prisma.job.update as any).mockResolvedValue({});
    (prisma.organization.findUnique as any).mockResolvedValue({
      estimateDepositThreshold: 500,
      estimateDepositPercent: 25,
    });

    const res = await request(makePublicApp()).post("/tok-1/approve").send({
      tier: "better",
      signatureData: "Jane Doe",
    });
    expect(res.status).toBe(200);
    expect(prisma.estimate.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "approved" }) })
    );
    expect(prisma.job.update).toHaveBeenCalled();
  });

  it("returns 409 when already approved", async () => {
    const est = { id: "est-1", status: "approved", expiresAt: null, lines: [] };
    (prisma.estimate.findFirst as any).mockResolvedValue(est);
    const res = await request(makePublicApp()).post("/tok-1/approve").send({
      tier: "better",
      signatureData: "Jane Doe",
    });
    expect(res.status).toBe(409);
  });
});

describe("POST /token/:token/deposit", () => {
  const publicApp = makePublicApp();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    // restore a working stripe mock after tests that null it out
    ;(stripeModule as any).stripe = { checkout: { sessions: { create: vi.fn() } } };
  });

  it("returns 404 when estimate not found", async () => {
    ;(prisma.estimate.findUnique as any).mockResolvedValue(null);
    const res = await request(publicApp).post("/bad-token/deposit");
    expect(res.status).toBe(404);
  });

  it("returns 400 when estimate is not approved", async () => {
    ;(prisma.estimate.findUnique as any).mockResolvedValue({
      id: "est-1", status: "sent", depositPaidAt: null, depositAmount: 500,
      jobId: "job-1", organizationId: "org-1",
      job: { title: "AC Repair" },
      organization: { stripeConnectAccountId: "acct_test", stripeConnectOnboarded: true },
    });
    const res = await request(publicApp).post("/tok-1/deposit");
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not.*approved/i);
  });

  it("returns 409 when deposit already paid", async () => {
    ;(prisma.estimate.findUnique as any).mockResolvedValue({
      id: "est-1", status: "approved", depositPaidAt: new Date(),
      depositAmount: 500, jobId: "job-1", organizationId: "org-1",
      job: { title: "AC Repair" },
      organization: { stripeConnectAccountId: "acct_test", stripeConnectOnboarded: true },
    });
    const res = await request(publicApp).post("/tok-1/deposit");
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already paid/i);
  });

  it("returns 409 when payment already initiated (session exists but not yet paid)", async () => {
    ;(prisma.estimate.findUnique as any).mockResolvedValue({
      id: "est-1", status: "approved", depositPaidAt: null,
      depositAmount: 500, stripePaymentIntentId: "cs_existing", jobId: "job-1", organizationId: "org-1",
      job: { title: "AC Repair" },
      organization: { stripeConnectAccountId: "acct_test", stripeConnectOnboarded: true },
    });
    const res = await request(publicApp).post("/tok-1/deposit");
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already initiated/i);
  });

  it("returns 400 when no deposit amount", async () => {
    ;(prisma.estimate.findUnique as any).mockResolvedValue({
      id: "est-1", status: "approved", depositPaidAt: null,
      depositAmount: null, stripePaymentIntentId: null, jobId: "job-1", organizationId: "org-1",
      job: { title: "AC Repair" },
      organization: { stripeConnectAccountId: "acct_test", stripeConnectOnboarded: true },
    });
    const res = await request(publicApp).post("/tok-1/deposit");
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no deposit required/i);
  });

  it("returns 503 when org not connected to Stripe", async () => {
    ;(prisma.estimate.findUnique as any).mockResolvedValue({
      id: "est-1", status: "approved", depositPaidAt: null,
      depositAmount: 500, stripePaymentIntentId: null, jobId: "job-1", organizationId: "org-1",
      job: { title: "AC Repair" },
      organization: { stripeConnectAccountId: null, stripeConnectOnboarded: false },
    });
    const res = await request(publicApp).post("/tok-1/deposit");
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/not configured/i);
  });

  it("returns 503 when stripe singleton is null", async () => {
    ;(stripeModule as any).stripe = null;
    ;(prisma.estimate.findUnique as any).mockResolvedValue({
      id: "est-1", status: "approved", depositPaidAt: null,
      depositAmount: 500, stripePaymentIntentId: null, jobId: "job-1", organizationId: "org-1",
      job: { title: "AC Repair" },
      organization: { stripeConnectAccountId: "acct_test", stripeConnectOnboarded: true },
    });
    const res = await request(publicApp).post("/tok-1/deposit");
    expect(res.status).toBe(503);
  });

  it("returns url on success", async () => {
    vi.stubEnv("FRONTEND_URL", "http://app.test");
    ;(prisma.estimate.findUnique as any).mockResolvedValue({
      id: "est-1", status: "approved", depositPaidAt: null,
      depositAmount: 150, stripePaymentIntentId: null, jobId: "job-1", organizationId: "org-1",
      job: { title: "AC Repair" },
      organization: { stripeConnectAccountId: "acct_test", stripeConnectOnboarded: true },
    });
    const mockCreate = vi.fn().mockResolvedValue({ id: "cs_test", url: "https://checkout.stripe.com/pay/cs_test" });
    ;(stripeModule as any).stripe = { checkout: { sessions: { create: mockCreate } } };
    ;(prisma.estimate.update as any).mockResolvedValue({});
    const res = await request(publicApp).post("/tok-1/deposit");
    expect(res.status).toBe(200);
    expect(res.body.url).toBe("https://checkout.stripe.com/pay/cs_test");
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "payment",
        line_items: expect.arrayContaining([
          expect.objectContaining({ quantity: 1 }),
        ]),
        metadata: expect.objectContaining({ estimateId: "est-1" }),
      }),
      { stripeAccount: "acct_test" }
    );
  });
});
