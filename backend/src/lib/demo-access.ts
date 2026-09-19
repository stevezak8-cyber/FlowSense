/**
 * The one-click demo login signs anyone in to a shared seed account. It stays
 * on for local development, but in production it must be switched on
 * explicitly with DEMO_ENABLED=true — otherwise anyone who finds the endpoint
 * can use that account (and its AI features) on our bill.
 */
export function demoLoginEnabled(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.DEMO_ENABLED === "true"
}
