import { useState } from "react"
import { api } from "@/api/client"
import type { ApiCustomer } from "@/api/types"
import { toast } from "sonner"
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
import { Plus } from "lucide-react"

interface Props {
  onCreated: (customer: ApiCustomer) => void
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function AddCustomerDialog(props: Props) {
  const { onCreated } = props
  const [internalOpen, setInternalOpen] = useState(false)
  const isOpen = props.open !== undefined ? props.open : internalOpen
  const setIsOpen = props.onOpenChange ?? setInternalOpen
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [address, setAddress] = useState("")
  const [addressLine2, setAddressLine2] = useState("")
  const [city, setCity] = useState("")
  const [state, setState] = useState("")
  const [postalCode, setPostalCode] = useState("")
  const [notes, setNotes] = useState("")

  function reset() {
    setName("")
    setPhone("")
    setEmail("")
    setAddress("")
    setAddressLine2("")
    setCity("")
    setState("")
    setPostalCode("")
    setNotes("")
    setError("")
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !phone.trim() || !address.trim() || !city.trim() || !state.trim() || !postalCode.trim()) {
      setError("Please fill in all required fields")
      return
    }

    setSaving(true)
    setError("")
    try {
      const payload: Record<string, unknown> = {
        name: name.trim(),
        phone: phone.trim(),
        address: address.trim(),
        city: city.trim(),
        state: state.trim(),
        postalCode: postalCode.trim(),
      }
      if (email.trim()) payload.email = email.trim()
      if (addressLine2.trim()) payload.addressLine2 = addressLine2.trim()
      if (notes.trim()) payload.notes = notes.trim()

      const customer = await api.post<ApiCustomer>("/api/customers", payload)
      toast.success(`${customer.name} added to customers`)
      onCreated(customer)
      setIsOpen(false)
      reset()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create customer")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(v) => { setIsOpen(v); if (!v) reset() }}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4" />
          Add Customer
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Customer</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="cust-name">Name *</Label>
              <Input
                id="cust-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Customer name"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="cust-phone">Phone *</Label>
              <Input
                id="cust-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 555 987 6543"
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="cust-email">Email</Label>
            <Input
              id="cust-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="customer@example.com"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="cust-address">Address *</Label>
            <Input
              id="cust-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="123 Main St"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="cust-address2">Address Line 2</Label>
            <Input
              id="cust-address2"
              value={addressLine2}
              onChange={(e) => setAddressLine2(e.target.value)}
              placeholder="Apt, Suite, etc."
            />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="cust-city">City *</Label>
              <Input
                id="cust-city"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Denver"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="cust-state">State *</Label>
              <Input
                id="cust-state"
                value={state}
                onChange={(e) => setState(e.target.value)}
                placeholder="CO"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="cust-zip">Zip *</Label>
              <Input
                id="cust-zip"
                value={postalCode}
                onChange={(e) => setPostalCode(e.target.value)}
                placeholder="80202"
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="cust-notes">Notes</Label>
            <textarea
              id="cust-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any additional notes..."
              rows={2}
              className="border-input h-auto w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : "Add Customer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
