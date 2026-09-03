import Stripe from "stripe"

const key = process.env.STRIPE_SECRET_KEY
export const stripe = key ? new Stripe(key, { apiVersion: "2026-04-22.dahlia" }) : null

export function getPriceId(plan: "shop" | "fleet" | "enterprise" | string): string {
  const map: Record<string, string | undefined> = {
    shop: process.env.STRIPE_PRICE_ID_SHOP,
    fleet: process.env.STRIPE_PRICE_ID_FLEET,
    enterprise: process.env.STRIPE_PRICE_ID_ENTERPRISE,
  }
  const id = map[plan]
  if (!id) throw new Error(`Unknown plan: ${plan}`)
  return id
}
