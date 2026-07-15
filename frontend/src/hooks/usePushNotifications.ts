import { useState, useEffect } from "react"
import { api } from "@/api/client"

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")
  const rawData = atob(base64)
  return Uint8Array.from(rawData, (c) => c.charCodeAt(0))
}

export function usePushNotifications() {
  const supported =
    typeof window !== "undefined" &&
    "Notification" in window &&
    "PushManager" in window

  const [permission, setPermission] = useState<NotificationPermission>(
    supported ? Notification.permission : "denied"
  )
  const [isSubscribed, setIsSubscribed] = useState(() => {
    return localStorage.getItem("push-subscribed") === "true"
  })

  useEffect(() => {
    if (!supported) return
    setPermission(Notification.permission)
  }, [supported])

  async function subscribe() {
    if (!supported) return
    const perm = await Notification.requestPermission()
    setPermission(perm)
    if (perm !== "granted") return

    try {
      const { publicKey } = await api.get<{ publicKey: string }>("/api/push/vapid-public-key")
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      })
      const json = subscription.toJSON()
      await api.post("/api/push/subscribe", {
        endpoint: subscription.endpoint,
        keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
      })
      localStorage.setItem("push-subscribed", "true")
      setIsSubscribed(true)
    } catch (err) {
      console.error("[Push] Subscribe failed:", err)
    }
  }

  async function unsubscribe() {
    if (!supported) return
    try {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()
      if (subscription) {
        await api.delete(`/api/push/subscribe?endpoint=${encodeURIComponent(subscription.endpoint)}`)
        await subscription.unsubscribe()
      }
      localStorage.removeItem("push-subscribed")
      setIsSubscribed(false)
    } catch (err) {
      console.error("[Push] Unsubscribe failed:", err)
    }
  }

  return { permission, supported, subscribe, unsubscribe, isSubscribed }
}
