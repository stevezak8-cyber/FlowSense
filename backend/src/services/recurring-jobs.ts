import { prisma } from "../lib/prisma.js"

export async function spawnDueJobs(organizationId?: string): Promise<number> {
  const lookahead = new Date()
  lookahead.setDate(lookahead.getDate() + 14)

  try {
    const schedules = await prisma.recurringJob.findMany({
      where: {
        isActive: true,
        nextDueAt: { lte: lookahead },
        ...(organizationId ? { organizationId } : {}),
        jobs: { none: { status: "pending" } },
      },
    })

    let created = 0
    for (const schedule of schedules) {
      await prisma.job.create({
        data: {
          organizationId: schedule.organizationId,
          customerId: schedule.customerId,
          technicianId: schedule.technicianId ?? undefined,
          equipmentId: schedule.equipmentId ?? undefined,
          equipmentType: schedule.equipmentType ?? undefined,
          serviceType: schedule.serviceType ?? undefined,
          symptomSummary: schedule.notes ?? null,
          scheduledAt: schedule.nextDueAt,
          status: "pending",
          recurringJobId: schedule.id,
        },
      })
      created++
    }

    return created
  } catch (e) {
    console.error("[spawnDueJobs] Failed to spawn recurring jobs:", e)
    throw e
  }
}
