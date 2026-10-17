import bcrypt from "bcryptjs"
import { randomUUID } from "node:crypto"
import { prisma } from "../../lib/prisma.js"
import { buildDemoData } from "./build.js"
import { CUSTOMERS, DEMO_SLUG } from "./content.js"

export const DEMO_EMAILS = {
  office: "demo@pneuros.com",
  technician: "demo-tech@pneuros.com",
  customer: "demo-customer@pneuros.com",
} as const

export interface DemoLogin { role: "office" | "technician" | "customer"; name: string; email: string; password: string }

export interface DemoResetResult {
  organizationId: string
  logins: DemoLogin[]
  counts: Record<string, number>
}

/**
 * Wipes the demo organization (and only that one, found by its fixed slug) and
 * rebuilds it with data dated around `now`. Deleting the organization cascades
 * to everything it owns, so nothing is left behind to collide with.
 */
export async function resetDemoAccount(opts: { password: string; now?: Date }): Promise<DemoResetResult> {
  const now = opts.now ?? new Date()
  const orgId = randomUUID()
  const data = buildDemoData({ now, orgId, idGen: randomUUID })

  const emails = Object.values(DEMO_EMAILS)
  const clash = await prisma.user.findFirst({
    where: { email: { in: emails }, organization: { slug: { not: DEMO_SLUG } } },
    select: { email: true },
  })
  if (clash) throw new Error(`${clash.email} already belongs to another organization`)

  const passwordHash = await bcrypt.hash(opts.password, 10)
  const heroName = CUSTOMERS.find((c) => c.hero)?.name ?? "Demo Customer"
  const leadTech = data.technicians.find((t) => t.id === data.leadTechnicianId)

  await prisma.$transaction(
    async (tx) => {
      await tx.organization.deleteMany({ where: { slug: DEMO_SLUG } })
      await tx.organization.create({ data: data.organization })
      await tx.technician.createMany({ data: data.technicians })
      await tx.vehicle.createMany({ data: data.vehicles })
      await tx.customer.createMany({ data: data.customers })
      await tx.user.createMany({
        data: [
          { email: DEMO_EMAILS.office, name: "Taylor Brooks", passwordHash, role: "office", organizationId: orgId },
          { email: DEMO_EMAILS.technician, name: (leadTech?.name as string) ?? "Marcus Reyes", passwordHash, role: "technician", organizationId: orgId, technicianId: data.leadTechnicianId },
          { email: DEMO_EMAILS.customer, name: heroName, passwordHash, role: "customer", organizationId: orgId, customerId: data.heroCustomerId },
        ],
      })
      await tx.equipment.createMany({ data: data.equipment })
      await tx.pricebookItem.createMany({ data: data.pricebook })
      await tx.recurringJob.createMany({ data: data.recurringJobs })
      await tx.job.createMany({ data: data.jobs })
      await tx.invoice.createMany({ data: data.invoices })
      await tx.estimate.createMany({ data: data.estimates })
      await tx.estimateLine.createMany({ data: data.estimateLines })
      await tx.jobReview.createMany({ data: data.reviews })
      await tx.complianceLog.createMany({ data: data.complianceLogs })
      await tx.maintenancePlan.createMany({ data: data.plans })
      await tx.maintenancePlanItem.createMany({ data: data.planItems })
      await tx.conversation.createMany({ data: data.conversations })
      await tx.message.createMany({ data: data.messages })
      await tx.notification.createMany({ data: data.notifications })
      await tx.blockedDate.createMany({ data: data.blockedDates })
    },
    { timeout: 120_000, maxWait: 15_000 },
  )

  return {
    organizationId: orgId,
    logins: [
      { role: "office", name: "Taylor Brooks", email: DEMO_EMAILS.office, password: opts.password },
      { role: "technician", name: (leadTech?.name as string) ?? "Marcus Reyes", email: DEMO_EMAILS.technician, password: opts.password },
      { role: "customer", name: heroName, email: DEMO_EMAILS.customer, password: opts.password },
    ],
    counts: {
      technicians: data.technicians.length, customers: data.customers.length, equipment: data.equipment.length,
      jobs: data.jobs.length, invoices: data.invoices.length, estimates: data.estimates.length,
      reviews: data.reviews.length, complianceLogs: data.complianceLogs.length, maintenancePlans: data.plans.length,
      conversations: data.conversations.length, pricebookItems: data.pricebook.length,
    },
  }
}
