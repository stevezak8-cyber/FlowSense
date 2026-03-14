import { Link } from "react-router-dom"
import {
  Building2,
  Wrench,
  UserCircle,
  ArrowRight,
  Shield,
  BarChart3,
  MapPin,
  Clock,
  FileText,
  CalendarCheck,
} from "lucide-react"
import { FlowSenseLogo } from "@/components/brand"

const roles = [
  {
    title: "Office Dashboard",
    description:
      "Manage jobs, dispatch technicians, track customers, and monitor revenue across all operations.",
    href: "/office",
    icon: Building2,
    color: "bg-primary",
    colorText: "text-primary",
    features: [
      { icon: BarChart3, label: "Revenue & Reporting" },
      { icon: Shield, label: "Full Operations Control" },
    ],
  },
  {
    title: "Technician View",
    description:
      "View daily job list, navigate to sites, update statuses in real-time, and access customer history.",
    href: "/technician",
    icon: Wrench,
    color: "bg-accent",
    colorText: "text-accent",
    features: [
      { icon: MapPin, label: "Map & Navigation" },
      { icon: Clock, label: "Real-Time Status Updates" },
    ],
  },
  {
    title: "Customer Portal",
    description:
      "Book service appointments, track your technician live, view invoices, and check job status.",
    href: "/customer",
    icon: UserCircle,
    color: "bg-chart-3",
    colorText: "text-chart-3",
    features: [
      { icon: FileText, label: "Invoices & Billing" },
      { icon: CalendarCheck, label: "Book Appointments" },
    ],
  },
]

export default function RoleSelectorPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex items-center justify-between border-b border-border px-6 py-4 lg:px-10">
        <FlowSenseLogo size="md" />
        <span className="hidden text-xs font-mono text-muted-foreground sm:block">
          v2.4.1 // MULTI-ROLE ACCESS
        </span>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-4 py-12 lg:py-16">
        <div className="mb-10 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-foreground text-balance lg:text-4xl">
            Select your dashboard
          </h1>
          <p className="mt-3 max-w-lg text-sm text-muted-foreground leading-relaxed text-pretty">
            FlowSense provides dedicated interfaces for every role in your HVAC
            operation. Choose your portal below to get started.
          </p>
        </div>

        <div className="grid w-full max-w-5xl gap-5 lg:grid-cols-3">
          {roles.map((role) => (
            <Link
              key={role.href}
              to={role.href}
              className="group relative flex flex-col rounded-xl border border-border bg-card p-6 transition-all hover:border-muted-foreground/40 hover:shadow-lg hover:shadow-primary/5"
            >
              <div
                className={`flex h-11 w-11 items-center justify-center rounded-lg ${role.color}`}
              >
                <role.icon className="h-5 w-5 text-primary-foreground" />
              </div>

              <h2 className="mt-5 text-lg font-semibold text-card-foreground">
                {role.title}
              </h2>
              <p className="mt-2 flex-1 text-sm text-muted-foreground leading-relaxed">
                {role.description}
              </p>

              <div className="mt-5 flex flex-col gap-2.5 border-t border-border pt-5">
                {role.features.map((f) => (
                  <div
                    key={f.label}
                    className="flex items-center gap-2.5 text-xs text-muted-foreground"
                  >
                    <f.icon className={`h-3.5 w-3.5 ${role.colorText}`} />
                    <span className="font-mono uppercase tracking-wide">
                      {f.label}
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-5 flex items-center gap-2 text-sm font-medium text-card-foreground">
                <span>Enter Dashboard</span>
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </div>
            </Link>
          ))}
        </div>

        <div className="mt-10 flex items-center gap-4 text-[11px] font-mono text-muted-foreground">
          <span>ACTIVE JOBS: 4</span>
          <span className="text-border">|</span>
          <span>TECHS ONLINE: 3</span>
          <span className="text-border">|</span>
          <span>SYS: OPERATIONAL</span>
        </div>
      </main>
    </div>
  )
}
