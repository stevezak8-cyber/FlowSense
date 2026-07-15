# PWA — Design Spec

**Date:** 2026-07-15  
**Feature:** Feature 3 of 9 — Progressive Web App  
**Status:** Approved for implementation

---

## Overview

Four PWA subsystems built on top of the existing foundation (`vite-plugin-pwa`, manifest, icons, install prompt):

1. **SW Update Notification** — banner prompting users to refresh when a new version is deployed
2. **Offline Indicator** — banner showing connection state and queued action count
3. **Web Push Notifications** — native push alerts to technician devices for job assignments, updates, and messages
4. **Background Sync (offline queue)** — IndexedDB queue that replays failed PATCH requests on reconnect

The existing infrastructure (`vite.config.ts` VitePWA config, `icon-192.png`, `icon-512.png`, `index.html` meta tags, install prompt in `TechnicianLayout`) remains unchanged.

---

## Prerequisites

Install required packages before implementing:

**Frontend:**
```bash
cd frontend
npm install idb
```

**Backend:**
```bash
cd backend
npm install web-push
npm install --save-dev @types/web-push
```

---

## Subsystem 1: SW Update Notification

### Approach

Use `vite-plugin-pwa`'s `useRegisterSW` hook (exported from `virtual:pwa-register/react`). When the service worker detects a new version, the hook exposes `needRefresh: Ref<boolean>` and `updateServiceWorker(reloadPage: boolean)`.

### Component: `frontend/src/components/pwa/UpdatePrompt.tsx`

- Calls `useRegisterSW({ onNeedRefresh() { setShow(true) } })`
- When `needRefresh` is true, renders a fixed bottom banner:
  - *"A new version of FlowSense is available."* + **"Update now"** button
  - Tapping calls `updateServiceWorker(true)` which activates the new SW and reloads
- Dismissable (X button hides it for the session)

### Mount

Import and render `<UpdatePrompt />` in `frontend/src/App.tsx` (top level, outside router, always mounted).

---

## Subsystem 2: Offline Indicator

### Approach

`window.navigator.onLine` + `online`/`offline` events. No service worker involvement needed.

### Component: `frontend/src/components/pwa/OfflineIndicator.tsx`

- State: `isOnline`, `queuedCount` (from IndexedDB — see Subsystem 4)
- When offline: fixed top banner (amber) — *"You're offline — N updates queued, will sync when reconnected"* (or *"You're offline"* if queue is empty)
- When just came back online: brief green banner — *"Back online"* — auto-hides after 3 seconds
- Listens to `online` and `offline` window events
- Reads queue count from IndexedDB on mount and when queue changes (via a custom event `flowsense:queue-changed` dispatched by the sync manager)

### Mount

Render `<OfflineIndicator />` in `frontend/src/App.tsx` alongside `<UpdatePrompt />`.

---

## Subsystem 3: Web Push Notifications

### Backend

#### VAPID key pair

Generate once:
```bash
npx web-push generate-vapid-keys
```

Store in environment:
- `VAPID_PUBLIC_KEY` — shared with the frontend
- `VAPID_PRIVATE_KEY` — backend only
- `VAPID_SUBJECT` — contact URL or mailto, e.g. `mailto:admin@flowsense.app`

All three required for push to work. Missing = silent skip (same pattern as SMS/email).

#### Schema: `PushSubscription` model

```prisma
model PushSubscription {
  id             String       @id @default(cuid())
  userId         String
  organizationId String
  endpoint       String       @unique
  p256dh         String
  auth           String
  createdAt      DateTime     @default(now())
  user           User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
}
```

Also add back-relations to `User` and `Organization` models:
```prisma
// In User model:
pushSubscriptions PushSubscription[]

// In Organization model:
pushSubscriptions PushSubscription[]
```

#### New service: `backend/src/services/push.ts`

```typescript
import webpush from "web-push"
```

- Silent-skip pattern: if `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, or `VAPID_SUBJECT` are absent, all send functions are no-ops
- Configures `webpush.setVapidDetails(subject, publicKey, privateKey)` on module load
- Exports:
  - `sendPushToUser(userId, payload)` — loads all subscriptions for userId, sends to each, removes stale subscriptions on 404 (Not Found) or 410 (Gone) errors
  - `payload` shape: `{ title: string, body: string, url?: string }`

#### New routes: `backend/src/routes/push.ts`

Mounted at `/api/push`, under `requireAuth`.

- `GET /vapid-public-key` — returns `{ publicKey: process.env.VAPID_PUBLIC_KEY }` (or 503 if not configured)
- `POST /subscribe` — upserts a PushSubscription for the current user:
  ```
  body: { endpoint: string, keys: { p256dh: string, auth: string } }
  ```
  Uses `upsert` on `endpoint` (unique) to handle re-subscriptions.
- `DELETE /subscribe` — deletes subscription by endpoint:
  ```
  body: { endpoint: string }
  ```

#### Push trigger points

All fire-and-forget (`.catch(console.error)`), alongside existing WebSocket `notifyInApp` calls:

| Event | Trigger location | Recipient |
|---|---|---|
| Job assigned to tech | `PATCH /api/jobs/:id` when `technicianId` changes | The assigned technician's userId |
| Job updated (reschedule/notes) | `PATCH /api/jobs/:id` when `scheduledAt` or `symptomSummary` changes | Assigned technician |
| New conversation message | `POST /api/conversations/:id/messages` | Participants other than sender |

**Participant-to-userId resolution for conversation push:**

`Conversation.participants` is a `String[]` containing technicianIds. To resolve to userIds for `sendPushToUser`:

```typescript
const technicians = await prisma.technician.findMany({
  where: { id: { in: participantIds.filter(id => id !== senderTechId) } },
  select: { user: { select: { id: true } } },
})
const userIds = technicians.flatMap(t => t.user ? [t.user.id] : [])
await Promise.all(userIds.map(uid => sendPushToUser(uid, payload).catch(console.error)))
```

Push payload examples:
- Job assigned: `{ title: "New Job Assigned", body: "AC repair at 123 Main St — Mon Jul 20 at 2pm", url: "/technician" }`
- Job updated: `{ title: "Job Updated", body: "Your 2pm appointment has been rescheduled", url: "/technician" }`
- New message: `{ title: "New Message", body: "Office: Check the notes for this job", url: "/technician/messages" }`

### Frontend

#### Hook: `frontend/src/hooks/usePushNotifications.ts`

```typescript
export function usePushNotifications() {
  // Returns: { permission, supported, subscribe, unsubscribe, isSubscribed }
}
```

- `supported`: `"Notification" in window && "PushManager" in window`
- `subscribe()`:
  1. Calls `Notification.requestPermission()`
  2. If granted: fetches VAPID public key from `GET /api/push/vapid-public-key`
  3. Calls `navigator.serviceWorker.ready` then `registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) })`
  4. POSTs subscription to `POST /api/push/subscribe`
- `unsubscribe()`: calls `subscription.unsubscribe()` + `DELETE /api/push/subscribe`
- Persists `isSubscribed` state in `localStorage` to avoid re-prompting on every page load

#### In-browser push handler

In the service worker (via `vite-plugin-pwa` custom SW injection or `additionalManifestEntries`), handle `push` events:

```javascript
self.addEventListener("push", (event) => {
  const data = event.data?.json() ?? {}
  event.waitUntil(
    self.registration.showNotification(data.title ?? "FlowSense", {
      body: data.body,
      icon: "/icon-192.png",
      data: { url: data.url ?? "/" },
    })
  )
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  event.waitUntil(clients.openWindow(event.notification.data.url))
})
```

This requires adding a custom service worker file. With `vite-plugin-pwa`, set `strategies: "injectManifest"` and `srcDir/filename` pointing to a custom SW file that imports workbox precaching and adds the push handlers.

#### Notification prompt in TechnicianLayout

After the install prompt banner (or instead of it when already installed), show a "Enable notifications" prompt if `Notification.permission === "default"` and `supported`:
- Banner: *"Get notified about new jobs instantly."* + **"Enable"** button + **"Not now"** (dismisses and stores in localStorage)
- Tapping "Enable" calls `subscribe()`

---

## Subsystem 4: Background Sync (Offline Queue)

### Approach

No SW Background Sync API (unreliable on iOS). Instead: intercept network errors in the API client, queue to IndexedDB, replay on `online` event.

### IndexedDB schema

Database: `flowsense-sync` (version 1)  
Object store: `pending-actions`  
Key: auto-increment

Record shape:
```typescript
interface QueuedAction {
  id?: number          // auto-assigned
  method: string       // "PATCH"
  url: string          // "/api/jobs/xyz/status"
  body: object
  timestamp: number
  retryCount: number
}
```

### Library: `frontend/src/lib/sync-queue.ts`

Exports:
- `enqueue(action)` — adds to IndexedDB, dispatches `flowsense:queue-changed` custom event
- `dequeue(id)` — removes by id
- `getAll()` — returns all pending actions sorted by timestamp
- `getCount()` — returns queue length (used by OfflineIndicator)

Uses the `idb` npm package for typed IndexedDB access.

### Integration in API client: `frontend/src/api/client.ts`

The existing `api.patch()` function catches network errors (fetch throws on DNS failure / no connection, not on 4xx). Wrap the PATCH method to:

1. On network error (`instanceof TypeError` with `message.includes("fetch")`):
   - If the URL matches `/api/jobs/` — enqueue the action
   - Show a toast: *"You're offline — update queued"*
   - Return a synthetic success response so the UI doesn't break
2. On success after offline: the sync manager handles re-confirmation

**Only PATCH calls to `/api/jobs/` are queued.** Other endpoints (billing, settings, etc.) are not queued — failure is an error there.

### Sync manager: `frontend/src/lib/sync-manager.ts`

- Listens to `window.addEventListener("online", replay)`
- `replay()`:
  1. Gets all queued actions from IndexedDB
  2. Replays each in order (sequential, not parallel)
  3. On success: removes from queue, dispatches `flowsense:queue-changed`
  4. On failure (network error again): increments `retryCount`; if `retryCount >= 3`, removes and shows toast error: *"Failed to sync update — please refresh and try again"*
  5. On 4xx: removes from queue and shows toast error (the server rejected it — don't retry); **processing continues to the next item in the queue** — a single rejected item does not abort the replay loop
- Initialize in `frontend/src/App.tsx` via `useEffect(() => { initSyncManager() }, [])`

---

## Service Worker Strategy Change

Currently `vite.config.ts` uses `strategies: "generateSW"` (default — Workbox generates the SW automatically). To support push notification handlers, switch to `strategies: "injectManifest"` with a custom `sw.ts` file.

### `frontend/src/sw.ts` (custom service worker)

Under `injectManifest` strategy, `workbox.runtimeCaching` in `vite.config.ts` is **silently ignored** — it only works under `generateSW`. Runtime caching must be expressed as explicit `registerRoute` calls inside `sw.ts`:

```typescript
import { precacheAndRoute } from "workbox-precaching"
import { registerRoute } from "workbox-routing"
import { NetworkFirst } from "workbox-strategies"

// Injected by vite-plugin-pwa — do not remove
declare const self: ServiceWorkerGlobalScope
precacheAndRoute(self.__WB_MANIFEST)

// Runtime caching (previously in vite.config.ts workbox.runtimeCaching — must live here under injectManifest)
registerRoute(
  ({ url }) => url.pathname.startsWith("/api/jobs"),
  new NetworkFirst({ cacheName: "jobs-cache" })
)
registerRoute(
  ({ url }) => url.pathname.startsWith("/api/technicians"),
  new NetworkFirst({ cacheName: "technicians-cache" })
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

// Notification click — open the target URL
self.addEventListener("notificationclick", (event) => {
  (event as NotificationEvent).notification.close()
  event.waitUntil(
    (self as any).clients.openWindow((event as NotificationEvent).notification.data.url)
  )
})
```

### Updated `vite.config.ts` (VitePWA section)

Change `strategies` to `"injectManifest"` and add `srcDir`/`filename`. Remove the existing `workbox.runtimeCaching` block (it is now in `sw.ts`):

```typescript
strategies: "injectManifest",
srcDir: "src",
filename: "sw.ts",
```

The manifest, icons, and other VitePWA options remain unchanged. Only the strategy and the runtime caching location change.

---

## Environment Variables

| Variable | Description |
|---|---|
| `VAPID_PUBLIC_KEY` | VAPID public key (share with frontend) |
| `VAPID_PRIVATE_KEY` | VAPID private key (backend only) |
| `VAPID_SUBJECT` | Contact URI, e.g. `mailto:admin@flowsense.app` |

---

## New Files

| File | Purpose |
|---|---|
| `frontend/src/sw.ts` | Custom service worker with push handlers |
| `frontend/src/components/pwa/UpdatePrompt.tsx` | SW update notification banner |
| `frontend/src/components/pwa/OfflineIndicator.tsx` | Online/offline status banner |
| `frontend/src/hooks/usePushNotifications.ts` | Push subscription management hook |
| `frontend/src/lib/sync-queue.ts` | IndexedDB queue CRUD |
| `frontend/src/lib/sync-manager.ts` | Online event replay logic |
| `backend/src/services/push.ts` | web-push send service |
| `backend/src/routes/push.ts` | Push subscription API routes |

---

## Modified Files

| File | Change |
|---|---|
| `frontend/vite.config.ts` | Switch to `injectManifest` strategy, add `srcDir`/`filename` |
| `frontend/src/App.tsx` | Mount `<UpdatePrompt />`, `<OfflineIndicator />`, init sync manager |
| `frontend/src/api/client.ts` | Enqueue failed PATCH /api/jobs/ calls |
| `frontend/src/pages/technician/TechnicianLayout.tsx` | Add notification permission prompt |
| `backend/prisma/schema.prisma` | Add `PushSubscription` model |
| `backend/src/index.ts` | Mount push routes |
| `backend/src/routes/jobs.ts` | Fire push on job assign/update |
| `backend/src/routes/conversations.ts` | Fire push on new message |

---

## Out of Scope

- Background sync for anything other than PATCH `/api/jobs/`
- Time tracking background sync (feature not yet built)
- Push notifications to office users (techs only for now)
- Push notification preferences per user (all-or-nothing opt-in)
- Safari/iOS push (requires Apple Developer account and different flow — marked future work)
- Conflict resolution for offline edits (last-write-wins via sequential replay)
