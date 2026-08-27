import { useEffect } from "react"
import { Outlet, useSearchParams } from "react-router-dom"
import { toast } from "sonner"
import { AppSidebar } from "@/components/app-sidebar"
import { TopHeader } from "@/components/top-header"
import { TrialBanner } from "@/components/office/trial-banner"
import { SubscriptionCancelledScreen } from "@/components/office/subscription-cancelled-screen"
import { OnboardingProvider } from "@/components/office/onboarding-context"

export default function OfficeLayout() {
  const [searchParams, setSearchParams] = useSearchParams()

  useEffect(() => {
    if (searchParams.get("checkout") === "success") {
      toast.success("Welcome to Pneuros. Let's get your team set up.")
      setSearchParams((prev) => {
        prev.delete("checkout")
        return prev
      })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <OnboardingProvider>
      <div className="flex min-h-screen bg-background">
        <AppSidebar />
        <div className="flex flex-1 flex-col pl-[220px]">
          <TopHeader />
          <TrialBanner />
          <main className="flex-1 px-8 py-8">
            <Outlet />
          </main>
        </div>
        <SubscriptionCancelledScreen />
      </div>
    </OnboardingProvider>
  )
}
