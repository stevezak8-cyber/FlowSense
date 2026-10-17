import "dotenv/config"
import { resetDemoAccount } from "../services/demo-account/reset.js"
import { prisma } from "../lib/prisma.js"

/**
 * Rebuilds the demo account against whatever DATABASE_URL points at.
 *   npm run demo:reset                      (local database)
 *   DEMO_PASSWORD=... npm run demo:reset -- --remote   (non-local, explicit opt-in)
 * On the live site, use the Reset button on /platform instead.
 */
const url = process.env.DATABASE_URL ?? ""
const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(url)
const remote = process.argv.includes("--remote")

if (!isLocal && !remote) {
  console.error("DATABASE_URL isn't a local database. Pass --remote (and set DEMO_PASSWORD) if you really mean it.")
  process.exit(1)
}
if (!isLocal && !process.env.DEMO_PASSWORD) {
  console.error("Set DEMO_PASSWORD to reset a non-local demo account.")
  process.exit(1)
}

const password = process.env.DEMO_PASSWORD ?? "demo-local-123"
const result = await resetDemoAccount({ password })
console.log(`Demo account rebuilt (${result.organizationId})`)
console.table(result.counts)
for (const l of result.logins) console.log(`${l.role.padEnd(10)} ${l.email}  ${l.password}`)
await prisma.$disconnect()
