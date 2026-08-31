/// <reference lib="webworker" />
import { precacheAndRoute } from "workbox-precaching"
import { registerRoute } from "workbox-routing"
import { NetworkFirst, CacheFirst } from "workbox-strategies"
import { ExpirationPlugin } from "workbox-expiration"

declare const self: ServiceWorkerGlobalScope

// Injected by vite-plugin-pwa — do not remove
precacheAndRoute(self.__WB_MANIFEST)

// Runtime caching
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

// ── Offline action queue ──────────────────────────────────────────────────────
// When a job PATCH/POST fails due to network, store in IndexedDB and replay
// when the connection comes back via Background Sync.

const DB_NAME = "pneuros-offline"
const STORE = "action-queue"
const SYNC_TAG = "job-action-sync"

interface QueuedAction {
  id: string
  url: string
  method: string
  body: string
  headers: Record<string, string>
  queuedAt: number
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" })
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function enqueue(action: QueuedAction) {
  const db = await openDb()
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite")
    tx.objectStore(STORE).put(action)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function dequeue(id: string) {
  const db = await openDb()
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite")
    tx.objectStore(STORE).delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function getAllQueued(): Promise<QueuedAction[]> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly")
    const req = tx.objectStore(STORE).getAll()
    req.onsuccess = () => resolve(req.result as QueuedAction[])
    req.onerror = () => reject(req.error)
  })
}

// Intercept job mutation requests
self.addEventListener("fetch", (event) => {
  const req = (event as FetchEvent).request
  const url = new URL(req.url)

  // Only intercept job PATCH/POST (status changes, completions)
  const isJobMutation =
    (url.pathname.match(/^\/api\/jobs\/[^/]+$/) && req.method === "PATCH") ||
    (url.pathname === "/api/jobs" && req.method === "POST")

  if (!isJobMutation) return

  ;(event as FetchEvent).respondWith(
    fetch(req.clone()).catch(async () => {
      // Offline — queue it
      const body = await req.clone().text()
      const headers: Record<string, string> = {}
      req.headers.forEach((v, k) => { headers[k] = v })

      const action: QueuedAction = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        url: req.url,
        method: req.method,
        body,
        headers,
        queuedAt: Date.now(),
      }

      await enqueue(action)

      // Register background sync if supported
      try {
        await (self.registration as ServiceWorkerRegistration & {
          sync: { register(tag: string): Promise<void> }
        }).sync.register(SYNC_TAG)
      } catch { /* Background Sync not supported */ }

      // Return an optimistic 202 so the UI can show a "queued" state
      return new Response(JSON.stringify({ queued: true, actionId: action.id }), {
        status: 202,
        headers: { "Content-Type": "application/json" },
      })
    })
  )
})

// Replay queued actions when back online
self.addEventListener("sync", (event) => {
  if ((event as SyncEvent).tag !== SYNC_TAG) return
  ;(event as SyncEvent).waitUntil(replayQueue())
})

// Also replay on activation (catches cases where sync wasn't registered)
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (self as ServiceWorkerGlobalScope).clients.claim().then(() => replayQueue())
  )
})

async function replayQueue() {
  const actions = await getAllQueued()
  for (const action of actions) {
    try {
      const res = await fetch(action.url, {
        method: action.method,
        headers: action.headers,
        body: action.body || undefined,
      })
      if (res.ok || res.status < 500) {
        await dequeue(action.id)
        // Notify all clients so they can refresh
        const clients = await (self as ServiceWorkerGlobalScope).clients.matchAll()
        clients.forEach(c => c.postMessage({ type: "SYNC_COMPLETE", actionId: action.id }))
      }
    } catch {
      // Still offline — leave in queue
    }
  }
}

// Push notification handler
self.addEventListener("push", (event) => {
  const data = (event as PushEvent).data?.json() ?? {}
  event.waitUntil(
    self.registration.showNotification(data.title ?? "Pneuros", {
      body: data.body ?? "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: data.url ?? "/" },
    })
  )
})

self.addEventListener("notificationclick", (event) => {
  ;(event as NotificationEvent).notification.close()
  event.waitUntil(
    (self as unknown as { clients: { openWindow(url: string): Promise<void> } }).clients.openWindow(
      (event as NotificationEvent).notification.data.url
    )
  )
})
