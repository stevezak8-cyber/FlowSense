import webpush from "web-push"
import { prisma } from "../lib/prisma.js"

function isConfigured(): boolean {
  const pub = process.env.VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  const sub = process.env.VAPID_SUBJECT
  if (!pub || !priv || !sub) return false
  webpush.setVapidDetails(sub, pub, priv)
  return true
}

export interface PushPayload {
  title: string
  body: string
  url?: string
}

export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  if (!isConfigured()) return
  const subscriptions = await prisma.pushSubscription.findMany({ where: { userId } })
  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload)
        )
      } catch (err: unknown) {
        const code = (err as { statusCode?: number }).statusCode
        if (code === 404 || code === 410) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } })
        } else {
          console.error("[Push] Failed to send:", err)
        }
      }
    })
  )
}
