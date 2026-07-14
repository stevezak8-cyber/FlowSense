import Stripe from "stripe"

const key = process.env.STRIPE_SECRET_KEY
export const stripe = key ? new Stripe(key, { apiVersion: "2026-04-22.dahlia" }) : null

export function getPriceId(plan: "entry" | "core" | "premium" | string): string {
  const map: Record<string, string | undefined> = {
    entry: process.env.STRIPE_PRICE_ID_ENTRY,
    core: process.env.STRIPE_PRICE_ID_CORE,
    premium: process.env.STRIPE_PRICE_ID_PREMIUM,
  }
  const id = map[plan]
  if (!id) throw new Error(`Unknown plan: ${plan}`)
  return id
}
