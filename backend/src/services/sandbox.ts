import { prisma } from "../lib/prisma.js"

const DAY = 86_400_000
const HOUR = 3_600_000

/** Milliseconds offset from now, at a fixed hour of that day (local server time). */
function at(dayOffset: number, hour: number): Date {
  const d = new Date(Date.now() + dayOffset * DAY)
  d.setHours(hour, 0, 0, 0)
  return d
}

/**
 * Loads a small, realistic set of practice data into a brand-new organization
 * so a prospect can learn the app without an empty screen.
 *
 * Deliberately contains NO customer email addresses and only fictional
 * (555-01xx) phone numbers, so no real notification can ever go out to a
 * sample customer. Every root record is tagged isSample so exitSandbox() can
 * remove exactly this data and nothing the account added itself.
 */
export async function seedSandboxData(organizationId: string): Promise<void> {
  const already = await prisma.customer.count({ where: { organizationId, isSample: true } })
  if (already > 0) return

  await prisma.$transaction(async (tx) => {
    const org = { organizationId, isSample: true }

    const [ray, ana, jesse] = await Promise.all([
      tx.technician.create({ data: { ...org, name: "Ray Okafor", phone: "(303) 555-0111", epa608Level: "Universal", skills: ["furnace", "ac", "heat-pump"] } }),
      tx.technician.create({ data: { ...org, name: "Ana Duarte", phone: "(303) 555-0112", epa608Level: "Type II", skills: ["ac", "heat-pump"] } }),
      tx.technician.create({ data: { ...org, name: "Jesse Bramble", phone: "(303) 555-0113", epa608Level: "Type I", skills: ["furnace"], isOnDuty: false } }),
    ])
    await Promise.all([
      tx.vehicle.create({ data: { ...org, name: "Truck 1", technicianId: ray.id } }),
      tx.vehicle.create({ data: { ...org, name: "Truck 2", technicianId: ana.id } }),
      tx.vehicle.create({ data: { ...org, name: "Van 3", technicianId: jesse.id } }),
    ])

    const cust = (name: string, phone: string, address: string, postalCode: string, notes?: string) =>
      tx.customer.create({ data: { ...org, name, phone, address, city: "Denver", state: "CO", postalCode, notes } })

    const [vega, dell, trellis, pine, sunrise] = await Promise.all([
      cust("Marisol Vega", "(303) 555-0121", "412 Larimer St", "80202", "Prefers morning appointments. Gate code 4471."),
      cust("Dell Ridge Apartments", "(303) 555-0122", "1800 Dell Ridge Rd", "80205", "Property manager: call before entering units."),
      cust("Trellis Property Group", "(303) 555-0123", "77 Trellis Way", "80207"),
      cust("Pine Valley HOA", "(303) 555-0124", "9 Pine Valley Ct", "80210"),
      cust("Sunrise Office Park", "(303) 555-0125", "300 Sunrise Blvd", "80211", "After-hours access requires building security."),
    ])

    // lastServicedAt is set close to "now" (not derived from the old installDate) so the
    // maintenance-due math lands on realistic small numbers — a few days/weeks overdue or
    // upcoming — instead of years, which is what installDate-only equipment produced.
    const [vegaFurnace, vegaAc, dellBoiler, sunriseRtu] = await Promise.all([
      tx.equipment.create({ data: { organizationId, customerId: vega.id, equipmentType: "furnace", make: "Carrier", model: "59TP6A", serialNumber: "SAMPLE-1001", installDate: at(-2400, 9), lastServicedAt: at(-395, 9), serviceIntervalMonths: 12 } }), // ~30 days overdue
      tx.equipment.create({ data: { organizationId, customerId: vega.id, equipmentType: "ac", make: "Trane", model: "XR14", serialNumber: "SAMPLE-1002", installDate: at(-1800, 9), lastServicedAt: at(-90, 9), serviceIntervalMonths: 12 } }), // not due
      tx.equipment.create({ data: { organizationId, customerId: dell.id, equipmentType: "boiler", make: "Lochinvar", model: "KBN-285", serialNumber: "SAMPLE-2001", installDate: at(-1200, 9), lastServicedAt: at(-165, 9), serviceIntervalMonths: 6 } }), // due in ~2-3 weeks
      tx.equipment.create({ data: { organizationId, customerId: sunrise.id, equipmentType: "rtu", make: "Lennox", model: "LGH072", serialNumber: "SAMPLE-3001", installDate: at(-900, 9), lastServicedAt: at(-45, 9), serviceIntervalMonths: 3 } }), // not due
    ])

    const job = (data: {
      customerId: string
      technicianId?: string
      equipmentId?: string
      status: string
      priority?: string
      scheduledAt: Date
      symptomSummary: string
      equipmentType: string
      serviceType?: string
      completedAt?: Date
      summary?: string
      actionsTaken?: string
    }) => tx.job.create({ data: { organizationId, priority: "normal", serviceType: "repair", ...data } })

    const jobs = await Promise.all([
      job({ customerId: vega.id, technicianId: ray.id, equipmentId: vegaFurnace.id, status: "completed", scheduledAt: at(-9, 9), completedAt: at(-9, 11), symptomSummary: "Furnace short cycling", equipmentType: "furnace", summary: "Replaced flame sensor and cleaned burners. System running normally.", actionsTaken: "Replaced flame sensor; cleaned burners; verified gas pressure." }),
      job({ customerId: dell.id, technicianId: ana.id, equipmentId: dellBoiler.id, status: "completed", scheduledAt: at(-5, 13), completedAt: at(-5, 15), symptomSummary: "Boiler not maintaining pressure", equipmentType: "boiler", serviceType: "maintenance", summary: "Bled system and replaced expansion tank. Pressure stable.", actionsTaken: "Replaced expansion tank; bled radiators." }),
      job({ customerId: trellis.id, technicianId: jesse.id, status: "completed", scheduledAt: at(-2, 10), completedAt: at(-2, 12), symptomSummary: "Annual heat pump tune-up", equipmentType: "heat-pump", serviceType: "maintenance", summary: "Routine maintenance completed. No issues found." }),
      job({ customerId: vega.id, technicianId: ray.id, equipmentId: vegaAc.id, status: "in_progress", priority: "high", scheduledAt: at(0, new Date().getHours() > 9 ? 9 : 10), symptomSummary: "AC blowing warm air", equipmentType: "ac" }),
      job({ customerId: sunrise.id, technicianId: ana.id, equipmentId: sunriseRtu.id, status: "en_route", scheduledAt: at(0, 14), symptomSummary: "Rooftop unit making grinding noise", equipmentType: "rtu" }),
      job({ customerId: pine.id, technicianId: ray.id, status: "scheduled", scheduledAt: at(1, 9), symptomSummary: "Furnace tune-up before winter", equipmentType: "furnace", serviceType: "maintenance" }),
      job({ customerId: dell.id, technicianId: jesse.id, status: "scheduled", priority: "high", scheduledAt: at(2, 11), symptomSummary: "No heat in unit 4B", equipmentType: "furnace" }),
      job({ customerId: trellis.id, status: "pending", priority: "urgent", scheduledAt: at(0, 16), symptomSummary: "AC completely down, tenant complaint", equipmentType: "ac" }),
      job({ customerId: pine.id, status: "cancelled", scheduledAt: at(-1, 15), symptomSummary: "Thermostat replacement (customer rescheduled)", equipmentType: "thermostat", serviceType: "installation" }),
    ])

    const [j1, j2, j3] = jobs
    await Promise.all([
      tx.invoice.create({ data: { organizationId, jobId: j1.id, customerId: vega.id, description: "Furnace repair — flame sensor replacement", amount: 289, status: "paid", issuedDate: at(-9, 12), dueDate: at(5, 12) } }),
      tx.invoice.create({ data: { organizationId, jobId: j2.id, customerId: dell.id, description: "Boiler service — expansion tank replacement", amount: 645, status: "pending", issuedDate: at(-5, 16), dueDate: at(9, 12) } }),
      tx.invoice.create({ data: { organizationId, jobId: j3.id, customerId: trellis.id, description: "Heat pump annual maintenance", amount: 179, status: "overdue", issuedDate: at(-40, 12), dueDate: at(-10, 12) } }),
    ])

    // Compliance log entries on the completed jobs — the audit log is a headline
    // feature on the landing page, so it shouldn't be empty in a fresh sandbox.
    await Promise.all([
      tx.complianceLog.create({ data: { jobId: j1.id, type: "safety_ack", payload: { items: ["Gas shutoff verified before repair", "CO detector tested before leaving"] }, createdAt: at(-9, 11) } }),
      tx.complianceLog.create({ data: { jobId: j2.id, type: "code_reminder", payload: { codes: ["IMC 306.1 — equipment access clearance confirmed"] }, createdAt: at(-5, 15) } }),
      tx.complianceLog.create({ data: { jobId: j3.id, type: "epa608_prompt", payload: { refrigerantType: "R-410A", lbsRecovered: 0.3, certLevel: "Type I" }, createdAt: at(-2, 12) } }),
    ])

    const convo = async (subject: string, channel: string, messages: { sender: string; senderRole: string; content: string; minutesAgo: number }[]) => {
      const c = await tx.conversation.create({
        data: { ...org, subject, channel, participants: ["Dispatch", messages[0].sender], unreadCount: 1, lastMessageAt: new Date(Date.now() - messages[messages.length - 1].minutesAgo * 60_000) },
      })
      await tx.message.createMany({
        data: messages.map((m) => ({ conversationId: c.id, sender: m.sender, senderRole: m.senderRole, content: m.content, createdAt: new Date(Date.now() - m.minutesAgo * 60_000) })),
      })
    }
    await convo("Trellis — AC down", "internal", [
      { sender: "Dispatch", senderRole: "dispatch", content: "Tenant reports no cooling at 77 Trellis Way. Who can take this today?", minutesAgo: 95 },
      { sender: "Ray Okafor", senderRole: "technician", content: "I can swing by after the Vega job. ETA around 4pm.", minutesAgo: 80 },
    ])
    await convo("Sunrise Office Park — access", "internal", [
      { sender: "Ana Duarte", senderRole: "technician", content: "Building security needs 30 minutes notice before I go up to the roof.", minutesAgo: 45 },
    ])
  })
}

export class SandboxNotActiveError extends Error {
  constructor() {
    super("This account is not in sandbox mode")
  }
}

/**
 * One-way exit: removes the sample data loaded by seedSandboxData() and
 * permanently ends sandbox mode. Only rows tagged isSample are touched.
 * Anything a sample record has since been linked to a real login stays and is
 * simply reclassified as real.
 */
export async function exitSandbox(organizationId: string): Promise<{ customers: number; technicians: number }> {
  return prisma.$transaction(async (tx) => {
    // Atomic claim so a double-click can't run this twice.
    const claimed = await tx.organization.updateMany({
      where: { id: organizationId, sandboxMode: true },
      data: { sandboxMode: false, sandboxEndedAt: new Date() },
    })
    if (claimed.count === 0) throw new SandboxNotActiveError()

    await tx.conversation.deleteMany({ where: { organizationId, isSample: true } })
    await tx.vehicle.deleteMany({ where: { organizationId, isSample: true } })

    // Deleting customers cascades to their jobs, invoices, estimates,
    // equipment, plans, reviews and compliance logs.
    const customers = await tx.customer.deleteMany({ where: { organizationId, isSample: true, user: null } })
    const technicians = await tx.technician.deleteMany({ where: { organizationId, isSample: true, user: null } })

    // Anything sample that gained a real login is now real.
    await tx.customer.updateMany({ where: { organizationId, isSample: true }, data: { isSample: false } })
    await tx.technician.updateMany({ where: { organizationId, isSample: true }, data: { isSample: false } })

    return { customers: customers.count, technicians: technicians.count }
  })
}
