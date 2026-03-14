import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { z } from "zod";

export const complianceRouter = Router();

const createLogSchema = z.object({
  jobId: z.string().cuid(),
  type: z.enum(["epa608_prompt", "safety_ack", "code_reminder", "photo_audit", "ai_disclaimer"]),
  payload: z.record(z.unknown()),
});

complianceRouter.get("/job/:jobId", async (req, res) => {
  try {
    const logs = await prisma.complianceLog.findMany({
      where: { jobId: req.params.jobId },
      orderBy: { createdAt: "desc" },
    });
    res.json(logs);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Failed to list compliance logs" });
  }
});

complianceRouter.post("/", async (req, res) => {
  const parsed = createLogSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  try {
    const log = await prisma.complianceLog.create({
      data: {
        jobId: parsed.data.jobId,
        type: parsed.data.type,
        payload: parsed.data.payload as object,
      },
    });
    res.status(201).json(log);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Failed to create compliance log" });
  }
});
