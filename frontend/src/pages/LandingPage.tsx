import { Link, useNavigate } from "react-router-dom"
import { useState } from "react"
import { ChevronDown } from "lucide-react"
import { useAuth } from "@/auth/auth-context"

const NAV_LINKS = [
  { label: "Roles", href: "#roles" },
  { label: "Platform", href: "#platform" },
  { label: "Compliance", href: "#compliance" },
  { label: "Pricing", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
]

const PLATFORM_FEATURES = [
  { title: "Smart dispatch", desc: "Suggestions ranked by skill match, drive time and workload, with a best-match flag and a score on every tech." },
  { title: "Schedule board", desc: "A calendar of assigned work with an unassigned strip you drag until the day is clean." },
  { title: "Job documentation", desc: "Photos, voice recordings and a completion dialog that turns the visit into a written record." },
  { title: "Estimates & pricebook", desc: "Build tiered options from a catalog, send them, and let the customer approve a tier themselves." },
  { title: "Maintenance plans", desc: "Recurring jobs dispatched automatically with equipment history attached." },
  { title: "Revenue & analytics", desc: "Month-to-date revenue, forecast, at-risk customers and tech performance in one view." },
  { title: "Global search", desc: "Every customer, job, tech and piece of equipment — one search bar." },
  { title: "Offline & installable", desc: "Works with no signal and syncs when service returns. Installs to the home screen." },
  { title: "Roles & invites", desc: "Office, technician and customer seats. Invite by email, access controlled by role." },
]

const PRICING = [
  {
    name: "Shop",
    price: "$799",
    seats: "Up to 5 trucks · 3 office seats",
    cta: "Start free trial",
    ctaTo: "/register",
    highlight: false,
    features: [
      "Office dashboard, jobs and schedule board",
      "Technician app — offline, photos, voice notes",
      "Customer app with online booking",
      "Invoicing and card payment",
      "EPA 608 compliance log",
    ],
    locked: [
      "AI co-pilot and job summaries",
      "Smart dispatch with drive times",
      "Estimates, pricebook, maintenance plans",
      "Revenue analytics and forecasting",
    ],
  },
  {
    name: "Fleet",
    price: "$1,499",
    seats: "Up to 25 trucks · 10 office seats",
    cta: "Start free trial",
    ctaTo: "/register",
    highlight: true,
    badge: "Most shops",
    features: [
      "Everything in Shop, plus:",
      "AI co-pilot on every job, auto job summaries",
      "Smart dispatch ranked by drive time and workload",
      "Estimates, tiered approval and pricebook",
      "Maintenance plans and recurring jobs",
      "Revenue trends, forecast and at-risk customers",
    ],
    locked: [
      "Multiple locations and branch reporting",
      "Data migration and guided onboarding",
    ],
  },
  {
    name: "Enterprise",
    price: "$2,999",
    seats: "Unlimited trucks · unlimited seats",
    cta: "Book a call",
    ctaTo: "/register",
    highlight: false,
    features: [
      "Everything in Fleet, plus:",
      "Several locations under one organization",
      "Branch-level revenue and compliance reporting",
      "Migration and data import from your current system",
      "Customer concierge chat",
      "Guided onboarding for the whole crew",
      "Priority support",
    ],
    locked: [],
  },
]

const FAQS = [
  { q: "How long does setup take?", a: "Create your organization, then invite your office, your techs and your customers by email. An onboarding checklist in the sidebar tracks what's left." },
  { q: "Can customers pay online?", a: "Yes, through Stripe. Customers see their invoices, approve estimates by tier, and pay by card." },
  { q: "Do my technicians need to install an app?", a: "It runs in the browser and installs to the home screen when prompted. It keeps working with no signal and syncs when service returns." },
  { q: "What about EPA 608 records?", a: "Prompts fire during the job and write to a compliance log, filterable by technician, type and date range for an audit." },
  { q: "Is the AI required?", a: "No. AI briefings, job summaries and insights turn on when an Anthropic key is configured, and the rest of the platform is unaffected without one." },
  { q: "Can I try it before signing up?", a: "The sign-in screen has one-click demo accounts for the office, technician and customer views." },
]

const STATS = [
  { value: "10 min", label: "Set up your org, invite your first tech" },
  { value: "0", label: "Paperwork your techs fill out separately" },
  { value: "1", label: "System for office, field, and customer" },
  { value: "100%", label: "EPA 608 log entries written at the job" },
]

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-t border-gray-200 py-5">
      <button onClick={() => setOpen(!open)} className="flex w-full items-start justify-between gap-4 text-left">
        <span className="text-base font-bold text-gray-900">{q}</span>
        <ChevronDown className={`mt-0.5 h-5 w-5 shrink-0 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <p className="mt-3 text-sm text-gray-600 leading-relaxed">{a}</p>}
    </div>
  )
}

const ROLE_HOME: Record<string, string> = {
  office: "/office",
  technician: "/technician",
  customer: "/customer",
}

export default function LandingPage() {
  const { demoLogin } = useAuth()
  const navigate = useNavigate()
  const [demoLoading, setDemoLoading] = useState<string | null>(null)

  async function handleDemo(role: "office" | "technician" | "customer") {
    setDemoLoading(role)
    try {
      await demoLogin(role)
      navigate(ROLE_HOME[role])
    } catch {
      navigate("/login")
    } finally {
      setDemoLoading(null)
    }
  }

  return (
    <div className="bg-white text-gray-900 font-sans">
      {/* Nav */}
      <header className="sticky top-0 z-50 bg-white border-b border-gray-100">
        <div className="mx-auto max-w-7xl px-6 lg:px-10 flex items-center justify-between h-16">
          <div className="flex items-center gap-2">
            <span className="text-lg font-black tracking-tight">PNEUROS</span>
            <span className="text-[10px] font-semibold text-gray-400 tracking-widest uppercase">HVAC Platform</span>
          </div>
          <nav className="hidden md:flex items-center gap-7">
            {NAV_LINKS.map(l => (
              <a key={l.label} href={l.href} className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">{l.label}</a>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <Link to="/login" className="text-sm font-semibold text-gray-700 hover:text-gray-900 transition-colors">Sign in</Link>
            <Link to="/register" className="rounded-full bg-[#e63f2a] px-5 py-2 text-sm font-bold text-white hover:bg-[#c73522] transition-colors">Start free trial</Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-7xl px-6 lg:px-10 pt-16 pb-0">
        <div className="grid lg:grid-cols-2 gap-16 items-start">
          <div>
            <div className="flex items-center gap-3 mb-6">
              <span className="rounded-full border border-gray-200 px-3 py-1 text-xs font-semibold text-gray-600">For 1–25 truck shops</span>
              <span className="text-xs text-gray-400">Office · Field · Customer</span>
            </div>
            <h1 className="text-6xl lg:text-7xl font-black leading-none tracking-tight text-gray-900 mb-6">
              The operating system for HVAC businesses.
            </h1>
            <p className="text-lg text-gray-600 mb-8 max-w-xl">
              Dispatch the job, run it in the field, invoice it and keep the compliance record — in one system, with an app each for your office, your technicians and your customers.
            </p>
            <div className="flex items-center gap-3 flex-wrap">
              <Link to="/register" className="rounded-full bg-[#e63f2a] px-7 py-3.5 text-sm font-bold text-white hover:bg-[#c73522] transition-colors">Start free trial</Link>
              <button onClick={() => handleDemo("office")} disabled={!!demoLoading} className="rounded-full border border-gray-300 px-7 py-3.5 text-sm font-bold text-gray-700 hover:border-gray-400 transition-colors disabled:opacity-60">{demoLoading === "office" ? "Loading…" : "See the office dashboard"}</button>
            </div>
            <p className="mt-4 text-xs text-gray-400">
              <strong className="text-gray-600">Can I try it before signing up?</strong> Yes. The sign-in screen has one-click demo accounts for the office, technician and customer views.
            </p>
          </div>

          <div className="space-y-px">
            <div className="rounded-2xl border border-gray-100 bg-gray-50 p-7">
              <p className="text-[11px] font-bold uppercase tracking-widest text-[#e63f2a] mb-2">Smart Dispatch</p>
              <h3 className="text-2xl font-black leading-tight mb-2">Ranked by skill match, drive time & workload</h3>
              <p className="text-sm text-gray-500">Every assignment shows the score, the drive minutes, today's job count and whether that tech has been to the address before.</p>
            </div>
            <div className="rounded-2xl border border-gray-100 bg-gray-50 p-7">
              <p className="text-[11px] font-bold uppercase tracking-widest text-[#e63f2a] mb-2">Compliance</p>
              <h3 className="text-2xl font-black leading-tight mb-2">EPA 608 logged at the job, not after it</h3>
              <p className="text-sm text-gray-500">Refrigerant prompts, safety acknowledgements and code reminders write to an audit log you can filter by technician, type and date range.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Dashboard screenshot */}
      <section className="mx-auto max-w-7xl px-6 lg:px-10 py-12">
        <div className="rounded-2xl border border-gray-200 bg-gray-50 overflow-hidden">
          <div className="flex">
            <div className="w-44 border-r border-gray-200 bg-white p-4 space-y-1 text-xs font-medium text-gray-500">
              {["Dashboard","Schedule","Jobs","Maintenance","Technicians","Customers","Messages","Revenue","Compliance"].map(item => (
                <div key={item} className={`px-3 py-2 rounded-lg ${item === "Dashboard" ? "bg-gray-100 text-gray-900 font-semibold" : ""}`}>{item}</div>
              ))}
              <div className="pt-4 text-[10px] text-gray-400 font-semibold">Dana Whitfield<br/>OFFICE</div>
            </div>
            <div className="flex-1 p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Office Dashboard</p>
                  <p className="text-xs text-gray-400">Operations overview for Pneuros HVAC services</p>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-3 mb-4">
                {[["Active Jobs","14","212 total"],["Completed Today","6","184 all time"],["Scheduled (Week)","31","This week"],["Revenue (MTD)","$86,420","Month to date"]].map(([label,val,sub])=>(
                  <div key={label} className="rounded-xl border border-gray-200 bg-white p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1">{label}</p>
                    <p className="text-2xl font-black text-gray-900">{val}</p>
                    <p className="text-[10px] text-gray-400">{sub}</p>
                  </div>
                ))}
              </div>
              <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-2 text-xs font-medium text-amber-700 mb-4">3 jobs need a technician assigned — <span className="underline cursor-pointer">Review jobs →</span></div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs font-bold text-gray-700 mb-2">Recent Jobs <span className="font-normal text-gray-400">212 total tracked</span></p>
                  {[["Furnace — No heat on second fl…","URGENT","In Progress"],["Ac — Condenser fan not spinning","HIGH","Scheduled"],["Heat Pump — Annual maintenan…","NORMAL","Completed"]].map(([job,pri,status])=>(
                    <div key={job} className="flex items-center gap-2 py-2 border-b border-gray-100 text-xs">
                      <div className="flex-1 font-medium text-gray-800 truncate">{job}</div>
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${pri==="URGENT"?"bg-red-100 text-red-700":pri==="HIGH"?"bg-amber-100 text-amber-700":"bg-gray-100 text-gray-600"}`}>{pri}</span>
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${status==="In Progress"?"bg-blue-100 text-blue-700":status==="Scheduled"?"bg-purple-100 text-purple-700":"bg-green-100 text-green-700"}`}>{status}</span>
                    </div>
                  ))}
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-700 mb-2">Technician Roster <span className="font-normal text-gray-400">7 technicians</span></p>
                  {[["Ray Okafor","On Job","Truck 4","EPA Universal"],["Ana Duarte","Available","Truck 2","EPA Type II"],["Jesse Bramble","Off Duty","Truck 1","EPA Type I"]].map(([name,status,truck,cert])=>(
                    <div key={name} className="flex items-center gap-2 py-2 border-b border-gray-100 text-xs">
                      <div className="h-7 w-7 rounded-full bg-gray-200 flex items-center justify-center text-[10px] font-bold text-gray-600">{name[0]}</div>
                      <div className="flex-1">
                        <p className="font-semibold text-gray-800">{name} <span className={`text-[10px] font-bold ${status==="On Job"?"text-green-600":status==="Available"?"text-blue-600":"text-gray-400"}`}>{status}</span></p>
                        <p className="text-[10px] text-gray-400">{truck} · {cert}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
        <p className="mt-3 text-xs text-gray-400 text-center">Office dashboard, recreated from the product. Figures shown are sample data.</p>
      </section>

      {/* Pain section */}
      <section className="bg-gray-950 text-white py-20">
        <div className="mx-auto max-w-7xl px-6 lg:px-10">
          <div className="grid lg:grid-cols-2 gap-16 items-start">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-[#e63f2a] mb-4">Where the work lives now</p>
              <h2 className="text-5xl font-black leading-tight mb-6">Five tools that don't talk to each other.</h2>
              <p className="text-gray-400 mb-6">A shop of ten trucks runs the day across a scheduling board, a phone, a spreadsheet, an accounting package and a filing cabinet. The cost isn't any one of them — it's the retyping between them.</p>
              <p className="text-xl font-bold text-white">A shop billing $30k a month recovers the cost of Pneuros in one avoided callback.</p>
            </div>
            <div className="grid grid-cols-2 gap-px bg-gray-800">
              {[
                ["Dispatch by memory","The closest truck and the certified truck are rarely the same one, and nobody has both facts at once."],
                ["Paperwork after hours","Job notes get written up that evening, if at all, and details are already gone."],
                ["Invoices that lag","Work finishes Tuesday and bills Friday, because someone has to reconstruct what happened."],
                ["Compliance at audit time","Refrigerant records are assembled backwards from field notes the night before the audit."],
              ].map(([title, desc]) => (
                <div key={title} className="bg-gray-900 p-6">
                  <h4 className="font-bold text-white mb-2">{title}</h4>
                  <p className="text-sm text-gray-400">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Three Seats */}
      <section id="roles" className="py-20">
        <div className="mx-auto max-w-7xl px-6 lg:px-10">
          <p className="text-[11px] font-bold uppercase tracking-widest text-[#e63f2a] mb-3">02 — Three Seats, One System</p>
          <h2 className="text-5xl font-black leading-tight mb-12">Every side of the job is already in the same database.</h2>
          <div className="grid lg:grid-cols-3 gap-px bg-gray-200">
            {[
              { role: "Office", title: "Dispatch, schedule, invoice", desc: "Dashboard, schedule calendar with an unassigned strip, jobs, maintenance plans, technicians, customers, messages, revenue, and compliance — all in one tab.", features: ["Smart dispatch", "Schedule board", "Estimates & pricebook", "Revenue forecast"] },
              { role: "Technician", title: "Jobs, map, co-pilot", desc: "An installable phone app with an on-duty toggle, push notifications for new jobs, offline queueing, photos and voice notes, and a co-pilot that knows which unit you're standing in front of.", features: ["Offline job queue", "Photos & voice notes", "AI co-pilot", "EPA 608 prompts"] },
              { role: "Customer", title: "Book, approve, pay", desc: "Your customers book their own appointments, approve an estimate tier and pay the invoice online. They see their equipment records, service history and maintenance plan, and can reach you through a concierge chat.", features: ["Online booking", "Estimate approval", "Card payment"], badge: "Most shops have none" },
            ].map(({ role, title, desc, features, badge }) => (
              <div key={role} className="bg-white p-8">
                <div className="flex items-center gap-2 mb-4">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-[#e63f2a]">{role}</p>
                  {badge && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-600">{badge}</span>}
                </div>
                <h3 className="text-2xl font-black mb-3">{title}</h3>
                <p className="text-sm text-gray-500 mb-5">{desc}</p>
                <ul className="space-y-1.5">
                  {features.map(f => <li key={f} className="text-xs font-semibold text-gray-700 flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-[#e63f2a]" />{f}</li>)}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Platform features */}
      <section id="platform" className="py-20 bg-gray-50">
        <div className="mx-auto max-w-7xl px-6 lg:px-10">
          <p className="text-[11px] font-bold uppercase tracking-widest text-[#e63f2a] mb-3">03 — The Platform</p>
          <h2 className="text-5xl font-black leading-tight mb-12">What ships today.</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-px bg-gray-200">
            {PLATFORM_FEATURES.map(({ title, desc }) => (
              <div key={title} className="bg-white p-6">
                <h4 className="font-black text-lg mb-2">{title}</h4>
                <p className="text-sm text-gray-500">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Field AI */}
      <section className="py-20">
        <div className="mx-auto max-w-7xl px-6 lg:px-10">
          <div className="grid lg:grid-cols-2 gap-16 items-start">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-[#e63f2a] mb-3">04 — Field AI</p>
              <h2 className="text-4xl font-black leading-tight mb-4">The co-pilot already knows which unit you're standing in front of.</h2>
              <p className="text-gray-500 mb-8">Job context, technician profile and organization history load before the first message. A technician opens the assistant from the job and asks in plain language.</p>
              <div className="grid grid-cols-2 gap-4">
                {[["Look up error code","Decode fault codes for the unit on the ticket."],["Diagnose symptoms","Step-by-step troubleshooting for what the tech is seeing."],["Ask anything","Specs, procedures, compatibility — typed or dictated."],["Auto job summary","The visit writes itself up for the customer record and the invoice."]].map(([t,d])=>(
                  <div key={t}><p className="font-bold text-sm mb-1">{t}</p><p className="text-xs text-gray-500">{d}</p></div>
                ))}
              </div>
            </div>
            <div className="rounded-2xl bg-gray-950 p-6 text-white">
              <p className="text-xs font-bold text-gray-400 mb-1">AI Assistant</p>
              <p className="text-xs text-gray-500 mb-4">Carrier 59TP6A — furnace</p>
              <div className="rounded-lg bg-gray-800 px-3 py-1.5 text-xs text-gray-300 inline-flex items-center gap-2 mb-6">
                <span className="h-1.5 w-1.5 rounded-full bg-purple-400" />Job context · Tech profile · Org history loaded
              </div>
              <div className="flex justify-end mb-4">
                <div className="rounded-2xl rounded-tr-sm bg-purple-600 px-4 py-2.5 text-sm max-w-[80%]">Look up error code 33 on this unit</div>
              </div>
              <div className="flex gap-3 mb-4">
                <div className="h-8 w-8 rounded-full bg-purple-600 flex items-center justify-center text-xs font-bold flex-shrink-0">P</div>
                <div className="rounded-2xl rounded-tl-sm bg-gray-800 px-4 py-2.5 text-sm text-gray-200 max-w-[80%]">Code 33 is a limit circuit lockout. Check the high-limit switch, then airflow: dirty filter, closed registers, or a failing blower. The unit locks out after three trips in an hour.</div>
              </div>
              <div className="flex justify-end">
                <div className="rounded-2xl rounded-tr-sm bg-purple-600 px-4 py-2.5 text-sm max-w-[80%]">Write up what I did for the customer</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Compliance */}
      <section id="compliance" className="py-20 bg-gray-50">
        <div className="mx-auto max-w-7xl px-6 lg:px-10">
          <div className="grid lg:grid-cols-2 gap-16 items-start">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-[#e63f2a] mb-3">05 — Compliance</p>
              <h2 className="text-4xl font-black leading-tight mb-4">The audit trail is a side effect of doing the work.</h2>
              <p className="text-gray-500 mb-4">EPA 608 prompts, safety acknowledgements and code reminders are part of the job flow, not a binder someone fills in on Friday.</p>
              <p className="text-sm text-gray-400">Filter the log by technician, type and date range — the default view is the last 90 days.</p>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100">
                    {["Date","Customer","Technician","Type","Summary"].map(h=><th key={h} className="px-4 py-3 text-left font-bold text-gray-400 uppercase tracking-wide text-[10px]">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["Aug 28","Marisol Vega","Ray Okafor","EPA 608","R-410A recovered, 2.4 lb, cylinder #A-118"],
                    ["Aug 27","Dell Ridge Apartments","Ana Duarte","Safety","Lockout/tagout acknowledged before panel access"],
                    ["Aug 27","Trellis Property Group","Jesse Bramble","Code","Combustion air clearance confirmed to local code"],
                    ["Aug 26","Marisol Vega","Ray Okafor","EPA 608","Leak check performed, no leak found"],
                  ].map(([date,cust,tech,type,summary])=>(
                    <tr key={date+cust} className="border-b border-gray-50">
                      <td className="px-4 py-3 text-gray-400">{date}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{cust}</td>
                      <td className="px-4 py-3 text-gray-600">{tech}</td>
                      <td className="px-4 py-3"><span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${type==="EPA 608"?"bg-red-100 text-red-700":"bg-gray-100 text-gray-600"}`}>{type}</span></td>
                      <td className="px-4 py-3 text-gray-500">{summary}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="px-4 py-2 text-[10px] text-gray-400 border-t border-gray-100">Compliance audit, recreated from the product. Sample rows.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Integrations */}
      <section className="py-16 border-t border-gray-100">
        <div className="mx-auto max-w-7xl px-6 lg:px-10">
          <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-6">Runs on your accounts</p>
          <div className="flex flex-wrap gap-6 items-center">
            {["Stripe","Anthropic","Google Maps","Resend","PostgreSQL","Railway"].map(name=>(
              <span key={name} className="text-lg font-black text-gray-300 hover:text-gray-500 transition-colors">{name}</span>
            ))}
          </div>
          <p className="mt-4 text-sm text-gray-400">Every integration is optional — features degrade gracefully when a key is absent.</p>
        </div>
      </section>

      {/* Mid-page CTA */}
      <section className="py-16 bg-gray-50">
        <div className="mx-auto max-w-7xl px-6 lg:px-10 text-center">
          <h2 className="text-3xl font-black mb-4">See it with your own jobs in it — a trial takes about ten minutes to set up.</h2>
          <div className="flex items-center justify-center gap-3">
            <Link to="/register" className="rounded-full bg-[#e63f2a] px-7 py-3.5 text-sm font-bold text-white hover:bg-[#c73522] transition-colors">Start free trial</Link>
            <a href="#pricing" className="rounded-full border border-gray-300 px-7 py-3.5 text-sm font-bold text-gray-700 hover:border-gray-400 transition-colors">See pricing</a>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-20">
        <div className="mx-auto max-w-7xl px-6 lg:px-10">
          <p className="text-[11px] font-bold uppercase tracking-widest text-[#e63f2a] mb-3">06 — Pricing</p>
          <h2 className="text-5xl font-black leading-tight mb-12">Three plans.</h2>
          <div className="grid lg:grid-cols-3 gap-6">
            {PRICING.map(({ name, price, seats, cta, ctaTo, highlight, badge, features, locked }) => (
              <div key={name} className={`rounded-2xl border p-8 ${highlight ? "border-[#e63f2a] ring-1 ring-[#e63f2a]" : "border-gray-200"}`}>
                <div className="flex items-center gap-2 mb-4">
                  <p className="font-black text-xl">{name}</p>
                  {badge && <span className="rounded-full bg-[#e63f2a] px-2 py-0.5 text-[10px] font-bold text-white">{badge}</span>}
                </div>
                <p className="text-5xl font-black mb-1">{price}<span className="text-lg font-medium text-gray-400"> / month</span></p>
                <p className="text-xs text-gray-400 mb-6">{seats}</p>
                <ul className="space-y-2 mb-6">
                  {features.map(f => <li key={f} className="flex items-start gap-2 text-sm"><span className="text-[#e63f2a] font-bold mt-0.5">✓</span>{f}</li>)}
                  {locked.map(f => <li key={f} className="flex items-start gap-2 text-sm text-gray-300"><span className="mt-0.5">—</span>{f}</li>)}
                </ul>
                <Link to={ctaTo} className={`block w-full rounded-xl py-3 text-center text-sm font-bold transition-colors ${highlight ? "bg-[#e63f2a] text-white hover:bg-[#c73522]" : "border border-gray-300 text-gray-700 hover:border-gray-400"}`}>{cta}</Link>
              </div>
            ))}
          </div>
          <p className="mt-6 text-sm text-gray-400 text-center">Free trial on every plan. You aren't charged until it ends, and billing is managed from inside the app.</p>
        </div>
      </section>

      {/* Stats */}
      <section className="py-20 bg-gray-50">
        <div className="mx-auto max-w-7xl px-6 lg:px-10">
          <p className="text-[11px] font-bold uppercase tracking-widest text-[#e63f2a] mb-3">07 — By the numbers</p>
          <h2 className="text-4xl font-black mb-10">What the platform does.</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-gray-200">
            {STATS.map(({ value, label }) => (
              <div key={label} className="bg-white p-8">
                <p className="text-5xl font-black text-gray-900 mb-2">{value}</p>
                <p className="text-sm text-gray-500">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why us */}
      <section className="py-20">
        <div className="mx-auto max-w-7xl px-6 lg:px-10">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-gray-200">
            {[
              ["Try before you sign up","One-click demo accounts for the office, technician and customer views — the real app, not a video."],
              ["Your data stays yours","Customers, jobs and equipment records export on request. Payments run through your own Stripe account."],
              ["Built for the audit","EPA 608 entries are written at the job with technician, date and refrigerant detail attached."],
              ["No long contract","Month to month. Billing is managed inside the app, and you can cancel there too."],
            ].map(([title, desc]) => (
              <div key={title} className="bg-white p-8">
                <h4 className="font-black text-lg mb-2">{title}</h4>
                <p className="text-sm text-gray-500">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-20 bg-gray-50">
        <div className="mx-auto max-w-7xl px-6 lg:px-10">
          <p className="text-[11px] font-bold uppercase tracking-widest text-[#e63f2a] mb-3">08 — Questions</p>
          <h2 className="text-5xl font-black leading-tight mb-10">Before you start.</h2>
          <div className="grid lg:grid-cols-2 gap-x-16">
            <div>{FAQS.filter((_,i)=>i%2===0).map(f=><FaqItem key={f.q} {...f}/>)}</div>
            <div>{FAQS.filter((_,i)=>i%2===1).map(f=><FaqItem key={f.q} {...f}/>)}</div>
          </div>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="bg-[#e63f2a] py-24 text-white">
        <div className="mx-auto max-w-7xl px-6 lg:px-10">
          <h2 className="text-6xl font-black leading-tight mb-6">Your whole shop on one system.</h2>
          <p className="text-xl text-red-100 mb-8 max-w-xl">Create your organization, invite your crew, and run next week's jobs through Pneuros. You aren't charged until the trial ends.</p>
          <div className="flex items-center gap-4 mb-6">
            <div className="flex items-center gap-2 text-sm font-semibold"><span className="h-5 w-5 rounded-full bg-white/20 flex items-center justify-center text-xs font-black">1</span>Create your organization</div>
            <div className="flex items-center gap-2 text-sm font-semibold"><span className="h-5 w-5 rounded-full bg-white/20 flex items-center justify-center text-xs font-black">2</span>Invite office, techs and customers by email</div>
            <div className="flex items-center gap-2 text-sm font-semibold"><span className="h-5 w-5 rounded-full bg-white/20 flex items-center justify-center text-xs font-black">3</span>Dispatch your first job</div>
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            <Link to="/register" className="rounded-full bg-white text-[#e63f2a] px-8 py-4 text-sm font-black hover:bg-red-50 transition-colors">Start free trial</Link>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-red-200 mr-1">Try a demo →</span>
              {(["office","technician","customer"] as const).map(role => (
                <button key={role} onClick={() => handleDemo(role)} disabled={!!demoLoading} className="rounded-full border-2 border-white/40 text-white px-5 py-4 text-sm font-black hover:border-white transition-colors disabled:opacity-60 capitalize">
                  {demoLoading === role ? "…" : role}
                </button>
              ))}
            </div>
          </div>
          <p className="mt-5 text-xs text-red-200">No card required to start. Month to month.</p>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-10 border-t border-gray-100">
        <div className="mx-auto max-w-7xl px-6 lg:px-10 flex items-center justify-between text-xs text-gray-400">
          <span className="font-black text-gray-900">PNEUROS</span>
          <span>© 2026 Pneuros. HVAC field service platform.</span>
          <div className="flex gap-4">
            <Link to="/login" className="hover:text-gray-700 transition-colors">Sign in</Link>
            <Link to="/register" className="hover:text-gray-700 transition-colors">Start free trial</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
