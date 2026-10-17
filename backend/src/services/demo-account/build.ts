import type { Prisma } from "@prisma/client"
import {
  CUSTOMERS, TECHS, TEMPLATES, PRICEBOOK, ESTIMATE_TIERS, REVIEW_COMMENTS, OFFICE_RESPONSES,
  DEMO_SLUG, DEMO_ORG_NAME, DEMO_ORG_ADDRESS, DEMO_ORG_PHONE, DEMO_TZ,
  type EquipType, type JobTemplate,
} from "./content.js"

const MIN = 60_000
const HOUR = 3_600_000
const DAY = 86_400_000

export interface DemoBuildOptions {
  now: Date
  orgId: string
  idGen: () => string
  seed?: number
  tz?: string
}

export interface DemoData {
  organization: Prisma.OrganizationUncheckedCreateInput
  technicians: Prisma.TechnicianCreateManyInput[]
  vehicles: Prisma.VehicleCreateManyInput[]
  customers: Prisma.CustomerCreateManyInput[]
  equipment: Prisma.EquipmentCreateManyInput[]
  pricebook: Prisma.PricebookItemCreateManyInput[]
  recurringJobs: Prisma.RecurringJobCreateManyInput[]
  jobs: Prisma.JobCreateManyInput[]
  invoices: Prisma.InvoiceCreateManyInput[]
  estimates: Prisma.EstimateCreateManyInput[]
  estimateLines: Prisma.EstimateLineCreateManyInput[]
  reviews: Prisma.JobReviewCreateManyInput[]
  complianceLogs: Prisma.ComplianceLogCreateManyInput[]
  plans: Prisma.MaintenancePlanCreateManyInput[]
  planItems: Prisma.MaintenancePlanItemCreateManyInput[]
  conversations: Prisma.ConversationCreateManyInput[]
  messages: Prisma.MessageCreateManyInput[]
  notifications: Prisma.NotificationCreateManyInput[]
  blockedDates: Prisma.BlockedDateCreateManyInput[]
  /** Who the login accounts attach to. */
  leadTechnicianId: string
  heroCustomerId: string
}

// ---------- time (business-local, independent of the server's timezone) ----------

interface Ymd { y: number; m: number; d: number }

function offsetMs(date: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(date)
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value)
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"))
  return asUtc - Math.floor(date.getTime() / 1000) * 1000
}

function localToUtc(c: Ymd, hour: number, tz: string): Date {
  const h = Math.floor(hour)
  const min = Math.round((hour - h) * 60)
  const guess = Date.UTC(c.y, c.m - 1, c.d, h, min)
  let t = guess - offsetMs(new Date(guess), tz)
  t = guess - offsetMs(new Date(t), tz) // second pass settles DST edges
  return new Date(t)
}

function ymdIn(date: Date, tz: string): Ymd {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date)
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value)
  return { y: get("year"), m: get("month"), d: get("day") }
}

function shift(c: Ymd, days: number): Ymd {
  const t = new Date(Date.UTC(c.y, c.m - 1, c.d + days))
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() }
}

const dayOfWeek = (c: Ymd) => new Date(Date.UTC(c.y, c.m - 1, c.d)).getUTCDay()

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const COOL = [0.2, 0.2, 0.5, 0.9, 1.2, 1.6, 1.8, 1.8, 1.4, 0.9, 0.5, 0.3]
const HEAT = [1.6, 1.4, 0.9, 0.4, 0.2, 0.1, 0.1, 0.1, 0.3, 0.7, 1.2, 1.6]
const seasonWeight = (s: JobTemplate["season"], month0: number) => (s === "cool" ? COOL[month0] : s === "heat" ? HEAT[month0] : 0.8)
const typeSeason = (t: EquipType): JobTemplate["season"] => (t === "furnace" || t === "boiler" ? "heat" : t === "heat-pump" || t === "thermostat" ? "any" : "cool")

const SLOT_HOURS = [7.5, 9, 10.5, 12.5, 14, 15.5]
const TOOLS: Record<EquipType, string[]> = {
  ac: ["Manifold gauges", "Multimeter", "Leak detector"],
  furnace: ["Combustion analyzer", "Manometer", "Multimeter"],
  "heat-pump": ["Manifold gauges", "Multimeter", "Leak detector"],
  rtu: ["Manifold gauges", "Belt tension gauge", "Multimeter"],
  boiler: ["Combustion analyzer", "Pressure gauge", "Multimeter"],
  "mini-split": ["Manifold gauges", "Multimeter", "Drain pump tester"],
  thermostat: ["Multimeter", "Wire strippers", "Screwdriver set"],
}

interface JobMeta {
  id: string
  customerIdx: number
  equipIdx: number | null
  techIdx: number | null
  tmpl: JobTemplate
  status: string
  scheduledAt: Date
  completedAt?: Date
  amount: number
  symptom: string
  forceReview?: { rating: number; comment?: string } | null
  noReview?: boolean
  estimateStatus?: "draft" | "sent"
  /** Row for this job in the output array. */
  row: Prisma.JobCreateManyInput
}

export function buildDemoData(opts: DemoBuildOptions): DemoData {
  const { now, orgId, idGen } = opts
  const tz = opts.tz ?? DEMO_TZ
  const rng = mulberry32(opts.seed ?? 20261016)
  const int = (a: number, b: number) => Math.floor(rng() * (b - a + 1)) + a
  const chance = (p: number) => rng() < p
  const pick = <T,>(arr: T[]): T => arr[Math.floor(rng() * arr.length)]
  const pickWeighted = <T,>(arr: T[], w: (x: T) => number): T => {
    const total = arr.reduce((s, x) => s + w(x), 0)
    let r = rng() * total
    for (const x of arr) { r -= w(x); if (r <= 0) return x }
    return arr[arr.length - 1]
  }
  const fmtDate = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: tz })
  const cap = (d: Date) => new Date(Math.min(d.getTime(), now.getTime()))

  const today = ymdIn(now, tz)
  const dayStart = (offset: number) => localToUtc(shift(today, offset), 0, tz)
  const localHourNow = (now.getTime() - dayStart(0).getTime()) / HOUR

  // ---------- organization ----------
  const workday = { open: "07:00", close: "17:00" }
  const organization: Prisma.OrganizationUncheckedCreateInput = {
    id: orgId,
    name: DEMO_ORG_NAME,
    slug: DEMO_SLUG,
    phone: DEMO_ORG_PHONE,
    address: DEMO_ORG_ADDRESS,
    plan: "enterprise",
    trialEndsAt: null,
    onboardingDismissed: true,
    sandboxMode: false,
    smsEnabled: false,
    availabilitySchedule: {
      mon: workday, tue: workday, wed: workday, thu: workday, fri: workday,
      sat: { open: "08:00", close: "12:00" }, sun: null,
    },
    createdAt: new Date(now.getTime() - 420 * DAY),
  }

  // ---------- technicians + vehicles ----------
  const technicians: Prisma.TechnicianCreateManyInput[] = TECHS.map((t, i) => ({
    id: idGen(), organizationId: orgId, name: t.name, phone: `(512) 555-01${String(i + 1).padStart(2, "0")}`,
    epa608Level: t.epa608Level, skills: t.skills, isOnDuty: t.onDuty,
    createdAt: new Date(now.getTime() - (400 - i * 20) * DAY),
  }))
  const vehicles: Prisma.VehicleCreateManyInput[] = TECHS.map((t, i) => ({
    id: idGen(), organizationId: orgId, name: t.vehicle, technicianId: technicians[i].id as string,
  }))
  const techId = (i: number) => technicians[i].id as string

  // ---------- customers + equipment ----------
  const customers: Prisma.CustomerCreateManyInput[] = []
  const equipment: Prisma.EquipmentCreateManyInput[] = []
  const equipOfCustomer: number[][] = []
  const equipTypeOf: EquipType[] = []
  const equipInstall: Date[] = []

  CUSTOMERS.forEach((c, ci) => {
    const m = c.address.match(/^(.*), (Austin), (TX) (\d{5})$/)
    customers.push({
      id: idGen(), organizationId: orgId, name: c.name, phone: `(512) 555-01${String(20 + ci).padStart(2, "0")}`,
      address: m ? m[1] : c.address, city: "Austin", state: "TX", postalCode: m ? m[4] : "78704", notes: c.notes ?? null,
      createdAt: now, // corrected after jobs are generated
    })
    equipOfCustomer.push([])
    c.equip.forEach((e) => {
      const yearsOld = c.hero ? 6 : 2 + int(0, 11)
      const install = new Date(now.getTime() - yearsOld * 365 * DAY - int(0, 300) * DAY)
      equipOfCustomer[ci].push(equipment.length)
      equipTypeOf.push(e.type)
      equipInstall.push(install)
      equipment.push({
        id: idGen(), organizationId: orgId, customerId: customers[ci].id as string, equipmentType: e.type,
        make: e.make, model: e.model,
        serialNumber: `${e.make.slice(0, 3).toUpperCase()}${int(1000000, 9999999)}`,
        installDate: install,
        warrantyExpiry: new Date(install.getTime() + (e.type === "furnace" || e.type === "boiler" ? 10 : 5) * 365 * DAY),
        serviceIntervalMonths: c.kind === "commercial" && e.type === "rtu" ? 6 : 12,
        notes: chance(0.12) ? "Unit is in the attic with a narrow access hatch." : null,
        createdAt: install,
      })
    })
  })
  // A few warranties that are about to run out, for the at-risk list.
  ;[3, 9, 17].forEach((i, k) => {
    if (equipment[i]) {
      equipInstall[i] = new Date(now.getTime() - (9 * 365 + 280) * DAY)
      equipment[i].installDate = equipInstall[i]
      equipment[i].warrantyExpiry = new Date(now.getTime() + (20 + k * 25) * DAY)
    }
  })

  // ---------- pricebook ----------
  const pricebook: Prisma.PricebookItemCreateManyInput[] = PRICEBOOK.map((p, i) => ({
    id: idGen(), organizationId: orgId, name: p.name, category: p.category, unit: p.unit, unitPrice: p.price,
    locked: p.locked ?? false, source: p.source ?? (i % 4 === 0 ? "admin" : "ai"), active: true,
    description: null, createdAt: new Date(now.getTime() - 380 * DAY),
  }))
  const priceByName = new Map(pricebook.map((p) => [p.name as string, { id: p.id as string, price: p.unitPrice as number }]))

  // ---------- jobs ----------
  const metas: JobMeta[] = []
  const visits: number[] = CUSTOMERS.map(() => 0) // jobs so far per customer, to keep any one household from dominating
  const slotsUsed = new Map<string, Set<number>>() // `${dayKey}|${techIdx}` -> slot indexes taken

  const durationH = (t: JobTemplate) => (t.service === "installation" && t.amount[0] > 1000 ? 6 : t.service === "repair" ? 1.5 : 1)
  const canTech = (techIdx: number, type: EquipType) => TECHS[techIdx].skills.includes(type)

  // A random open slot in the tech's day, so start times spread out like real dispatch.
  // need >= the number of slots means an all-day job (an install).
  function nextSlot(dayKey: string, techIdx: number, need: number): number | null {
    const key = `${dayKey}|${techIdx}`
    const used = slotsUsed.get(key) ?? new Set<number>()
    slotsUsed.set(key, used)
    if (need >= SLOT_HOURS.length) {
      if (used.size > 0) return null
      SLOT_HOURS.forEach((_, i) => used.add(i))
      return SLOT_HOURS[0]
    }
    const free = SLOT_HOURS.map((_, i) => i).filter((i) => !used.has(i))
    if (free.length === 0) return null
    const i = free[Math.floor(rng() * free.length)]
    used.add(i)
    return SLOT_HOURS[i]
  }

  function pickTemplate(type: EquipType, month0: number, opts2?: { estimateOnly?: boolean; noInstall?: boolean }): JobTemplate | null {
    const pool = TEMPLATES.filter((t) => t.type === type && (!opts2?.estimateOnly || t.estimate) && (!opts2?.noInstall || t.service !== "installation"))
    if (pool.length === 0) return null
    return pickWeighted(pool, (t) => (t.weight ?? 1) * seasonWeight(t.season, month0) + 0.02)
  }

  function pickCustomerEquip(month0: number, avoidCustomers: Set<number>, wantCommercial?: boolean, allowedTypes?: EquipType[]): { ci: number; ei: number | null; type: EquipType } | null {
    const candidates: Array<{ ci: number; ei: number; type: EquipType }> = []
    CUSTOMERS.forEach((c, ci) => {
      if (avoidCustomers.has(ci)) return
      if (wantCommercial !== undefined && (c.kind === "commercial") !== wantCommercial) return
      equipOfCustomer[ci].forEach((ei) => {
        if (!allowedTypes || allowedTypes.includes(equipTypeOf[ei])) candidates.push({ ci, ei, type: equipTypeOf[ei] })
      })
    })
    if (candidates.length === 0) return null
    const c = pickWeighted(candidates, (x) => ((seasonWeight(typeSeason(x.type), month0) + 0.05) * (CUSTOMERS[x.ci].kind === "commercial" ? 1.5 : 1)) / (1 + 0.25 * visits[x.ci]))
    return { ci: c.ci, ei: c.ei, type: c.type }
  }

  function addJob(p: {
    dayOffset: number; hour: number; status: string; ci: number; ei: number | null; techIdx: number | null
    tmpl: JobTemplate; priority?: string; symptom?: string; recurringJobId?: string
    forceReview?: JobMeta["forceReview"]; noReview?: boolean; amount?: number; createdAt?: Date; scheduledAtOverride?: Date
  }): JobMeta {
    const scheduledAt = p.scheduledAtOverride ?? localToUtc(shift(today, p.dayOffset), p.hour, tz)
    const dur = durationH(p.tmpl)
    const done = p.status === "completed"
    const completedAt = done ? cap(new Date(scheduledAt.getTime() + dur * HOUR + int(-10, 25) * MIN)) : undefined
    const createdAt = p.createdAt ?? new Date(Math.min(scheduledAt.getTime() - int(1, p.tmpl.service === "maintenance" ? 14 : 5) * DAY, now.getTime() - int(2, 40) * HOUR))
    const priority = p.priority ?? (p.status === "cancelled" ? "normal" : p.tmpl.service === "repair" ? (chance(0.03) ? "urgent" : chance(0.13) ? "high" : "normal") : chance(0.25) ? "low" : "normal")
    const id = idGen()
    const row: Prisma.JobCreateManyInput = {
      id, organizationId: orgId, customerId: customers[p.ci].id as string,
      technicianId: p.techIdx === null ? null : techId(p.techIdx),
      equipmentId: p.ei === null ? null : (equipment[p.ei].id as string),
      recurringJobId: p.recurringJobId ?? null,
      status: p.status, priority, scheduledAt,
      symptomSummary: p.symptom ?? p.tmpl.symptom,
      equipmentType: p.tmpl.type, serviceType: p.tmpl.service,
      equipmentNotes: chance(0.07) ? "Customer will be home. Park in the driveway." : null,
      summary: done ? p.tmpl.summary : null,
      actionsTaken: done ? p.tmpl.actions : null,
      partsUsed: done ? p.tmpl.parts : [],
      completedAt: completedAt ?? null,
      createdAt,
      updatedAt:
        done && completedAt ? completedAt
        : p.status === "in_progress" ? scheduledAt
        : p.status === "en_route" ? new Date(now.getTime() - 18 * MIN)
        : p.status === "cancelled" ? cap(new Date(createdAt.getTime() + DAY)) : createdAt,
    }
    const meta: JobMeta = {
      id, customerIdx: p.ci, equipIdx: p.ei, techIdx: p.techIdx, tmpl: p.tmpl, status: p.status, scheduledAt, completedAt,
      amount: p.amount ?? int(p.tmpl.amount[0], p.tmpl.amount[1]), symptom: p.symptom ?? p.tmpl.symptom,
      forceReview: p.forceReview, noReview: p.noReview, row,
    }
    metas.push(meta)
    visits[p.ci]++
    return meta
  }

  // Plan visits and next-day fallbacks land on a working day, not a Sunday or Saturday.
  const businessDay = (off: number) => {
    let o = off
    while ([0, 6].includes(dayOfWeek(shift(today, o)))) o++
    return o
  }

  const heroIdx = CUSTOMERS.findIndex((c) => c.hero)
  const heroAc = equipOfCustomer[heroIdx].find((e) => equipTypeOf[e] === "ac") as number
  const heroFurnace = equipOfCustomer[heroIdx].find((e) => equipTypeOf[e] === "furnace") as number
  const tplByTitle = (s: string) => TEMPLATES.find((t) => t.symptom === s) as JobTemplate
  const marcus = 0

  const bigInstalls = new Map<string, number>()

  // History: dense for 30 days, lighter and growing before that.
  for (let off = -180; off <= -1; off++) {
    const c = shift(today, off)
    const dow = dayOfWeek(c)
    if (dow === 0) continue
    const month0 = c.m - 1
    let n: number
    if (dow === 6) n = chance(0.22) ? 1 : 0
    else if (off >= -30) n = 3 + (chance(0.4) ? 1 : 0) - (chance(0.15) ? 1 : 0)
    else {
      const base = 1.5 + 0.9 * ((off + 180) / 150)
      n = Math.floor(base) + (chance(base - Math.floor(base)) ? 1 : 0)
    }
    const avoid = new Set<number>()
    const dayKey = `h${off}`
    const monthKey = `${c.y}-${c.m}`
    for (let k = 0; k < n; k++) {
      const ce = pickCustomerEquip(month0, avoid)
      if (!ce) continue
      let type: EquipType = ce.type
      let ei: number | null = ce.ei
      if (CUSTOMERS[ce.ci].kind === "residential" && chance(0.05)) { type = "thermostat"; ei = null }
      let tmpl = pickTemplate(type, month0)
      // One full system replacement a month at most, so a single $9k ticket can't distort the revenue trend.
      if (tmpl && tmpl.service === "installation" && tmpl.amount[0] > 1000) {
        if ((bigInstalls.get(monthKey) ?? 0) >= 1) tmpl = pickTemplate(type, month0, { noInstall: true })
        else bigInstalls.set(monthKey, 1)
      }
      if (!tmpl) continue
      const need = durationH(tmpl) >= 6 ? SLOT_HOURS.length : 1
      const prefComm = CUSTOMERS[ce.ci].kind === "commercial" ? [3, 5, 0] : [0, 1, 2, 4, 5, 3]
      const order = [...prefComm.filter((t) => canTech(t, type)), ...[0, 1, 2, 3, 4, 5].filter((t) => canTech(t, type) && !prefComm.includes(t))]
      let techIdx: number | null = null
      let hour = 0
      // rotate the start so work spreads across the crew
      const rot = int(0, Math.max(0, order.length - 1))
      for (let q = 0; q < order.length; q++) {
        const cand = order[(q + rot) % order.length]
        const h = nextSlot(dayKey, cand, need)
        if (h !== null) { techIdx = cand; hour = h; break }
      }
      if (techIdx === null) continue
      avoid.add(ce.ci)
      const cancelled = chance(0.04)
      addJob({ dayOffset: off, hour, status: cancelled ? "cancelled" : "completed", ci: ce.ci, ei, techIdx, tmpl, symptom: cancelled ? `${tmpl.symptom} (customer rescheduled)` : undefined })
    }
  }

  // The hero customer's own history, so the customer app tells a full story.
  addJob({ dayOffset: -118, hour: 9.5, status: "completed", ci: heroIdx, ei: heroFurnace, techIdx: marcus, tmpl: tplByTitle("Furnace tune-up before winter"), forceReview: { rating: 5, comment: "Marcus was thorough and explained everything he checked. Furnace is running great." } })
  addJob({ dayOffset: -41, hour: 9.5, status: "completed", ci: heroIdx, ei: heroAc, techIdx: marcus, tmpl: tplByTitle("Outdoor unit not starting"), forceReview: { rating: 5, comment: "Fixed it same day and the price matched the estimate exactly." } })
  const heroRecent = addJob({ dayOffset: -5, hour: 9.5, status: "completed", ci: heroIdx, ei: heroAc, techIdx: marcus, tmpl: tplByTitle("AC tune-up before summer"), noReview: true })
  heroRecent.amount = 139

  // Today: a realistic day for the whole crew, with status driven by the clock.
  const todayPlan: Array<{ tech: number; hour: number; commercial?: boolean; hero?: boolean }> = [
    { tech: 0, hour: 7.5 }, { tech: 1, hour: 8.5 }, { tech: 2, hour: 9.5 }, { tech: 3, hour: 10, commercial: true },
    { tech: 5, hour: 11, commercial: true }, { tech: 0, hour: 12.5, hero: true }, { tech: 1, hour: 13.5 },
    { tech: 2, hour: 14.5 }, { tech: 3, hour: 15.5, commercial: true },
  ]
  const todayAvoid = new Set<number>([heroIdx])
  const todayMonth = today.m - 1
  for (const slot of todayPlan) {
    let ci: number; let ei: number | null; let tmpl: JobTemplate | null
    if (slot.hero) { ci = heroIdx; ei = heroAc; tmpl = TEMPLATES[0] }
    else {
      const ce = pickCustomerEquip(todayMonth, todayAvoid, slot.commercial ?? false, TECHS[slot.tech].skills.filter((s) => s !== "thermostat"))
      if (!ce) continue
      ci = ce.ci; ei = ce.ei
      tmpl = pickTemplate(ce.type, todayMonth, { noInstall: true })
    }
    if (!tmpl) continue
    todayAvoid.add(ci)
    const start = slot.hour
    const dur = durationH(tmpl)
    const status =
      localHourNow > 19 ? "completed"
      : start + dur <= localHourNow ? "completed"
      : start <= localHourNow ? "in_progress"
      : start - 0.75 <= localHourNow ? "en_route" : "scheduled"
    addJob({ dayOffset: 0, hour: start, status, ci, ei, techIdx: slot.tech, tmpl, priority: slot.hero ? "high" : undefined })
  }
  // The call that's waiting for a truck right now.
  const hartwell = CUSTOMERS.findIndex((c) => c.name.startsWith("Hartwell"))
  const urgentTmpl = TEMPLATES.find((t) => t.symptom === "RTU not cooling tenant space") as JobTemplate
  const urgentStart = new Date(Math.max(now.getTime() + 60 * MIN, localToUtc(today, 13, tz).getTime()))
  const urgentOk = urgentStart.getTime() < localToUtc(today, 17, tz).getTime()
  addJob({
    dayOffset: urgentOk ? 0 : businessDay(1), hour: urgentOk ? 0 : 8, status: "pending", ci: hartwell, ei: equipOfCustomer[hartwell][0], techIdx: null,
    tmpl: urgentTmpl, priority: "urgent", symptom: "AC completely down. Waiting room is at 88°F with patients on site.",
    scheduledAtOverride: urgentOk ? urgentStart : undefined,
  })

  // Upcoming 10 days.
  let estimateCandidates = 0
  for (let off = 1; off <= 10; off++) {
    const c = shift(today, off)
    const dow = dayOfWeek(c)
    if (dow === 0 || dow === 6) continue
    const n = 3 + (chance(0.6) ? 1 : 0) + (chance(0.2) ? 1 : 0)
    const avoid = new Set<number>([heroIdx])
    const dayKey = `f${off}`
    for (let k = 0; k < n; k++) {
      const ce = pickCustomerEquip(c.m - 1, avoid)
      if (!ce) continue
      const wantEstimate = estimateCandidates < 7 && chance(0.45)
      const tmpl = pickTemplate(ce.type, c.m - 1, { estimateOnly: wantEstimate, noInstall: true }) ?? pickTemplate(ce.type, c.m - 1, { noInstall: true })
      if (!tmpl) continue
      if (tmpl.estimate && tmpl.service === "repair" && tmpl.outcome === undefined) estimateCandidates++
      const order = [0, 1, 2, 3, 4, 5].filter((t) => canTech(t, ce.type))
      const rot = int(0, Math.max(0, order.length - 1))
      let techIdx: number | null = null
      let hour = 0
      for (let q = 0; q < order.length; q++) {
        const cand = order[(q + rot) % order.length]
        const h = nextSlot(dayKey, cand, 1)
        if (h !== null) { techIdx = cand; hour = h; break }
      }
      if (techIdx === null) continue
      avoid.add(ce.ci)
      const unassigned = k === n - 1 && off % 3 === 0
      addJob({ dayOffset: off, hour, status: unassigned ? "pending" : "scheduled", ci: ce.ci, ei: ce.ei, techIdx: unassigned ? null : techIdx, tmpl })
    }
  }
  // Hero's next visit.
  addJob({ dayOffset: 3, hour: 9.5, status: "scheduled", ci: heroIdx, ei: heroFurnace, techIdx: marcus, tmpl: tplByTitle("Furnace tune-up before winter") })

  // ---------- equipment service dates ----------
  // Preventive visits (tune-ups, inspections) set the maintenance clock; repairs don't.
  const lastServed = new Map<number, Date>()
  for (const m of metas) {
    if (m.status !== "completed" || m.equipIdx === null || m.tmpl.service === "repair" || m.tmpl.service === "installation" || !m.completedAt) continue
    const prev = lastServed.get(m.equipIdx)
    if (!prev || m.completedAt > prev) lastServed.set(m.equipIdx, m.completedAt)
  }
  const dueOffsets = [-38, -21, -9, 4, 11, 19, 26, 33]
  let dueIdx = 0
  equipment.forEach((e, i) => {
    const months = e.serviceIntervalMonths as number
    const intervalMs = months * 30.44 * DAY
    let last = lastServed.get(i)
    if (!last) {
      const off = dueIdx < dueOffsets.length ? dueOffsets[dueIdx++] : 45 + int(0, 250)
      last = new Date(now.getTime() + off * DAY - intervalMs)
    }
    if (last.getTime() + intervalMs < now.getTime() - 75 * DAY) last = new Date(now.getTime() - 75 * DAY - intervalMs)
    e.lastServicedAt = last
  })

  // ---------- estimates ----------
  const estimates: Prisma.EstimateCreateManyInput[] = []
  const estimateLines: Prisma.EstimateLineCreateManyInput[] = []
  function addEstimate(meta: JobMeta, kind: NonNullable<JobTemplate["estimate"]>, status: string, tier?: "good" | "better" | "best"): number {
    const tiers = ESTIMATE_TIERS[kind]
    const id = idGen()
    const createdAt = status === "draft" ? new Date(now.getTime() - int(20, 90) * MIN) : cap(new Date(Math.min(meta.scheduledAt.getTime() - DAY, now.getTime() - int(1, 3) * DAY)))
    const sentAt = status === "draft" ? null : new Date(createdAt.getTime() + 30 * MIN)
    const approved = status === "approved"
    const approvedAt = approved && sentAt ? cap(new Date(sentAt.getTime() + int(1, 20) * HOUR)) : null
    const totals = { good: 0, better: 0, best: 0 }
    for (const t of ["good", "better", "best"] as const) {
      for (const [name, qty] of tiers[t]) {
        const pb = priceByName.get(name)
        if (!pb) continue
        totals[t] += pb.price * qty
        estimateLines.push({ id: idGen(), estimateId: id, pricebookItemId: pb.id, tier: t, name, quantity: qty, unitPrice: pb.price, locked: false, source: "ai" })
      }
    }
    const total = tier ? totals[tier] : 0
    estimates.push({
      id, organizationId: orgId, jobId: meta.id, status,
      selectedTier: approved ? tier : null, signedAt: approvedAt, approvedAt,
      depositAmount: approved && total >= 500 ? Math.round(total * 0.25) : null,
      depositPaidAt: approved && total >= 500 && approvedAt ? new Date(approvedAt.getTime() + 10 * MIN) : null,
      sentAt, expiresAt: sentAt ? new Date(sentAt.getTime() + 30 * DAY) : null, createdAt, updatedAt: approvedAt ?? sentAt ?? createdAt,
    })
    return total
  }

  const heroToday = metas.find((m) => m.customerIdx === heroIdx && m.scheduledAt >= dayStart(0) && m.scheduledAt < dayStart(1))
  const upcomingEst = metas.filter((m) => ["scheduled", "pending", "in_progress", "en_route"].includes(m.status) && m.tmpl.service === "repair" && m.tmpl.estimate && !m.tmpl.outcome)
  const ordered = [...(heroToday?.tmpl.estimate ? [heroToday] : []), ...upcomingEst.filter((m) => m !== heroToday)].slice(0, 5)
  ordered.forEach((m, i) => {
    // First is the hero's own job, "sent" so her customer app has something to approve.
    addEstimate(m, m.tmpl.estimate as NonNullable<JobTemplate["estimate"]>, i === 1 || i === 2 ? "draft" : "sent")
  })
  const ninetyAgo = now.getTime() - 90 * DAY
  for (const m of metas) {
    if (m.status !== "completed" || !m.tmpl.estimate || !m.tmpl.outcome || m.scheduledAt.getTime() < ninetyAgo) continue
    if (m.tmpl.outcome === "approved") {
      const tier = pickWeighted(["good", "better", "best"] as const, (t) => (t === "better" ? 2 : 1))
      m.amount = addEstimate(m, m.tmpl.estimate, "approved", tier)
    } else if (m.tmpl.outcome === "declined") {
      addEstimate(m, m.tmpl.estimate, "declined")
    } else {
      const old = m.scheduledAt.getTime() < now.getTime() - 35 * DAY
      addEstimate(m, m.tmpl.estimate, old ? "expired" : "sent")
    }
  }

  // ---------- invoices ----------
  const invoices: Prisma.InvoiceCreateManyInput[] = []
  const invoiceByJob = new Map<string, string>()
  for (const m of metas) {
    if (m.status !== "completed" || !m.completedAt) continue
    const issued = m.completedAt
    const due = new Date(issued.getTime() + 15 * DAY)
    const age = (now.getTime() - issued.getTime()) / DAY
    const paidChance = age > 25 ? 0.96 : age > 14 ? 0.82 : age > 2 ? 0.6 : 0.2
    const isHeroRecent = m === heroRecent
    const paid = isHeroRecent ? false : chance(paidChance)
    const status = paid ? "paid" : due.getTime() < now.getTime() ? "overdue" : "pending"
    const id = idGen()
    invoiceByJob.set(m.id, id)
    invoices.push({
      id, organizationId: orgId, jobId: m.id, customerId: customers[m.customerIdx].id as string,
      description: m.tmpl.invoiceLabel, amount: m.amount, status, issuedDate: issued, dueDate: due,
      createdAt: new Date(issued.getTime() + 5 * MIN),
      updatedAt: paid ? cap(new Date(issued.getTime() + int(1, 12) * DAY)) : new Date(issued.getTime() + 5 * MIN),
    })
  }

  // ---------- reviews ----------
  const reviews: Prisma.JobReviewCreateManyInput[] = []
  const ratingWeights: Array<[number, number]> = [[5, 66], [4, 22], [3, 7], [2, 5]]
  let officeResponses = 0
  for (const m of metas) {
    if (m.status !== "completed" || !m.completedAt || m.noReview) continue
    if (m.completedAt.getTime() < now.getTime() - 130 * DAY && !m.forceReview) continue
    if (!m.forceReview && !chance(0.45)) continue
    const rating = m.forceReview?.rating ?? pickWeighted(ratingWeights, (x) => x[1])[0]
    const comment = m.forceReview?.comment ?? (chance(rating >= 5 ? 0.6 : 0.9) ? pick(REVIEW_COMMENTS[rating]) : null)
    const respond = rating <= 3 && officeResponses < OFFICE_RESPONSES.length
    reviews.push({
      id: idGen(), jobId: m.id, organizationId: orgId, customerId: customers[m.customerIdx].id as string,
      rating, comment, officeResponse: respond ? OFFICE_RESPONSES[officeResponses++] : null, flagged: false,
      createdAt: cap(new Date(m.completedAt.getTime() + int(2, 36) * HOUR)),
    })
  }

  // ---------- compliance log ----------
  const complianceLogs: Prisma.ComplianceLogCreateManyInput[] = []
  const refrigerants = ["R-410A", "R-410A", "R-410A", "R-410A", "R-22", "R-454B"]
  for (const m of metas) {
    if (m.status !== "completed" || !m.completedAt || m.techIdx === null) continue
    if (m.completedAt.getTime() < now.getTime() - 92 * DAY) continue
    const at = (mins: number) => cap(new Date((m.completedAt as Date).getTime() - mins * MIN))
    if (m.tmpl.refrigerant) {
      const charged = Math.round((1.5 + rng() * 5) * 10) / 10
      complianceLogs.push({ id: idGen(), jobId: m.id, type: "epa608_prompt", createdAt: at(15), payload: { refrigerantType: pick(refrigerants), lbsRecovered: m.tmpl.service === "installation" ? Math.round((4 + rng() * 4) * 10) / 10 : Math.round(rng() * 10) / 10, lbsCharged: charged, certLevel: TECHS[m.techIdx].epa608Level } })
    }
    if (m.tmpl.gas) {
      complianceLogs.push({ id: idGen(), jobId: m.id, type: "safety_ack", createdAt: at(45), payload: { items: ["Gas shutoff verified before service", "Carbon monoxide check completed before leaving"] } })
      if (chance(0.3) || m.tmpl.service === "installation") complianceLogs.push({ id: idGen(), jobId: m.id, type: "code_reminder", createdAt: at(30), payload: { codes: ["IFGC 503 venting clearances verified"] } })
    } else if (m.tmpl.parts.some((p) => /capacitor|contactor|motor|compressor/i.test(p))) {
      complianceLogs.push({ id: idGen(), jobId: m.id, type: "safety_ack", createdAt: at(40), payload: { items: ["Power disconnected and locked out", "Capacitor discharged before service"] } })
    }
  }

  // ---------- recurring jobs, maintenance plans ----------
  const recurringJobs: Prisma.RecurringJobCreateManyInput[] = []
  const plans: Prisma.MaintenancePlanCreateManyInput[] = []
  const planItems: Prisma.MaintenancePlanItemCreateManyInput[] = []
  const cIdx = (name: string) => CUSTOMERS.findIndex((c) => c.name === name)
  const eqOf = (ci: number, type: EquipType, nth = 0) => equipOfCustomer[ci].filter((e) => equipTypeOf[e] === type)[nth] as number

  interface PlanSpec { customer: string; name: string; price: number; startDaysAgo: number; status: string; items: Array<{ type: EquipType; nth?: number; service: string; months: number; dueIn: number }> }
  const planSpecs: PlanSpec[] = [
    { customer: "Jennifer Castillo", name: "Comfort Club, 2 System Plan", price: 249, startDaysAgo: 240, status: "active", items: [{ type: "ac", service: "AC tune-up", months: 12, dueIn: 170 }, { type: "furnace", service: "Furnace tune-up", months: 12, dueIn: 6 }] },
    { customer: "Robert Hayes", name: "Comfort Club, 2 System Plan", price: 249, startDaysAgo: 95, status: "active", items: [{ type: "ac", service: "AC tune-up", months: 12, dueIn: 210 }, { type: "furnace", service: "Furnace tune-up", months: 12, dueIn: 40 }] },
    { customer: "Walter Dobbs", name: "Comfort Club, 2 System Plan", price: 249, startDaysAgo: 340, status: "active", items: [{ type: "ac", service: "AC tune-up", months: 12, dueIn: 3 }, { type: "furnace", service: "Furnace tune-up", months: 12, dueIn: 9 }] },
    { customer: "Oakmont Senior Living", name: "Commercial Quarterly Service Agreement", price: 3840, startDaysAgo: 150, status: "active", items: [{ type: "boiler", service: "Boiler inspection", months: 3, dueIn: 20 }, { type: "rtu", nth: 0, service: "Quarterly RTU service", months: 3, dueIn: 11 }, { type: "rtu", nth: 1, service: "Quarterly RTU service", months: 3, dueIn: 11 }] },
    { customer: "Hartwell Family Dental", name: "Commercial Quarterly Service Agreement", price: 1480, startDaysAgo: 70, status: "active", items: [{ type: "rtu", nth: 0, service: "Quarterly RTU service", months: 3, dueIn: 27 }, { type: "rtu", nth: 1, service: "Quarterly RTU service", months: 3, dueIn: 27 }] },
    { customer: "Thomas Okafor", name: "Comfort Club, 2 System Plan", price: 249, startDaysAgo: 430, status: "expired", items: [{ type: "ac", service: "AC tune-up", months: 12, dueIn: -60 }, { type: "furnace", service: "Furnace tune-up", months: 12, dueIn: -60 }] },
  ]
  for (const spec of planSpecs) {
    const ci = cIdx(spec.customer)
    const planId = idGen()
    const invoiceId = idGen()
    const start = new Date(now.getTime() - spec.startDaysAgo * DAY)
    invoices.push({ id: invoiceId, organizationId: orgId, jobId: null, customerId: customers[ci].id as string, description: `${spec.name} (annual)`, amount: spec.price, status: "paid", issuedDate: start, dueDate: new Date(start.getTime() + 15 * DAY), createdAt: start, updatedAt: start })
    plans.push({ id: planId, organizationId: orgId, customerId: customers[ci].id as string, name: spec.name, price: spec.price, startDate: start, endDate: new Date(start.getTime() + 365 * DAY), status: spec.status, invoiceId, createdAt: start, updatedAt: start })
    for (const it of spec.items) {
      const ei = eqOf(ci, it.type, it.nth ?? 0)
      const rjId = idGen()
      // Her plan's furnace visit is the job already on the schedule, so link it instead of drafting a second one.
      const linked = it.type === "furnace" && spec.customer === CUSTOMERS[heroIdx].name
        ? metas.find((m) => m.customerIdx === ci && m.status === "scheduled" && m.tmpl.type === "furnace")
        : undefined
      const nextDueAt = linked ? linked.scheduledAt : new Date(now.getTime() + it.dueIn * DAY)
      const intervalDays = Math.round(it.months * 30.44)
      recurringJobs.push({
        id: rjId, organizationId: orgId, customerId: customers[ci].id as string, technicianId: null, equipmentId: equipment[ei].id as string,
        equipmentType: it.type, serviceType: "maintenance", intervalDays, nextDueAt,
        lastJobAt: new Date(nextDueAt.getTime() - intervalDays * DAY), notes: `${it.service}, ${spec.name}`,
        isActive: spec.status === "active", createdAt: start, updatedAt: start,
      })
      planItems.push({ id: idGen(), planId, equipmentId: equipment[ei].id as string, serviceType: it.service, intervalMonths: it.months, recurringJobId: rjId, createdAt: start })
      // Visits that are due soon already exist as unassigned drafts waiting for a truck.
      if (linked) linked.row.recurringJobId = rjId
      else if (spec.status === "active" && it.dueIn <= 14) {
        const tmpl = TEMPLATES.find((t) => t.type === it.type && t.service === "maintenance") as JobTemplate
        addJob({ dayOffset: businessDay(it.dueIn), hour: 8, status: "pending", ci, ei, techIdx: null, tmpl, recurringJobId: rjId, symptom: `${it.service}, ${spec.name}`, priority: "normal" })
      }
    }
  }
  // ---------- messages ----------
  const conversations: Prisma.ConversationCreateManyInput[] = []
  const messages: Prisma.MessageCreateManyInput[] = []
  const ago = (mins: number) => new Date(now.getTime() - mins * MIN)
  function convo(subject: string, channel: "internal" | "sms", participants: string[], unread: number, customerIdx: number | null, lines: Array<{ who: string; role: "dispatch" | "technician" | "customer"; text: string; minsAgo: number }>) {
    const id = idGen()
    const last = lines[lines.length - 1]
    conversations.push({
      id, organizationId: orgId, customerId: customerIdx === null ? null : (customers[customerIdx].id as string),
      subject, channel, participants, unreadCount: unread, lastMessageAt: ago(last.minsAgo), createdAt: ago(lines[0].minsAgo), updatedAt: ago(last.minsAgo),
    })
    for (const l of lines) messages.push({ id: idGen(), conversationId: id, sender: l.who, senderRole: l.role, content: l.text, createdAt: ago(l.minsAgo) })
  }
  const nm = (i: number) => TECHS[i].name
  convo("Hartwell Dental: after-hours access", "internal", ["Dispatch", nm(3)], 0, null, [
    { who: "Dispatch", role: "dispatch", text: "Hartwell wants the RTU service after 5. Front desk will leave the key with the answering service.", minsAgo: 2900 },
    { who: nm(3), role: "technician", text: "Copy. I'll go at 5:30 and text when I'm on the roof.", minsAgo: 2870 },
    { who: "Dispatch", role: "dispatch", text: "Perfect, thanks.", minsAgo: 2860 },
  ])
  convo("Parts run: capacitors and contactors", "internal", ["Dispatch", nm(2), nm(0)], 1, null, [
    { who: nm(0), role: "technician", text: "I'm out of 45/5 capacitors. Anyone near the supply house?", minsAgo: 190 },
    { who: nm(2), role: "technician", text: "I'm 10 minutes away. Grabbing a box of 10.", minsAgo: 182 },
    { who: "Dispatch", role: "dispatch", text: "Thanks Tyler, bill it to the shop account.", minsAgo: 178 },
    { who: nm(2), role: "technician", text: "Got 'em. Back on the road, I'll drop 4 at Marcus's next stop.", minsAgo: 140 },
  ])
  convo("Schedule swap: Thursday", "internal", ["Dispatch", nm(1)], 1, null, [
    { who: nm(1), role: "technician", text: "Can I swap my 2pm with Luis? I have a doctor's appointment.", minsAgo: 75 },
    { who: "Dispatch", role: "dispatch", text: "Checking with Luis, give me 5 minutes.", minsAgo: 70 },
  ])
  convo("Castillo: gate and dog", "internal", ["Dispatch", nm(0)], 0, null, [
    { who: "Dispatch", role: "dispatch", text: "Heads up on Castillo: dog in the backyard, call from the driveway.", minsAgo: 1500 },
    { who: nm(0), role: "technician", text: "Got it. I was there in the spring, friendly pup.", minsAgo: 1480 },
  ])
  convo("Oakmont Senior Living: visit window", "internal", ["Dispatch", nm(3)], 0, null, [
    { who: "Dispatch", role: "dispatch", text: "Oakmont asked that anything noisy happens between 10 and 2.", minsAgo: 4300 },
    { who: nm(3), role: "technician", text: "Understood. I'll do the boiler first and leave the rooftop units for after lunch.", minsAgo: 4280 },
  ])
  convo("Truck 3: oil change due", "internal", ["Dispatch", nm(2)], 0, null, [
    { who: "Dispatch", role: "dispatch", text: "Truck 3 is at 5,200 miles past the last oil change. Can you swing by the shop Friday morning?", minsAgo: 3100 },
    { who: nm(2), role: "technician", text: "Will do. I'll go before my first job.", minsAgo: 3050 },
  ])
  convo(`SMS — ${CUSTOMERS[heroIdx].name} (${customers[heroIdx].id})`, "sms", [], 0, heroIdx, [
    { who: CUSTOMERS[heroIdx].name, role: "customer", text: "Hi! Is Marcus still coming between 12 and 2 today?", minsAgo: 95 },
    { who: "Dispatch", role: "dispatch", text: "Hi Jennifer, yes. Marcus is on his way and will be there around 12:45.", minsAgo: 88 },
    { who: CUSTOMERS[heroIdx].name, role: "customer", text: "Great, thank you!", minsAgo: 86 },
  ])
  const hayes = cIdx("Robert Hayes")
  convo(`SMS — ${CUSTOMERS[hayes].name} (${customers[hayes].id})`, "sms", [], 0, hayes, [
    { who: CUSTOMERS[hayes].name, role: "customer", text: "Thanks for the quick fix yesterday. AC is working great.", minsAgo: 1250 },
    { who: "Dispatch", role: "dispatch", text: "Glad to hear it, Robert! Let us know if anything changes.", minsAgo: 1240 },
  ])
  convo(`SMS — ${CUSTOMERS[hartwell].name} (${customers[hartwell].id})`, "sms", [], 1, hartwell, [
    { who: CUSTOMERS[hartwell].name, role: "customer", text: "Can someone look at the waiting room unit? It's 82 in here and we have patients.", minsAgo: 22 },
    { who: "Dispatch", role: "dispatch", text: "We're getting a technician assigned now and will text you an ETA shortly.", minsAgo: 18 },
  ])

  // ---------- notifications ----------
  const notifications: Prisma.NotificationCreateManyInput[] = []
  const notif = (type: string, title: string, body: string, minsAgo: number, link: string, read: boolean) =>
    notifications.push({ id: idGen(), organizationId: orgId, type, title, body, link, read, createdAt: ago(minsAgo) })
  const recentPaid = invoices.filter((i) => i.status === "paid" && i.jobId).sort((a, b) => (b.issuedDate as Date).getTime() - (a.issuedDate as Date).getTime()).slice(0, 2)
  recentPaid.forEach((inv, i) => {
    const c = customers.find((x) => x.id === inv.customerId)
    notif("payment.received", "Payment Received", `$${(inv.amount as number).toFixed(2)} from ${c?.name}`, 30 + i * 240, "/office/reports", i > 0)
  })
  notif("job.created", "New Job", "AC completely down at Hartwell Family Dental (urgent)", 21, "/office/jobs", false)
  notif("job.completed", "Job Completed", `${nm(0)} finished a job`, 130, "/office/jobs", false)
  notif("review.new", "New Review", "A customer left a 5-star review", 400, "/office/jobs", true)
  notif("plan.created", "Maintenance Plan Created", "Comfort Club plan renewed for Walter Dobbs", 1800, "/office/maintenance", true)
  notif("job.status_changed", "Job Status Updated", `${nm(1)} is en route`, 4, "/office/schedule", false)

  // ---------- customers' join dates, from their first job ----------
  const firstJob = new Map<number, number>()
  for (const m of metas) {
    const t = m.row.createdAt instanceof Date ? m.row.createdAt.getTime() : now.getTime()
    firstJob.set(m.customerIdx, Math.min(firstJob.get(m.customerIdx) ?? Infinity, t))
  }
  customers.forEach((c, i) => {
    const base = firstJob.get(i) ?? now.getTime() - 200 * DAY
    c.createdAt = new Date(Math.min(base - int(1, 40) * DAY, now.getTime() - 3 * DAY))
    c.updatedAt = c.createdAt
  })

  const blockedDates: Prisma.BlockedDateCreateManyInput[] = [
    { id: idGen(), organizationId: orgId, date: localToUtc(shift(today, 21), 0, tz), reason: "Team training day" },
  ]

  // Pre-arrival briefings for visits that haven't happened yet.
  for (const m of metas) {
    if (!["scheduled", "en_route"].includes(m.status) || m.techIdx === null) continue
    const cust = CUSTOMERS[m.customerIdx]
    const prior = metas.filter((x) => x.customerIdx === m.customerIdx && x.status === "completed" && x.completedAt).sort((a, b) => (b.completedAt as Date).getTime() - (a.completedAt as Date).getTime())[0]
    const notes = prior
      ? `${cust.name}. ${m.symptom}. Last visit was ${fmtDate(prior.completedAt as Date)}: ${prior.tmpl.summary}`
      : `First visit to ${cust.name}. ${m.symptom}. Confirm equipment make, model and serial on arrival.`
    const flags = (cust.notes ?? "").split(/(?<=\.)\s+/).filter(Boolean).slice(0, 2)
    if (m.equipIdx !== null && now.getTime() - equipInstall[m.equipIdx].getTime() > 12 * 365 * DAY) flags.push("Unit is over 12 years old. Check parts availability before ordering.")
    m.row.preArrivalNotes = notes
    m.row.suggestedParts = m.tmpl.parts.length ? m.tmpl.parts : ["Pleated filters, assorted sizes"]
    m.row.suggestedTools = TOOLS[m.tmpl.type]
    m.row.riskFlags = flags
  }

  return {
    organization, technicians, vehicles, customers, equipment, pricebook, recurringJobs,
    jobs: metas.map((m) => m.row), invoices, estimates, estimateLines, reviews, complianceLogs,
    plans, planItems, conversations, messages, notifications, blockedDates,
    leadTechnicianId: techId(0), heroCustomerId: customers[heroIdx].id as string,
  }
}
