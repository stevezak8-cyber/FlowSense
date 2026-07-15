import { getAll, dequeue, updateRetryCount } from "./sync-queue"
import toast from "react-hot-toast"

async function replay() {
  const actions = await getAll()
  for (const action of actions) {
    try {
      const token = localStorage.getItem("flowsense_token")
      const res = await fetch(action.url, {
        method: action.method,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(action.body),
      })

      if (res.ok || res.status === 204) {
        await dequeue(action.id!)
      } else if (res.status >= 400 && res.status < 500) {
        // Server rejected — remove from queue, continue to next item
        await dequeue(action.id!)
        toast.error("A queued update was rejected by the server.")
      } else {
        // Server error — increment retry count
        const next = action.retryCount + 1
        if (next >= 3) {
          await dequeue(action.id!)
          toast.error("Failed to sync update — please refresh and try again.")
        } else {
          await updateRetryCount(action.id!, next)
        }
      }
    } catch {
      // Network still down — increment retry count
      const next = action.retryCount + 1
      if (next >= 3) {
        await dequeue(action.id!)
        toast.error("Failed to sync update — please refresh and try again.")
      } else {
        await updateRetryCount(action.id!, next)
      }
    }
  }
}

export function initSyncManager() {
  window.addEventListener("online", () => {
    replay().catch(console.error)
  })
}
