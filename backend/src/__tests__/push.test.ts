import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("web-push", () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(),
  },
}))

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    pushSubscription: {
      findMany: vi.fn(),
      delete: vi.fn(),
    },
  },
}))

import webpush from "web-push"
import { prisma } from "../lib/prisma.js"

beforeEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
  vi.stubEnv("VAPID_PUBLIC_KEY", "pubkey")
  vi.stubEnv("VAPID_PRIVATE_KEY", "privkey")
  vi.stubEnv("VAPID_SUBJECT", "mailto:test@test.com")
})

describe("sendPushToUser", () => {
  it("sends to all subscriptions for a user", async () => {
    ;(prisma.pushSubscription.findMany as any).mockResolvedValue([
      { id: "sub-1", endpoint: "https://push.example.com/1", p256dh: "p256dh1", auth: "auth1" },
      { id: "sub-2", endpoint: "https://push.example.com/2", p256dh: "p256dh2", auth: "auth2" },
    ])
    ;(webpush.sendNotification as any).mockResolvedValue({})

    const { sendPushToUser } = await import("../services/push.js")
    await sendPushToUser("user-1", { title: "Test", body: "Hello" })

    expect(webpush.sendNotification).toHaveBeenCalledTimes(2)
  })

  it("is a no-op when VAPID keys are absent", async () => {
    vi.unstubAllEnvs()
    const { sendPushToUser } = await import("../services/push.js")
    await sendPushToUser("user-1", { title: "Test", body: "Hello" })
    expect(webpush.sendNotification).not.toHaveBeenCalled()
  })

  it("deletes stale subscription on 410", async () => {
    ;(prisma.pushSubscription.findMany as any).mockResolvedValue([
      { id: "sub-1", endpoint: "https://push.example.com/1", p256dh: "p256dh1", auth: "auth1" },
    ])
    const err = Object.assign(new Error("Gone"), { statusCode: 410 })
    ;(webpush.sendNotification as any).mockRejectedValue(err)

    const { sendPushToUser } = await import("../services/push.js")
    await sendPushToUser("user-1", { title: "Test", body: "Gone" })

    expect(prisma.pushSubscription.delete).toHaveBeenCalledWith({ where: { id: "sub-1" } })
  })

  it("deletes stale subscription on 404", async () => {
    ;(prisma.pushSubscription.findMany as any).mockResolvedValue([
      { id: "sub-1", endpoint: "https://push.example.com/1", p256dh: "p256dh1", auth: "auth1" },
    ])
    const err = Object.assign(new Error("Not Found"), { statusCode: 404 })
    ;(webpush.sendNotification as any).mockRejectedValue(err)

    const { sendPushToUser } = await import("../services/push.js")
    await sendPushToUser("user-1", { title: "Test", body: "Not Found" })

    expect(prisma.pushSubscription.delete).toHaveBeenCalledWith({ where: { id: "sub-1" } })
  })
})
