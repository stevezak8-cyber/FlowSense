import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    pricebookItem: {
      findMany: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { prisma } from "../lib/prisma.js";
import { pricebookRouter } from "../routes/pricebook.js";
import express from "express";
import request from "supertest";

function makeApp(role: string) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { id: "user-1", organizationId: "org-1", role };
    next();
  });
  app.use("/api/pricebook", pricebookRouter);
  return app;
}

describe("GET /api/pricebook", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns active items for org", async () => {
    const items = [{ id: "item-1", name: "Refrigerant recharge", active: true }];
    (prisma.pricebookItem.findMany as any).mockResolvedValue(items);

    const res = await request(makeApp("office")).get("/api/pricebook");
    expect(res.status).toBe(200);
    expect(res.body).toEqual(items);
    expect(prisma.pricebookItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: "org-1", active: true } })
    );
  });
});

describe("POST /api/pricebook", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates item for office role", async () => {
    const item = { id: "item-2", name: "Capacitor", category: "cooling", unitPrice: 140 };
    (prisma.pricebookItem.create as any).mockResolvedValue(item);

    const res = await request(makeApp("office")).post("/api/pricebook").send({
      name: "Capacitor",
      category: "cooling",
      unitPrice: 140,
    });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Capacitor");
  });

  it("returns 403 for technician role", async () => {
    const res = await request(makeApp("technician")).post("/api/pricebook").send({
      name: "X",
      category: "cooling",
      unitPrice: 10,
    });
    expect(res.status).toBe(403);
  });
});

describe("PATCH /api/pricebook/:id", () => {
  beforeEach(() => vi.clearAllMocks());

  it("updates item for office role", async () => {
    (prisma.pricebookItem.findFirst as any).mockResolvedValue({ id: "item-1", organizationId: "org-1" });
    (prisma.pricebookItem.update as any).mockResolvedValue({ id: "item-1", unitPrice: 200 });

    const res = await request(makeApp("office")).patch("/api/pricebook/item-1").send({ unitPrice: 200 });
    expect(res.status).toBe(200);
  });

  it("returns 404 when item not in org", async () => {
    (prisma.pricebookItem.findFirst as any).mockResolvedValue(null);
    const res = await request(makeApp("office")).patch("/api/pricebook/bad-id").send({ unitPrice: 1 });
    expect(res.status).toBe(404);
  });

  it("returns 403 for technician", async () => {
    const res = await request(makeApp("technician")).patch("/api/pricebook/item-1").send({ unitPrice: 1 });
    expect(res.status).toBe(403);
  });
});

describe("DELETE /api/pricebook/:id", () => {
  beforeEach(() => vi.clearAllMocks());

  it("soft-deletes item (sets active: false)", async () => {
    (prisma.pricebookItem.findFirst as any).mockResolvedValue({ id: "item-1", organizationId: "org-1" });
    (prisma.pricebookItem.update as any).mockResolvedValue({ id: "item-1", active: false });

    const res = await request(makeApp("office")).delete("/api/pricebook/item-1");
    expect(res.status).toBe(200);
    expect(prisma.pricebookItem.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { active: false } })
    );
  });
});
