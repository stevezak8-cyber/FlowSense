import { Router } from "express"
import { prisma } from "../lib/prisma.js"

export const onboardingRouter = Router()

onboardingRouter.get("/status", async (req, res) => {
  const { organizationId } = req.user!

  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      onboardingDismissed: true,
      phone: true,
      address: true,
      stripeConnectOnboarded: true,
      smsEnabled: true,
    },
  })

  if (!org) return res.status(404).json({ error: "Organization not found" })

  // Sandbox sample data must not tick off "add your first ..." steps.
  const [technicians, customers, jobs] = await Promise.all([
    prisma.technician.count({ where: { organizationId, isSample: false } }),
    prisma.customer.count({ where: { organizationId, isSample: false } }),
    prisma.job.count({ where: { organizationId, customer: { isSample: false } } }),
  ])

  res.json({
    dismissed: org.onboardingDismissed,
    steps: {
      companyProfile: !!(org.phone && org.address),
      technician: technicians > 0,
      customer: customers > 0,
      job: jobs > 0,
      stripeConnect: org.stripeConnectOnboarded === true,
      smsEnabled: org.smsEnabled === true,
    },
  })
})

onboardingRouter.post("/dismiss", async (req, res) => {
  const { organizationId } = req.user!
  await prisma.organization.update({
    where: { id: organizationId },
    data: { onboardingDismissed: true },
  })
  res.json({ ok: true })
})
