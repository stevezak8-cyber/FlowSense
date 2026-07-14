"use client"

import { useState } from "react"
import type { ApiTechnician } from "@/api/types"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { InviteDialog } from "@/components/invite-dialog"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { cn } from "@/lib/utils"
import {
  Mail,
  Phone,
  Award,
  Briefcase,
  Loader2,
  Truck,
  Trash2,
} from "lucide-react"

interface TechGridProps {
  technicians: ApiTechnician[]
  loading?: boolean
  onDelete?: (id: string) => void
}

export function TechGrid({ technicians, loading, onDelete }: TechGridProps) {
  const [selectedTech, setSelectedTech] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Loading technicians...</span>
      </div>
    )
  }

  if (technicians.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Briefcase className="h-8 w-8 text-muted-foreground/50" />
        <p className="mt-3 text-sm text-muted-foreground">No technicians found</p>
      </div>
    )
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {technicians.map((tech) => {
        const isSelected = selectedTech === tech.id
        const initials = tech.name
          .split(" ")
          .map((n) => n[0])
          .join("")
          .toUpperCase()
          .slice(0, 2)
        return (
          <div
            key={tech.id}
            onClick={() => setSelectedTech(isSelected ? null : tech.id)}
            className={cn(
              "cursor-pointer rounded-lg border bg-card p-5 transition-all",
              isSelected
                ? "border-primary/50 ring-1 ring-primary/20"
                : "border-border hover:border-primary/30"
            )}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <Avatar className="h-11 w-11 border border-border">
                  <AvatarFallback className="bg-secondary text-sm text-foreground font-mono">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <div className="text-sm font-semibold text-card-foreground">{tech.name}</div>
                  <div className="font-mono text-[10px] text-muted-foreground">
                    {tech.epa608Level ? `EPA 608 ${tech.epa608Level}` : "Technician"}
                  </div>
                </div>
              </div>
              {tech.vehicle && (
                <Badge variant="outline" className="rounded-sm px-2 py-0.5 text-[10px] font-mono uppercase bg-primary/15 text-primary border-primary/30">
                  <Truck className="mr-1 h-3 w-3" />
                  {tech.vehicle.name}
                </Badge>
              )}
            </div>

            {tech.skills.length > 0 && (
              <div className="mt-4 flex items-center gap-2">
                <Briefcase className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs text-card-foreground capitalize">
                  {tech.skills.join(", ").replace(/-/g, " ")}
                </span>
              </div>
            )}

            {isSelected && (
              <div className="mt-4 space-y-3 border-t border-border pt-4">
                {tech.email && (
                  <div className="flex items-center gap-2 text-xs">
                    <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-card-foreground">{tech.email}</span>
                  </div>
                )}
                {tech.phone && (
                  <div className="flex items-center gap-2 text-xs">
                    <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-card-foreground">{tech.phone}</span>
                  </div>
                )}
                {tech.epa608Level && (
                  <div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                      <Award className="h-3.5 w-3.5" />
                      <span className="font-mono text-[10px] uppercase tracking-wider">Certification</span>
                    </div>
                    <Badge variant="outline" className="rounded-sm border-border bg-secondary px-2 py-0.5 text-[10px] font-mono text-muted-foreground">
                      EPA 608 — {tech.epa608Level}
                    </Badge>
                  </div>
                )}
                <div className="flex items-center justify-between border-t border-border pt-3">
                  <InviteDialog
                    email={tech.email ?? ""}
                    role="technician"
                    technicianId={tech.id}
                    trigger={
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1.5 text-xs"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Mail className="h-3.5 w-3.5" />
                        Send invite
                      </Button>
                    }
                  />
                  {onDelete && (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 gap-1.5 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                        disabled={deleting === tech.id}
                        onClick={(e) => {
                          e.stopPropagation()
                          setPendingDeleteId(tech.id)
                        }}
                      >
                        {deleting === tech.id
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <Trash2 className="h-3.5 w-3.5" />}
                        Delete
                      </Button>
                      <ConfirmDialog
                        open={pendingDeleteId === tech.id}
                        onOpenChange={(open) => { if (!open) setPendingDeleteId(null) }}
                        title={`Delete ${tech.name}?`}
                        description="This will permanently remove the technician from your roster. This cannot be undone."
                        confirmLabel="Delete"
                        onConfirm={() => {
                          setDeleting(tech.id)
                          setPendingDeleteId(null)
                          onDelete(tech.id)
                        }}
                      />
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
