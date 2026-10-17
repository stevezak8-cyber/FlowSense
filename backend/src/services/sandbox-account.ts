import bcrypt from "bcryptjs"
import { randomBytes } from "node:crypto"
import { prisma } from "../lib/prisma.js"
import { seedSandboxData } from "./sandbox.js"
import { seedPricebook } from "./estimate-ai.js"

export type SandboxPlan = "starter" | "shop" | "fleet" | "enterprise"

export interface SandboxAccount {
  organizationId: string
  name: string
  plan: SandboxPlan
  email: string
  password: string
}

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "sandbox"

/**
 * Makes a sandbox account the way signup does (sample data, a starter pricebook, the
 * sandbox banner) but with no Stripe customer or checkout, so it takes no card and is
 * never billed. For showing the product to a prospect. Nothing here can contact anyone:
 * the sample customers have no emails, and the login address is a made-up one.
 */
export async function createSandboxAccount(opts: { companyName?: string; plan: SandboxPlan; password: string }): Promise<SandboxAccount> {
  const name = opts.companyName?.trim() || "Sandbox Demo"
  const suffix = randomBytes(4).toString("hex")
  const email = `sandbox-${suffix}@pneuros.com`
  const passwordHash = await bcrypt.hash(opts.password, 10)

  const org = await prisma.$transaction(async (tx) => {
    const organization = await tx.organization.create({
      data: { name, slug: `${slugify(name)}-${suffix}`, plan: opts.plan, sandboxMode: true },
    })
    await tx.user.create({
      data: { email, name: "Sandbox Owner", passwordHash, role: "office", organizationId: organization.id },
    })
    return organization
  })

  try {
    await seedSandboxData(org.id)
  } catch (e) {
    // An account with an empty sandbox is worse than none: remove it and say so.
    await prisma.organization.delete({ where: { id: org.id } }).catch(() => {})
    throw e
  }

  // Same as signup: the AI writes the starter pricebook in the background.
  seedPricebook(org.id).catch((err) => console.error("[sandbox-account] pricebook seeding failed:", err))

  return { organizationId: org.id, name, plan: opts.plan, email, password: opts.password }
}
