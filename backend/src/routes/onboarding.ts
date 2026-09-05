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
      _count: { select: { technicians: true, customers: true, jobs: true } },
    },
  })

  if (!org) return res.status(404).json({ error: "Organization not found" })

  res.json({
    dismissed: org.onboardingDismissed,
    steps: {
      companyProfile: !!(org.phone && org.address),
      technician: org._count.technicians > 0,
      customer: org._count.customers > 0,
      job: org._count.jobs > 0,
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
