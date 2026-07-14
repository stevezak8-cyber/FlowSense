import { createContext, useContext, useState, useCallback } from "react"
import type { ReactNode } from "react"

interface OnboardingContextValue {
  refreshKey: number
  triggerRefresh: () => void
}

const OnboardingContext = createContext<OnboardingContextValue>({
  refreshKey: 0,
  triggerRefresh: () => {},
})

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [refreshKey, setRefreshKey] = useState(0)
  const triggerRefresh = useCallback(() => setRefreshKey((k) => k + 1), [])
  return (
    <OnboardingContext.Provider value={{ refreshKey, triggerRefresh }}>
      {children}
    </OnboardingContext.Provider>
  )
}

export function useOnboarding() {
  return useContext(OnboardingContext)
}
