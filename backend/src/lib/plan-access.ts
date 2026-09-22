/**
 * What each subscription plan unlocks. Organization.plan is a free-text
 * string ("starter" | "shop" | "fleet" | "enterprise" | "trial" |
 * "cancelled" | "payment_failed") rather than a Prisma enum, so this file is
 * the one place that turns that string into yes/no answers.
 *
 * "trial" only occurs when Stripe isn't configured at all (local dev/tests
 * with no STRIPE_SECRET_KEY) — a real signup's plan is set to its chosen
 * tier immediately, trial or not, and trialEndsAt tracks the trial window
 * separately. So "trial" here means "no billing wired up" and gets full
 * access rather than blocking local development.
 */

const ADVANCED_PLANS = new Set(["fleet", "enterprise", "trial"]);
const CONCIERGE_PLANS = new Set(["enterprise", "trial"]);
const SHOP_PLANS = new Set(["shop", "fleet", "enterprise", "trial"]);

// The AI-driven features: co-pilot & job summaries, smart dispatch, AI-drafted
// estimates, revenue analytics. This is the line between "runs the shop" and
// "does the work" — Fleet and up.
export function planHasAdvancedFeatures(plan: string): boolean {
  return ADVANCED_PLANS.has(plan);
}

// The customer-facing AI concierge chat — Enterprise only.
export function planHasConcierge(plan: string): boolean {
  return CONCIERGE_PLANS.has(plan);
}

// Everything above Starter: CSV import, the pricebook, and maintenance plans
// & recurring jobs. None of these call the AI — they're plain CRUD and
// scheduling, so there's no reason to hold them for the AI-priced tiers.
export function planHasShopFeatures(plan: string): boolean {
  return SHOP_PLANS.has(plan);
}

// Kept as its own name for callers/tests that are specifically about import.
export const planHasCsvImport = planHasShopFeatures;

const TECHNICIAN_CAPS: Record<string, number> = { starter: 2 };
export function technicianCapFor(plan: string): number | null {
  return TECHNICIAN_CAPS[plan] ?? null;
}

const OFFICE_SEAT_CAPS: Record<string, number> = { starter: 1 };
export function officeSeatCapFor(plan: string): number | null {
  return OFFICE_SEAT_CAPS[plan] ?? null;
}
