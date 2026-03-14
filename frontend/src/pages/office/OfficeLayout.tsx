import { Outlet } from "react-router-dom"
import { AppSidebar } from "@/components/app-sidebar"
import { TopHeader } from "@/components/top-header"

export default function OfficeLayout() {
  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar />
      <div className="flex flex-1 flex-col pl-[220px]">
        <TopHeader />
        <main className="flex-1 px-8 py-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
