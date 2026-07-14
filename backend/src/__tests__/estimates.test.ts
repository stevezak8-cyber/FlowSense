import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    estimate: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
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
