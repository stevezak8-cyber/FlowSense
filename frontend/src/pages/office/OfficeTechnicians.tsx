"use client"

import { useState, useEffect } from "react"
import { api } from "@/api/client"
import type { ApiTechnician } from "@/api/types"
import { TechGrid } from "@/components/technicians/tech-grid"
import { AddTechnicianDialog } from "@/components/technicians/add-technician-dialog"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Users, Truck } from "lucide-react"

export default function OfficeTechniciansPage() {
  const [technicians, setTechnicians] = useState<ApiTechnician[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api
      .get<ApiTechnician[]>("/api/technicians")
      .then(setTechnicians)
      .catch((e) => console.error("Failed to fetch technicians:", e))
      .finally(() => setLoading(false))
  }, [])

  const total = technicians.length
  const withVehicle = technicians.filter((t) => t.vehicle !== null).length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Technician Management</h1>
          <p className="mt-1 text-sm text-muted-foreground">View skills, certifications, and vehicle assignments</p>
        </div>
        <AddTechnicianDialog onCreated={(tech) => setTechnicians((prev) => [tech, ...prev])} />
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

      <TechGrid technicians={technicians} loading={loading} />
    </div>
  )
}
