"use client"

import { useState, useEffect } from "react"
import { useSearchParams } from "react-router-dom"
import { api } from "@/api/client"
import type { ApiTechnician } from "@/api/types"
import { TechGrid } from "@/components/technicians/tech-grid"
import { AddTechnicianDialog } from "@/components/technicians/add-technician-dialog"
import { PageError } from "@/components/page-error"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Users, Truck, Wrench } from "lucide-react"
import { toast } from "sonner"
import { useOnboarding } from "@/components/office/onboarding-context"

export default function OfficeTechniciansPage() {
  const [technicians, setTechnicians] = useState<ApiTechnician[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()
  const { triggerRefresh } = useOnboarding()

  function fetchTechs() {
    setLoading(true)
    setError(null)
    api
      .get<ApiTechnician[]>("/api/technicians")
      .then(setTechnicians)
      .catch((e: unknown) => setError((e as Error).message ?? "Failed to load"))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchTechs() }, [])

  useEffect(() => {
    if (searchParams.get("open") === "add-technician") {
      setDialogOpen(true)
      setSearchParams((prev) => { prev.delete("open"); return prev })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleDelete(id: string) {
    try {
      await api.delete(`/api/technicians/${id}`)
      setTechnicians((prev) => prev.filter((t) => t.id !== id))
      toast.success("Technician removed")
    } catch (e: unknown) {
      const msg = (e as { message?: string })?.message ?? ""
      if (msg.includes("existing jobs")) {
        toast.error("This technician has existing jobs assigned and cannot be deleted.")
      } else {
        toast.error("Failed to delete technician. Please try again.")
      }
    }
  }

  const total = technicians.length
  const withVehicle = technicians.filter((t) => t.vehicle !== null).length

  if (error) return <PageError message={error} onRetry={fetchTechs} />

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Technician Management</h1>
          <p className="mt-1 text-sm text-muted-foreground">View skills, certifications, and vehicle assignments</p>
        </div>
        <AddTechnicianDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          onCreated={(tech) => {
            setTechnicians((prev) => [tech, ...prev])
            triggerRefresh()
          }}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="border-border bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Total Technicians</CardTitle>
            <Users className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-card-foreground">{total}</div></CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-mono uppercase tracking-wider text-muted-foreground">With Vehicle</CardTitle>
            <Truck className="h-4 w-4 text-accent" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-card-foreground">{withVehicle}</div></CardContent>
        </Card>
      </div>

      {!loading && technicians.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Wrench className="mb-4 h-12 w-12 text-muted-foreground/40" />
          <h3 className="text-lg font-medium text-foreground">No technicians yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Add your first technician to start dispatching jobs.
          </p>
          <button
            onClick={() => setDialogOpen(true)}
            className="mt-6 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700"
          >
            Add Technician
          </button>
        </div>
      )}

      <TechGrid technicians={technicians} loading={loading} onDelete={handleDelete} />
    </div>
  )
}
