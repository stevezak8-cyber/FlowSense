import { Outlet } from "react-router-dom"
import { AppSidebar } from "@/components/app-sidebar"
import { TopHeader } from "@/components/top-header"
import { TrialBanner } from "@/components/office/trial-banner"
import { SubscriptionCancelledScreen } from "@/components/office/subscription-cancelled-screen"

export default function OfficeLayout() {
  return (
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
  )
}
