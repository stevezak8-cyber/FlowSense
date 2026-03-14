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
    },
    update: {},
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
