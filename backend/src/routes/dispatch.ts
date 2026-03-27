import { Router } from "express";
import { z } from "zod";
import { rankTechnicians } from "../services/dispatch-suggestions.js";

export const dispatchRouter = Router();

const dispatchSuggestSchema = z.object({
  equipmentType: z.string().min(1),
  customerAddress: z.string().min(1),
  scheduledAt: z.string().datetime(),
  customerId: z.string().min(1),
  priority: z.enum(["low", "normal", "high", "urgent"]),
});

dispatchRouter.post("/suggest", async (req, res) => {
  try {
    if (req.user!.role === "customer") {
      return res.status(403).json({ error: "Customers cannot access dispatch suggestions" });
    }

    const parsed = dispatchSuggestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const result = await rankTechnicians({
      ...parsed.data,
      organizationId: req.user!.organizationId,
    });

    return res.json(result);
  } catch (error) {
    console.error("[Dispatch] Endpoint error:", error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to get dispatch suggestions",
    });
  }
});
