/// <reference lib="webworker" />
import { precacheAndRoute } from "workbox-precaching"
import { registerRoute } from "workbox-routing"
import { NetworkFirst, CacheFirst } from "workbox-strategies"
import { ExpirationPlugin } from "workbox-expiration"

declare const self: ServiceWorkerGlobalScope

// Injected by vite-plugin-pwa — do not remove
precacheAndRoute(self.__WB_MANIFEST)

// Runtime caching (must live here under injectManifest — workbox.runtimeCaching in vite.config.ts is silently ignored)
registerRoute(
  ({ url }) => url.pathname.startsWith("/api/jobs"),
  new NetworkFirst({
    cacheName: "jobs-cache",
    plugins: [new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 })],
  })
)

registerRoute(
  ({ url }) => url.pathname.startsWith("/api/technicians"),
  new CacheFirst({
    cacheName: "technicians-cache",
    plugins: [new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 7 })],
  })
)

// Push notification handler
self.addEventListener("push", (event) => {
  const data = (event as PushEvent).data?.json() ?? {}
  event.waitUntil(
    self.registration.showNotification(data.title ?? "FlowSense", {
      body: data.body ?? "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: data.url ?? "/" },
    })
  )
})

// Open the target URL when notification is clicked
self.addEventListener("notificationclick", (event) => {
  ;(event as NotificationEvent).notification.close()
  event.waitUntil(
    (self as unknown as { clients: { openWindow(url: string): Promise<void> } }).clients.openWindow(
      (event as NotificationEvent).notification.data.url
    )
  )
})
