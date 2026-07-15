import { useState, useEffect } from "react"
import { getCount } from "@/lib/sync-queue"

export function OfflineIndicator() {
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [showBackOnline, setShowBackOnline] = useState(false)
  const [queuedCount, setQueuedCount] = useState(0)

  useEffect(() => {
    function handleOffline() {
      setIsOnline(false)
      setShowBackOnline(false)
    }

    function handleOnline() {
      setIsOnline(true)
      setShowBackOnline(true)
      setTimeout(() => setShowBackOnline(false), 3000)
    }

    function handleQueueChanged() {
      getCount().then(setQueuedCount).catch(() => {})
    }

    window.addEventListener("offline", handleOffline)
    window.addEventListener("online", handleOnline)
    window.addEventListener("flowsense:queue-changed", handleQueueChanged)
    handleQueueChanged()

    return () => {
      window.removeEventListener("offline", handleOffline)
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("flowsense:queue-changed", handleQueueChanged)
    }
  }, [])

  if (isOnline && showBackOnline) {
    return (
      <div className="fixed top-0 inset-x-0 z-50 flex justify-center">
        <div className="bg-success text-white px-4 py-2 text-sm font-medium shadow-md">
          Back online
        </div>
      </div>
    )
  }

  if (!isOnline) {
    return (
      <div className="fixed top-0 inset-x-0 z-50 flex justify-center">
        <div className="bg-amber-500 text-white px-4 py-2 text-sm font-medium shadow-md">
          {queuedCount > 0
            ? `You're offline — ${queuedCount} update${queuedCount === 1 ? "" : "s"} queued, will sync when reconnected`
            : "You're offline"}
        </div>
      </div>
    )
  }

  return null
}
