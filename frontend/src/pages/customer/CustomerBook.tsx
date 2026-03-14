"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Wrench,
  Thermometer,
  Search,
  Shield,
  CalendarDays,
  Clock,
  CheckCircle2,
  ArrowRight,
  Loader2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { api } from "@/api/client"
import type { ApiJob } from "@/api/types"

const serviceTypes = [
  {
    id: "repair",
    label: "Repair",
    description: "Fix a broken or malfunctioning unit",
    icon: Wrench,
    estimate: "$150 - $400",
  },
  {
    id: "maintenance",
    label: "Maintenance",
    description: "Routine tune-up and inspection",
    icon: Thermometer,
    estimate: "$80 - $150",
  },
  {
    id: "inspection",
    label: "Inspection",
    description: "Full system diagnostic check",
    icon: Search,
    estimate: "$60 - $120",
  },
  {
    id: "installation",
    label: "Installation",
    description: "New unit install or replacement",
    icon: Shield,
    estimate: "$2,000 - $8,000",
  },
]

const equipmentTypes = [
  { id: "ac", label: "Air Conditioner" },
  { id: "furnace", label: "Furnace" },
  { id: "heat-pump", label: "Heat Pump" },
  { id: "boiler", label: "Boiler" },
  { id: "ductwork", label: "Ductwork" },
  { id: "thermostat", label: "Thermostat" },
  { id: "other", label: "Other" },
]

const timeSlots = [
  "8:00 AM - 10:00 AM",
  "10:00 AM - 12:00 PM",
  "12:00 PM - 2:00 PM",
  "2:00 PM - 4:00 PM",
  "4:00 PM - 6:00 PM",
]

export default function CustomerBook() {
  const [step, setStep] = useState(1)
  const [selectedService, setSelectedService] = useState<string | null>(null)
  const [selectedDate, setSelectedDate] = useState("")
  const [selectedTime, setSelectedTime] = useState<string | null>(null)
  const [priority, setPriority] = useState("normal")
  const [notes, setNotes] = useState("")
  const [submitted, setSubmitted] = useState(false)
  const [selectedEquipment, setSelectedEquipment] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [jobId, setJobId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    if (!selectedService || !selectedDate || !selectedTime) return;
    setSubmitting(true);
    setError(null);

    // Parse time slot start time: "8:00 AM - 10:00 AM" → "08:00"
    const startTime = selectedTime.split(" - ")[0];
    const [time, period] = startTime.split(" ");
    const [hours, minutes] = time.split(":");
    let hour24 = parseInt(hours);
    if (period === "PM" && hour24 !== 12) hour24 += 12;
    if (period === "AM" && hour24 === 12) hour24 = 0;
    const scheduledAt = new Date(`${selectedDate}T${String(hour24).padStart(2, "0")}:${minutes}:00`).toISOString();

    try {
      const job = await api.post<ApiJob>("/api/jobs", {
        scheduledAt,
        priority,
        symptomSummary: notes || undefined,
        equipmentType: selectedEquipment || undefined,
        serviceType: selectedService,
      });
      setJobId(job.id);
      setSubmitted(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to book service");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success/15">
          <CheckCircle2 className="h-8 w-8 text-success" />
        </div>
        <h2 className="mt-5 text-xl font-semibold text-foreground">
          Service Booked!
        </h2>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground leading-relaxed">
          Your{" "}
          {serviceTypes.find((s) => s.id === selectedService)?.label.toLowerCase()}{" "}
          appointment has been scheduled for {selectedDate} at {selectedTime}.
          {"You'll"} receive a confirmation message shortly.
        </p>
        <div className="mt-4 flex items-center gap-2 rounded-md border border-border bg-secondary/50 px-4 py-2 font-mono text-[11px] text-muted-foreground">
          <span>REF: {jobId?.slice(0, 12)}</span>
        </div>
        <Button
          className="mt-6 gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
          onClick={() => {
            setStep(1)
            setSelectedService(null)
            setSelectedDate("")
            setSelectedTime(null)
            setNotes("")
            setSubmitted(false)
            setSelectedEquipment(null)
            setError(null)
            setJobId(null)
          }}
        >
          Book Another Service
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">
          Book a Service
        </h1>
        <p className="text-sm text-muted-foreground">
          Schedule an HVAC service appointment in 3 easy steps
        </p>
      </div>

      {/* Steps indicator */}
      <div className="flex items-center gap-3">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold",
                s < step
                  ? "bg-success text-success-foreground"
                  : s === step
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-muted-foreground"
              )}
            >
              {s < step ? <CheckCircle2 className="h-4 w-4" /> : s}
            </div>
            <span
              className={cn(
                "text-xs font-medium hidden sm:block",
                s === step ? "text-foreground" : "text-muted-foreground"
              )}
            >
              {s === 1
                ? "Service Type"
                : s === 2
                  ? "Date & Time"
                  : "Confirm"}
            </span>
            {s < 3 && (
              <ArrowRight className="h-3 w-3 text-muted-foreground hidden sm:block" />
            )}
          </div>
        ))}
      </div>

      {/* Step 1: Service Type */}
      {step === 1 && (
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-foreground">
            What type of service do you need?
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {serviceTypes.map((service) => {
              const isSelected = selectedService === service.id
              return (
                <Card
                  key={service.id}
                  className={cn(
                    "cursor-pointer border-border bg-card transition-all",
                    isSelected && "border-primary/50 ring-1 ring-primary/20"
                  )}
                  onClick={() => setSelectedService(service.id)}
                >
                  <CardContent className="flex items-start gap-3 p-4">
                    <div
                      className={cn(
                        "flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg",
                        isSelected
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary text-muted-foreground"
                      )}
                    >
                      <service.icon className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-card-foreground">
                        {service.label}
                      </h3>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {service.description}
                      </p>
                      <p className="mt-1.5 font-mono text-[10px] text-primary">
                        EST. {service.estimate}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
          <div className="flex justify-end">
            <Button
              disabled={!selectedService}
              onClick={() => setStep(2)}
              className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Next
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 2: Date & Time */}
      {step === 2 && (
        <div className="space-y-5">
          <h2 className="text-sm font-semibold text-foreground">
            Choose your preferred date and time
          </h2>

          <div className="space-y-2">
            <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
              Preferred Date
            </label>
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="h-10 max-w-xs bg-secondary border-border text-foreground"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
              Time Slot
            </label>
            <div className="grid gap-2 sm:grid-cols-3">
              {timeSlots.map((slot) => (
                <button
                  key={slot}
                  onClick={() => setSelectedTime(slot)}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-3 py-2.5 text-xs font-medium transition-colors",
                    selectedTime === slot
                      ? "border-primary/50 bg-primary/15 text-primary"
                      : "border-border bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80"
                  )}
                >
                  <Clock className="h-3.5 w-3.5" />
                  {slot}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
              Equipment Type
            </label>
            <Select value={selectedEquipment ?? ""} onValueChange={setSelectedEquipment}>
              <SelectTrigger className="h-10 max-w-xs bg-secondary border-border text-foreground text-xs">
                <SelectValue placeholder="Select equipment" />
              </SelectTrigger>
              <SelectContent className="bg-card border-border">
                {equipmentTypes.map((eq) => (
                  <SelectItem key={eq.id} value={eq.id} className="text-xs text-foreground">
                    {eq.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
              Priority
            </label>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger className="h-10 max-w-xs bg-secondary border-border text-foreground text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-card border-border">
                <SelectItem value="low" className="text-xs text-foreground">Low - Flexible timing</SelectItem>
                <SelectItem value="normal" className="text-xs text-foreground">Normal - Within the week</SelectItem>
                <SelectItem value="high" className="text-xs text-foreground">High - Within 24 hours</SelectItem>
                <SelectItem value="urgent" className="text-xs text-foreground">Urgent - ASAP</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
              Additional Notes (Optional)
            </label>
            <Textarea
              placeholder="Describe the issue or any special instructions..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="min-h-[80px] bg-secondary border-border text-foreground text-xs placeholder:text-muted-foreground resize-none"
            />
          </div>

          <div className="flex justify-between">
            <Button
              variant="outline"
              onClick={() => setStep(1)}
              className="border-border text-foreground hover:bg-secondary"
            >
              Back
            </Button>
            <Button
              disabled={!selectedDate || !selectedTime}
              onClick={() => setStep(3)}
              className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Review
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Confirm */}
      {step === 3 && (
        <div className="space-y-5">
          <h2 className="text-sm font-semibold text-foreground">
            Review your booking
          </h2>

          <Card className="border-border bg-card">
            <CardContent className="space-y-4 p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono uppercase text-muted-foreground">
                  Service
                </span>
                <Badge
                  variant="outline"
                  className="border-primary/30 bg-primary/10 text-primary text-xs"
                >
                  {serviceTypes.find((s) => s.id === selectedService)?.label}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono uppercase text-muted-foreground">
                  Date
                </span>
                <span className="text-sm font-medium text-card-foreground">
                  {selectedDate}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono uppercase text-muted-foreground">
                  Time
                </span>
                <span className="text-sm font-medium text-card-foreground">
                  {selectedTime}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono uppercase text-muted-foreground">
                  Priority
                </span>
                <Badge
                  variant="outline"
                  className={cn(
                    "rounded-sm text-[10px] font-mono uppercase border",
                    priority === "urgent"
                      ? "bg-destructive/15 text-destructive border-destructive/30"
                      : priority === "high"
                        ? "bg-accent/15 text-accent border-accent/30"
                        : "bg-secondary text-muted-foreground border-border"
                  )}
                >
                  {priority}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono uppercase text-muted-foreground">
                  Estimate
                </span>
                <span className="text-sm font-mono font-medium text-primary">
                  {serviceTypes.find((s) => s.id === selectedService)?.estimate}
                </span>
              </div>
              {notes && (
                <div>
                  <span className="text-xs font-mono uppercase text-muted-foreground">
                    Notes
                  </span>
                  <p className="mt-1 text-xs text-card-foreground leading-relaxed">
                    {notes}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="flex justify-between">
            <Button
              variant="outline"
              onClick={() => setStep(2)}
              className="border-border text-foreground hover:bg-secondary"
            >
              Back
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={submitting}
              className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CalendarDays className="h-4 w-4" />
              )}
              {submitting ? "Booking..." : "Confirm Booking"}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
