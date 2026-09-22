import { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma.js";
import { planHasAdvancedFeatures, planHasConcierge, planHasShopFeatures } from "../lib/plan-access.js";

async function currentPlan(req: Request): Promise<string | null> {
  if (!req.user) return null;
  const org = await prisma.organization.findUnique({
    where: { id: req.user.organizationId },
    select: { plan: true },
  });
  return org?.plan ?? null;
}

function gate(check: (plan: string) => boolean, message: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const plan = await currentPlan(req);
      if (!plan || !check(plan)) {
        return res.status(402).json({ error: message });
      }
      next();
    } catch {
      res.status(500).json({ error: "Failed to verify plan access" });
    }
  };
}

export const requireAdvancedPlan = gate(
  planHasAdvancedFeatures,
  "This feature needs the Fleet plan or higher. Upgrade in Settings to turn it on.",
);

export const requireConciergePlan = gate(
  planHasConcierge,
  "The AI concierge chat needs the Enterprise plan. Upgrade in Settings to turn it on.",
);

export const requireCsvImportPlan = gate(
  planHasShopFeatures,
  "CSV import needs the Shop plan or higher. Upgrade in Settings to turn it on.",
);

export const requirePricebookPlan = gate(
  planHasShopFeatures,
  "The pricebook needs the Shop plan or higher. Upgrade in Settings to turn it on.",
);

export const requireMaintenancePlan = gate(
  planHasShopFeatures,
  "Maintenance plans and recurring jobs need the Shop plan or higher. Upgrade in Settings to turn it on.",
);
