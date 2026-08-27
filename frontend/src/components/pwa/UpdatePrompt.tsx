import { useState } from "react"
import { useRegisterSW } from "virtual:pwa-register/react"

export function UpdatePrompt() {
  const [show, setShow] = useState(false)
  const { updateServiceWorker } = useRegisterSW({
    onNeedRefresh() {
      setShow(true)
    },
  })

  if (!show) return null

  return (
    <div className="fixed bottom-20 inset-x-0 z-50 flex justify-center px-4">
      <div className="flex items-center gap-3 rounded-lg bg-card border border-border shadow-lg px-4 py-3 text-sm max-w-sm w-full">
        <span className="flex-1 text-foreground">A new version of Pneuros is available.</span>
        <button
          type="button"
          onClick={() => updateServiceWorker(true)}
          className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground"
        >
          Update now
        </button>
        <button
          type="button"
          onClick={() => setShow(false)}
          className="text-muted-foreground hover:text-foreground text-xs"
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>
    </div>
  )
}
