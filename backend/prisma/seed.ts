import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const org = await prisma.organization.upsert({
    where: { slug: "default" },
    create: {
      id: "default-org",
      name: "FlowSense Demo HVAC",
      slug: "default",
    },
    update: {},
  });

  // Hash passwords for demo users
  const officeHash = await bcrypt.hash("office123", 10);
  const techHash = await bcrypt.hash("tech123", 10);
  const customerHash = await bcrypt.hash("customer123", 10);

  // Office admin user
  await prisma.user.upsert({
    where: { email: "office@flowsense.demo" },
    create: {
      email: "office@flowsense.demo",
      name: "Sarah Mitchell",
      passwordHash: officeHash,
      role: "office",
      organizationId: org.id,
    },
    update: { passwordHash: officeHash, role: "office", name: "Sarah Mitchell" },
  });

  // Technician user
  await prisma.user.upsert({
    where: { email: "tech@flowsense.demo" },
    create: {
      email: "tech@flowsense.demo",
      name: "Jordan Smith",
      passwordHash: techHash,
      role: "technician",
      organizationId: org.id,
    },
    update: { passwordHash: techHash, role: "technician", name: "Jordan Smith" },
  });

  // Customer user
  await prisma.user.upsert({
    where: { email: "customer@flowsense.demo" },
    create: {
      email: "customer@flowsense.demo",
      name: "Alex Johnson",
      passwordHash: customerHash,
      role: "customer",
      organizationId: org.id,
    },
    update: { passwordHash: customerHash, role: "customer", name: "Alex Johnson" },
  });

  // Keep the old admin user (update with office role + password)
  await prisma.user.upsert({
    where: { email: "admin@flowsense.demo" },
    create: {
      email: "admin@flowsense.demo",
      name: "Demo Admin",
      passwordHash: officeHash,
      role: "office",
      organizationId: org.id,
    },
    update: { passwordHash: officeHash, role: "office" },
  });

  const tech = await prisma.technician.upsert({
    where: { id: "seed-tech-1" },
    create: {
      id: "seed-tech-1",
      organizationId: org.id,
      name: "Jordan Smith",
      email: "jordan@flowsense.demo",
      phone: "+15551234567",
      epa608Level: "Universal",
      skills: ["furnace", "ac", "heat-pump"],
    },
    update: {},
  });

  await prisma.vehicle.upsert({
    where: { id: "seed-vehicle-1" },
    create: {
      id: "seed-vehicle-1",
      organizationId: org.id,
      technicianId: tech.id,
      name: "Truck 1",
    },
    update: {},
  });

  const customer = await prisma.customer.upsert({
    where: { id: "seed-customer-1" },
    create: {
      id: "seed-customer-1",
      organizationId: org.id,
      name: "Acme Residence",
      phone: "+15559876543",
      address: "123 Main St",
      city: "Denver",
      state: "CO",
      postalCode: "80202",
    },
    update: {},
  });

  await prisma.job.upsert({
    where: { id: "default-job-1" },
    create: {
      id: "default-job-1",
      organizationId: org.id,
      customerId: customer.id,
      technicianId: tech.id,
      status: "scheduled",
      scheduledAt: new Date(Date.now() + 86400000),
      symptomSummary: "No heat, furnace not igniting",
      equipmentType: "furnace",
      priority: "high",
      preArrivalNotes:
        "Customer reports furnace not igniting. Check hot surface igniter and flame sensor first — these are the most common failure points. If igniter glows but no flame, inspect gas valve and pressure. Unit is high priority, likely a no-heat emergency.",
      suggestedParts: ["Hot surface igniter", "Flame sensor", "Gas valve"],
      suggestedTools: ["Multimeter", "Combustion analyzer", "Manometer"],
      riskFlags: ["Gas appliance — verify gas shutoff location before service"],
    },
    update: {
      preArrivalNotes:
        "Customer reports furnace not igniting. Check hot surface igniter and flame sensor first — these are the most common failure points. If igniter glows but no flame, inspect gas valve and pressure. Unit is high priority, likely a no-heat emergency.",
      suggestedParts: ["Hot surface igniter", "Flame sensor", "Gas valve"],
      suggestedTools: ["Multimeter", "Combustion analyzer", "Manometer"],
      riskFlags: ["Gas appliance — verify gas shutoff location before service"],
    },
  });

  await prisma.job.upsert({
    where: { id: "default-job-2" },
    create: {
      id: "default-job-2",
      organizationId: org.id,
      customerId: customer.id,
      technicianId: tech.id,
      status: "completed",
      scheduledAt: new Date(Date.now() - 7 * 86400000),
      completedAt: new Date(Date.now() - 7 * 86400000 + 3600000),
      symptomSummary: "AC not cooling, warm air from vents",
      equipmentType: "central-ac",
      serviceType: "repair",
      priority: "normal",
      actionsTaken:
        "Inspected outdoor unit. Found run capacitor bulging and reading low. Replaced capacitor and tested system. Verified proper cooling across all vents.",
      partsUsed: ["Run capacitor 45/5 MFD 440V"],
      summary:
        "Diagnosed and repaired a Central AC system that was blowing warm air. The run capacitor had failed and was replaced with a 45/5 MFD 440V unit. System tested and confirmed cooling properly across all zones.",
    },
    update: {
      summary:
        "Diagnosed and repaired a Central AC system that was blowing warm air. The run capacitor had failed and was replaced with a 45/5 MFD 440V unit. System tested and confirmed cooling properly across all zones.",
      actionsTaken:
        "Inspected outdoor unit. Found run capacitor bulging and reading low. Replaced capacitor and tested system. Verified proper cooling across all vents.",
      partsUsed: ["Run capacitor 45/5 MFD 440V"],
    },
  });

  // Additional technicians
  await prisma.technician.upsert({
    where: { id: "seed-tech-2" },
    create: {
      id: "seed-tech-2",
      organizationId: org.id,
      name: "Maria Garcia",
      email: "maria@flowsense.demo",
      phone: "+15552345678",
      epa608Level: "Type I",
      skills: ["ac", "heat-pump"],
    },
    update: {},
  });

  await prisma.technician.upsert({
    where: { id: "seed-tech-3" },
    create: {
      id: "seed-tech-3",
      organizationId: org.id,
      name: "Tyler Brooks",
      email: "tyler@flowsense.demo",
      phone: "+15553456789",
      epa608Level: "Type II",
      skills: ["furnace"],
    },
    update: {},
  });

  // Vehicles for tech-2 and tech-3
  await prisma.vehicle.upsert({
    where: { id: "seed-vehicle-2" },
    create: {
      id: "seed-vehicle-2",
      organizationId: org.id,
      technicianId: "seed-tech-2",
      name: "Van 2",
    },
    update: {},
  });

  await prisma.vehicle.upsert({
    where: { id: "seed-vehicle-3" },
    create: {
      id: "seed-vehicle-3",
      organizationId: org.id,
      technicianId: "seed-tech-3",
      name: "Van 3",
    },
    update: {},
  });

  // Additional customers
  await prisma.customer.upsert({
    where: { id: "seed-customer-2" },
    create: {
      id: "seed-customer-2",
      organizationId: org.id,
      name: "Sunrise Office Park",
      phone: "+15554567890",
      email: "mgr@sunriseoffice.demo",
      address: "456 Commerce Blvd",
      city: "Boulder",
      state: "CO",
      postalCode: "80301",
    },
    update: {},
  });

  await prisma.customer.upsert({
    where: { id: "seed-customer-3" },
    create: {
      id: "seed-customer-3",
      organizationId: org.id,
      name: "Pine Valley HOA",
      phone: "+15555678901",
      address: "789 Pine Ridge Dr",
      city: "Lakewood",
      state: "CO",
      postalCode: "80226",
      notes: "Gate code 4821, contact property manager first",
    },
    update: {},
  });

  // Dispatch demo job (after seed-customer-2 is created)
  await prisma.job.upsert({
    where: { id: "seed-job-dispatch-demo" },
    create: {
      id: "seed-job-dispatch-demo",
      organizationId: org.id,
      customerId: "seed-customer-2",
      technicianId: "seed-tech-2",
      status: "scheduled",
      scheduledAt: new Date(new Date().setHours(8, 0, 0, 0)),
      symptomSummary: "AC unit making noise during operation",
      equipmentType: "ac",
      priority: "normal",
    },
    update: {},
  });

  // Link technician user to Technician record
  await prisma.user.update({
    where: { email: "tech@flowsense.demo" },
    data: { technicianId: "seed-tech-1" },
  });

  // Link customer user to Customer record
  await prisma.user.update({
    where: { email: "customer@flowsense.demo" },
    data: { customerId: "seed-customer-1" },
  });

  // --- Invoices with realistic amounts ---
  // AC repair job (default-job-2): repair base $95 + 1.5hrs labor = $95 + $47.50 = $142.50
  await prisma.invoice.upsert({
    where: { id: "seed-invoice-1" },
    create: {
      id: "seed-invoice-1",
      organizationId: org.id,
      jobId: "default-job-2",
      customerId: customer.id,
      description: "AC repair — run capacitor replacement",
      amount: 142.50,
      status: "paid",
      issuedDate: new Date(Date.now() - 7 * 86400000 + 3600000),
      dueDate: new Date(Date.now() - 7 * 86400000 + 3600000 + 30 * 86400000),
    },
    update: { amount: 142.50, status: "paid" },
  });

  // Scheduled furnace job (default-job-1): pending invoice, repair base $95
  await prisma.invoice.upsert({
    where: { id: "seed-invoice-2" },
    create: {
      id: "seed-invoice-2",
      organizationId: org.id,
      jobId: "default-job-1",
      customerId: customer.id,
      description: "Furnace repair — estimated",
      amount: 95.00,
      status: "pending",
      issuedDate: new Date(),
      dueDate: new Date(Date.now() + 30 * 86400000),
    },
    update: { amount: 95.00 },
  });

  // AC noise job (seed-job-dispatch-demo): pending, maintenance base $79
  await prisma.invoice.upsert({
    where: { id: "seed-invoice-3" },
    create: {
      id: "seed-invoice-3",
      organizationId: org.id,
      jobId: "seed-job-dispatch-demo",
      customerId: "seed-customer-2",
      description: "AC inspection — noise diagnosis",
      amount: 79.00,
      status: "pending",
      issuedDate: new Date(),
      dueDate: new Date(Date.now() + 30 * 86400000),
    },
    update: { amount: 79.00 },
  });

  // --- Seed conversations so Messages tab isn't empty ---
  const officeUser = await prisma.user.findUnique({
    where: { email: "office@flowsense.demo" },
    select: { id: true, name: true },
  });
  const techUser = await prisma.user.findUnique({
    where: { email: "tech@flowsense.demo" },
    select: { id: true, name: true },
  });

  if (officeUser && techUser) {
    await prisma.conversation.upsert({
      where: { id: "seed-conv-1" },
      create: {
        id: "seed-conv-1",
        organizationId: org.id,
        subject: "Furnace job #default-job-1 — parts update",
        channel: "internal",
        participants: [officeUser.id, techUser.id],
        unreadCount: 1,
        lastMessageAt: new Date(Date.now() - 30 * 60000),
        messages: {
          create: [
            {
              sender: officeUser.name,
              senderRole: "dispatch",
              content: "Jordan — hot surface igniter is backordered until tomorrow morning. Can you call the customer and let them know?",
              createdAt: new Date(Date.now() - 45 * 60000),
            },
            {
              sender: techUser.name,
              senderRole: "technician",
              content: "Got it. I'll call them now and see if they want to reschedule or wait it out.",
              createdAt: new Date(Date.now() - 30 * 60000),
            },
          ],
        },
      },
      update: { unreadCount: 1 },
    });

    await prisma.conversation.upsert({
      where: { id: "seed-conv-2" },
      create: {
        id: "seed-conv-2",
        organizationId: org.id,
        subject: "AC job at Sunrise Office Park — access instructions",
        channel: "internal",
        participants: [officeUser.id, techUser.id],
        unreadCount: 0,
        lastMessageAt: new Date(Date.now() - 2 * 3600000),
        messages: {
          create: [
            {
              sender: officeUser.name,
              senderRole: "dispatch",
              content: "For the Sunrise job — check in at the front desk first, ask for Marcus. Rooftop unit is accessed from the east stairwell.",
              createdAt: new Date(Date.now() - 2 * 3600000),
            },
          ],
        },
      },
      update: {},
    });
  }

  console.log("Seed complete!");
  console.log("Login credentials:");
  console.log("  Office:     office@flowsense.demo / office123");
  console.log("  Technician: tech@flowsense.demo / tech123");
  console.log("  Customer:   customer@flowsense.demo / customer123");
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
