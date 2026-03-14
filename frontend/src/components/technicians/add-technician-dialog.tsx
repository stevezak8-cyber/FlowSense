import { useState } from "react"
import { api } from "@/api/client"
import type { ApiTechnician } from "@/api/types"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Plus } from "lucide-react"

const EPA_LEVELS = ["Universal", "Type I", "Type II", "Type III"] as const
const SKILL_OPTIONS = ["furnace", "ac", "heat-pump"] as const

interface Props {
  onCreated: (tech: ApiTechnician) => void
}

export function AddTechnicianDialog({ onCreated }: Props) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [epaLevel, setEpaLevel] = useState("")
  const [skills, setSkills] = useState<string[]>([])

  function reset() {
    setName("")
    setEmail("")
    setPhone("")
    setEpaLevel("")
    setSkills([])
    setError("")
  }

  function toggleSkill(skill: string) {
    setSkills((prev) =>
      prev.includes(skill) ? prev.filter((s) => s !== skill) : [...prev, skill]
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      setError("Name is required")
      return
    }

    setSaving(true)
    setError("")
    try {
      const payload: Record<string, unknown> = { name: name.trim() }
      if (email.trim()) payload.email = email.trim()
      if (phone.trim()) payload.phone = phone.trim()
      if (epaLevel) payload.epa608Level = epaLevel
      if (skills.length > 0) payload.skills = skills

      const tech = await api.post<ApiTechnician>("/api/technicians", payload)
      onCreated(tech)
      setOpen(false)
      reset()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create technician")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset() }}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4" />
          Add Technician
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Technician</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="tech-name">Name *</Label>
            <Input
              id="tech-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Full name"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="tech-email">Email</Label>
              <Input
                id="tech-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tech@example.com"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="tech-phone">Phone</Label>
              <Input
                id="tech-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 555 123 4567"
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>EPA 608 Level</Label>
            <Select value={epaLevel} onValueChange={setEpaLevel}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select level" />
              </SelectTrigger>
              <SelectContent>
                {EPA_LEVELS.map((level) => (
                  <SelectItem key={level} value={level}>
                    {level}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>Skills</Label>
            <div className="flex gap-2">
              {SKILL_OPTIONS.map((skill) => (
                <Button
                  key={skill}
                  type="button"
                  size="sm"
                  variant={skills.includes(skill) ? "default" : "outline"}
                  onClick={() => toggleSkill(skill)}
                >
                  {skill}
                </Button>
              ))}
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : "Add Technician"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
