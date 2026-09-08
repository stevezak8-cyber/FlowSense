import { Router } from "express";
import multer, { MulterError } from "multer";
import Papa from "papaparse";
import { prisma } from "../lib/prisma.js";
import { z } from "zod";

export const customersRouter = Router();

const createCustomerSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().min(1),
  address: z.string().min(1),
  addressLine2: z.string().optional(),
  city: z.string().min(1),
  state: z.string().min(1),
  postalCode: z.string().min(1),
  notes: z.string().optional(),
});

const updateCustomerSchema = createCustomerSchema.partial();

// --- Bulk CSV import ---

const IMPORTABLE_FIELDS = [
  "name", "phone", "address", "addressLine2", "city", "state", "postalCode", "email", "notes",
] as const;
type ImportableField = (typeof IMPORTABLE_FIELDS)[number];
const REQUIRED_IMPORT_FIELDS: ImportableField[] = ["name", "phone", "address", "city", "state", "postalCode"];
const MAX_IMPORT_ROWS = 2000;

const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

function normalizePhone(phone: string | null | undefined): string {
  return (phone ?? "").replace(/\D/g, "");
}

customersRouter.get("/", async (req, res) => {
  // Customers should not browse the full customer list
  if (req.user!.role === "customer") {
    return res.status(403).json({ error: "Forbidden" });
  }
  try {
    const q = (req.query.q as string)?.trim();
    const customers = await prisma.customer.findMany({
      where: {
        organizationId: req.user!.organizationId,
        ...(q && {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { phone: { contains: q } },
            { address: { contains: q, mode: "insensitive" } },
          ],
        }),
      },
      orderBy: { name: "asc" },
      take: 100,
    });
    res.json(customers);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Failed to list customers" });
  }
});

// POST /api/customers/import/parse — upload a CSV, get back headers + rows for column mapping
customersRouter.post(
  "/import/parse",
  (req, res, next) => {
    if (req.user!.role !== "office") return res.status(403).json({ error: "Forbidden" });
    importUpload.single("file")(req, res, (err) => {
      if (err instanceof MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({ error: "File too large — maximum 5MB" });
        }
        return res.status(400).json({ error: err.message });
      }
      if (err) return next(err);
      next();
    });
  },
  (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    let text: string;
    try {
      text = req.file.buffer.toString("utf-8").replace(/^﻿/, ""); // strip BOM if present
    } catch {
      return res.status(400).json({ error: "Could not read file — make sure it's a plain CSV" });
    }

    const result = Papa.parse<string[]>(text, { skipEmptyLines: true });
    const rows = result.data;

    if (!rows || rows.length === 0) {
      return res.status(400).json({ error: "The file appears to be empty" });
    }

    const [headerRow, ...dataRows] = rows;
    const headers = headerRow.map((h) => h.trim());

    if (headers.length === 0 || headers.every((h) => !h)) {
      return res.status(400).json({ error: "Couldn't find a header row — make sure the first row has column names" });
    }
    if (dataRows.length === 0) {
      return res.status(400).json({ error: "No data rows found below the header" });
    }
    if (dataRows.length > MAX_IMPORT_ROWS) {
      return res.status(400).json({ error: `Too many rows — this importer supports up to ${MAX_IMPORT_ROWS} customers per file` });
    }

    res.json({ headers, rows: dataRows, rowCount: dataRows.length });
  }
);

const importCommitSchema = z.object({
  headers: z.array(z.string()),
  rows: z.array(z.array(z.string())),
  mapping: z.record(z.number().int().nonnegative()),
});

// POST /api/customers/import/commit — apply a confirmed column mapping and bulk-create customers
customersRouter.post("/import/commit", async (req, res) => {
  if (req.user!.role !== "office") return res.status(403).json({ error: "Forbidden" });

  const parsed = importCommitSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { headers, rows, mapping } = parsed.data;

  if (rows.length === 0) {
    return res.status(400).json({ error: "No rows to import" });
  }
  if (rows.length > MAX_IMPORT_ROWS) {
    return res.status(400).json({ error: `Too many rows — this importer supports up to ${MAX_IMPORT_ROWS} customers per file` });
  }

  const missingRequired = REQUIRED_IMPORT_FIELDS.filter((f) => mapping[f] === undefined);
  if (missingRequired.length > 0) {
    return res.status(400).json({ error: `Missing column mapping for required field(s): ${missingRequired.join(", ")}` });
  }
  for (const [field, idx] of Object.entries(mapping)) {
    if (!(IMPORTABLE_FIELDS as readonly string[]).includes(field)) {
      return res.status(400).json({ error: `Unknown field in mapping: ${field}` });
    }
    if (idx < 0 || idx >= headers.length) {
      return res.status(400).json({ error: `Mapping for "${field}" references a column that doesn't exist` });
    }
  }

  const organizationId = req.user!.organizationId;

  const existing = await prisma.customer.findMany({
    where: { organizationId },
    select: { phone: true, email: true },
  });
  const existingPhones = new Set(existing.map((c) => normalizePhone(c.phone)).filter(Boolean));
  const existingEmails = new Set(
    existing.map((c) => c.email?.toLowerCase()).filter((e): e is string => !!e)
  );
  const seenPhonesInFile = new Set<string>();
  const seenEmailsInFile = new Set<string>();

  const skipped: { row: number; reason: string }[] = [];
  const toCreate: z.infer<typeof createCustomerSchema>[] = [];

  rows.forEach((row, i) => {
    const rowNumber = i + 2; // +1 for header row, +1 for 1-indexing — matches the row number in a spreadsheet

    const get = (field: ImportableField): string | undefined => {
      const idx = mapping[field];
      if (idx === undefined) return undefined;
      return row[idx]?.trim() || undefined;
    };

    const candidate = {
      name: get("name"),
      phone: get("phone"),
      address: get("address"),
      addressLine2: get("addressLine2"),
      city: get("city"),
      state: get("state"),
      postalCode: get("postalCode"),
      email: get("email"),
      notes: get("notes"),
    };

    // Silently skip fully blank rows (trailing blank lines are common in spreadsheet exports)
    if (Object.values(candidate).every((v) => !v)) return;

    const rowValidation = createCustomerSchema.safeParse(candidate);
    if (!rowValidation.success) {
      const issue = rowValidation.error.errors[0];
      skipped.push({ row: rowNumber, reason: issue ? `${issue.path.join(".")}: ${issue.message}` : "Invalid data" });
      return;
    }

    const data = rowValidation.data;
    const normalizedPhone = normalizePhone(data.phone);
    const normalizedEmail = data.email?.toLowerCase();

    if (normalizedPhone && existingPhones.has(normalizedPhone)) {
      return skipped.push({ row: rowNumber, reason: "A customer with this phone number already exists" });
    }
    if (normalizedEmail && existingEmails.has(normalizedEmail)) {
      return skipped.push({ row: rowNumber, reason: "A customer with this email already exists" });
    }
    if (normalizedPhone && seenPhonesInFile.has(normalizedPhone)) {
      return skipped.push({ row: rowNumber, reason: "Duplicate phone number within this file" });
    }
    if (normalizedEmail && seenEmailsInFile.has(normalizedEmail)) {
      return skipped.push({ row: rowNumber, reason: "Duplicate email within this file" });
    }

    if (normalizedPhone) seenPhonesInFile.add(normalizedPhone);
    if (normalizedEmail) seenEmailsInFile.add(normalizedEmail);
    toCreate.push(data);
  });

  if (toCreate.length === 0) {
    return res.json({ created: 0, skipped });
  }

  try {
    await prisma.customer.createMany({
      data: toCreate.map((c) => ({ organizationId, ...c })),
    });
    res.json({ created: toCreate.length, skipped });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Failed to import customers" });
  }
});

// --- Customer self-service routes (must come before /:id) ---

const CUSTOMER_SELF_SELECT = {
  id: true,
  name: true,
  phone: true,
  email: true,
  address: true,
  smsOptOut: true,
  emailOptOut: true,
};

customersRouter.get("/me", async (req, res) => {
  const user = req.user!;
  if (user.role !== "customer" || !user.customerId) {
    return res.status(403).json({ error: "Forbidden" });
  }
  try {
    const customer = await prisma.customer.findUnique({
      where: { id: user.customerId },
      select: CUSTOMER_SELF_SELECT,
    });
    if (!customer) return res.status(404).json({ error: "Not found" });
    res.json(customer);
  } catch (e) {
    res.status(500).json({ error: "Failed to load profile" });
  }
});

customersRouter.patch("/me", async (req, res) => {
  const user = req.user!;
  if (user.role !== "customer" || !user.customerId) {
    return res.status(403).json({ error: "Forbidden" });
  }
  const { name, phone, email, address, smsOptOut, emailOptOut } = req.body;
  const data: Record<string, unknown> = {};
  if (name !== undefined) data.name = String(name);
  if (phone !== undefined) {
    if (String(phone).trim().length < 10) return res.status(400).json({ error: "Phone must be at least 10 characters" });
    data.phone = String(phone);
  }
  if (email !== undefined) {
    if (!String(email).includes("@")) return res.status(400).json({ error: "Invalid email" });
    data.email = String(email);
  }
  if (address !== undefined) data.address = String(address);
  if (typeof smsOptOut === "boolean") data.smsOptOut = smsOptOut;
  if (typeof emailOptOut === "boolean") data.emailOptOut = emailOptOut;
  try {
    const updated = await prisma.customer.update({
      where: { id: user.customerId },
      data,
      select: CUSTOMER_SELF_SELECT,
    });
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: "Failed to update profile" });
  }
});

customersRouter.get("/me/jobs", async (req, res) => {
  const user = req.user!;
  if (user.role !== "customer" || !user.customerId) {
    return res.status(403).json({ error: "Forbidden" });
  }
  try {
    const jobs = await prisma.job.findMany({
      where: {
        customerId: user.customerId,
        organizationId: user.organizationId,
      },
      select: {
        id: true,
        status: true,
        scheduledAt: true,
        completedAt: true,
        equipmentType: true,
        symptomSummary: true,
        actionsTaken: true,
        technician: { select: { name: true } },
        review: { select: { id: true, rating: true, comment: true, createdAt: true } },
      },
      orderBy: { scheduledAt: "desc" },
    });
    res.json(jobs);
  } catch (e) {
    res.status(500).json({ error: "Failed to load job history" });
  }
});

customersRouter.get("/me/equipment", async (req, res) => {
  const user = req.user!;
  if (user.role !== "customer" || !user.customerId) {
    return res.status(403).json({ error: "Forbidden" });
  }
  try {
    const items = await prisma.equipment.findMany({
      where: {
        customerId: user.customerId,
        organizationId: user.organizationId,
      },
      select: {
        id: true,
        equipmentType: true,
        make: true,
        model: true,
        serialNumber: true,
        installDate: true,
        warrantyExpiry: true,
        serviceIntervalMonths: true,
        lastServicedAt: true,
      },
      orderBy: { createdAt: "asc" },
    });
    res.json(items);
  } catch (e) {
    res.status(500).json({ error: "Failed to load equipment" });
  }
});

customersRouter.get("/me/plans", async (req, res) => {
  if (req.user!.role !== "customer") return res.status(403).json({ error: "Forbidden" })
  const { customerId, organizationId } = req.user!
  const plans = await prisma.maintenancePlan.findMany({
    where: { customerId: customerId!, organizationId, status: "active" },
    include: {
      items: {
        include: { equipment: { select: { make: true, model: true, equipmentType: true } } },
      },
    },
    orderBy: { startDate: "desc" },
  })
  return res.json(plans)
})

customersRouter.get("/:id", async (req, res) => {
  try {
    const customer = await prisma.customer.findFirst({
      where: { id: req.params.id, organizationId: req.user!.organizationId },
      include: { jobs: { take: 20, orderBy: { scheduledAt: "desc" } } },
    });
    if (!customer) return res.status(404).json({ error: "Customer not found" });
    res.json(customer);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Failed to get customer" });
  }
});

customersRouter.post("/", async (req, res) => {
  const parsed = createCustomerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  try {
    const customer = await prisma.customer.create({
      data: {
        organizationId: req.user!.organizationId,
        ...parsed.data,
      },
    });
    res.status(201).json(customer);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Failed to create customer" });
  }
});

customersRouter.delete("/:id", async (req, res) => {
  if (req.user!.role !== "office") {
    return res.status(403).json({ error: "Forbidden" });
  }
  try {
    await prisma.customer.delete({
      where: { id: req.params.id, organizationId: req.user!.organizationId },
    });
    res.status(204).send();
  } catch (e) {
    if ((e as { code?: string })?.code === "P2025") {
      return res.status(404).json({ error: "Customer not found" });
    }
    if ((e as { code?: string })?.code === "P2003") {
      return res.status(409).json({ error: "Cannot delete customer with existing jobs or invoices" });
    }
    res.status(500).json({ error: e instanceof Error ? e.message : "Failed to delete customer" });
  }
});

customersRouter.patch("/:id", async (req, res) => {
  const parsed = updateCustomerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  try {
    const customer = await prisma.customer.update({
      where: { id: req.params.id, organizationId: req.user!.organizationId },
      data: parsed.data,
    });
    res.json(customer);
  } catch (e) {
    if ((e as { code?: string })?.code === "P2025") {
      return res.status(404).json({ error: "Customer not found" });
    }
    res.status(500).json({ error: e instanceof Error ? e.message : "Failed to update customer" });
  }
});
