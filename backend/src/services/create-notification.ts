import { prisma } from "../lib/prisma.js"

export async function createNotification(params: {
  organizationId: string
  type: string
  title: string
  body: string
  link?: string
}) {
  try {
    await prisma.notification.create({ data: params })
  } catch (e) {
    console.error("[notification] Failed to create notification:", e)
  }
}
