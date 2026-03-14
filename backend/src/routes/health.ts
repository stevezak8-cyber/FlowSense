import { Router } from "express";
import { prisma } from "../lib/prisma.js";

export const healthRouter = Router();

healthRouter.get("/", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      status: "ok",
      service: "flowsense-api",
      database: "connected",
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    res.status(503).json({
      status: "error",
      service: "flowsense-api",
      database: "disconnected",
      error: e instanceof Error ? e.message : "Unknown",
    });
  }
});
