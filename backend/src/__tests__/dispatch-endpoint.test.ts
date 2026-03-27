import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

vi.mock("../services/dispatch-suggestions.js", () => ({
  rankTechnicians: vi.fn(),
}));

import { rankTechnicians } from "../services/dispatch-suggestions.js";

// Build a mini Express app with auth middleware for testing
function buildApp() {
  const app = express();
  app.use(express.json());
  return app;
}

describe("POST /api/dispatch/suggest", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    vi.doMock("../services/dispatch-suggestions.js", () => ({
      rankTechnicians: vi.fn().mockResolvedValue({
        suggestions: [
          {
            technician: { id: "t1", name: "Jordan", skills: ["furnace"], vehicle: null },
            score: 0.92,
            driveMinutes: 12,
            todayJobCount: 2,
            servedCustomerBefore: false,
            skillMatch: true,
          },
        ],
        fallbackMode: false,
        driveTimesAvailable: true,
      }),
    }));

    const { dispatchRouter } = await import("../routes/dispatch.js");

    app = buildApp();
    // Simulate requireAuth middleware
    app.use((req, _res, next) => {
      (req as any).user = { userId: "u1", organizationId: "org-1", role: "office" };
      next();
    });
    app.use("/api/dispatch", dispatchRouter);
  });

  it("returns 200 with ranked suggestions", async () => {
    const res = await request(app)
      .post("/api/dispatch/suggest")
      .send({
        equipmentType: "furnace",
        customerAddress: "123 Main St, Denver, CO 80202",
        scheduledAt: "2026-03-15T14:00:00.000Z",
        customerId: "cust-1",
        priority: "normal",
      });

    expect(res.status).toBe(200);
    expect(res.body.suggestions).toHaveLength(1);
    expect(res.body.suggestions[0].technician.name).toBe("Jordan");
    expect(res.body.fallbackMode).toBe(false);
    expect(res.body.driveTimesAvailable).toBe(true);
  });

  it("returns 403 for customer role", async () => {
    // Rebuild app with customer role
    const { dispatchRouter } = await import("../routes/dispatch.js");
    const customerApp = buildApp();
    customerApp.use((req, _res, next) => {
      (req as any).user = { userId: "u2", organizationId: "org-1", role: "customer" };
      next();
    });
    customerApp.use("/api/dispatch", dispatchRouter);

    const res = await request(customerApp)
      .post("/api/dispatch/suggest")
      .send({
        equipmentType: "furnace",
        customerAddress: "123 Main St, Denver, CO 80202",
        scheduledAt: "2026-03-15T14:00:00.000Z",
        customerId: "cust-1",
        priority: "normal",
      });

    expect(res.status).toBe(403);
  });

  it("returns 400 for missing required fields", async () => {
    const res = await request(app)
      .post("/api/dispatch/suggest")
      .send({ priority: "normal" });

    expect(res.status).toBe(400);
  });

  it("passes organizationId from auth context", async () => {
    const { rankTechnicians: mockRank } = await import(
      "../services/dispatch-suggestions.js"
    );

    await request(app)
      .post("/api/dispatch/suggest")
      .send({
        equipmentType: "furnace",
        customerAddress: "123 Main St, Denver, CO 80202",
        scheduledAt: "2026-03-15T14:00:00.000Z",
        customerId: "cust-1",
        priority: "normal",
      });

    expect(vi.mocked(mockRank)).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org-1" })
    );
  });
});
