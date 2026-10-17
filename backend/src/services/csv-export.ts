import Papa from "papaparse"

export type Cell = string | number | boolean | Date | null | undefined

// Excel needs a BOM to read UTF-8 names (accents, curly quotes) correctly.
const BOM = "﻿"

const pad = (n: number) => String(n).padStart(2, "0")
export const isoDate = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
export const isoDateTime = (d: Date) => `${isoDate(d)} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`

function cell(v: Cell): string | number {
  if (v === null || v === undefined) return ""
  if (v instanceof Date) return isoDate(v)
  if (typeof v === "boolean") return v ? "Yes" : "No"
  return v
}

/**
 * Builds a CSV a spreadsheet can open. Customer names, notes and addresses are typed
 * by users, so any text starting with = + - @ would run as a formula when opened in
 * Excel or Sheets; escapeFormulae prefixes those cells so they stay plain text.
 */
export function toCsv(headers: string[], rows: Cell[][]): string {
  const body = Papa.unparse(
    { fields: headers, data: rows.map((r) => r.map(cell)) },
    { newline: "\r\n", escapeFormulae: true },
  )
  return `${BOM}${body}\r\n`
}

/** Same number the customer sees on the invoice PDF. */
export const invoiceNumber = (id: string) => id.slice(-8).toUpperCase()

// ---------- customers ----------

export const CUSTOMER_HEADERS = ["Name", "Phone", "Email", "Address", "Address 2", "City", "State", "ZIP", "Notes", "SMS opt-out", "Email opt-out", "Customer since"]

export interface CustomerExportRow {
  name: string; phone: string; email: string | null; address: string; addressLine2: string | null
  city: string; state: string; postalCode: string; notes: string | null; smsOptOut: boolean; emailOptOut: boolean; createdAt: Date
}

export const customerCells = (c: CustomerExportRow): Cell[] =>
  [c.name, c.phone, c.email, c.address, c.addressLine2, c.city, c.state, c.postalCode, c.notes, c.smsOptOut, c.emailOptOut, c.createdAt]

// ---------- equipment ----------

export const EQUIPMENT_HEADERS = ["Customer", "Type", "Make", "Model", "Serial number", "Installed", "Warranty expires", "Service interval (months)", "Last serviced", "Notes"]

export interface EquipmentExportRow {
  customer: { name: string }; equipmentType: string; make: string | null; model: string | null; serialNumber: string | null
  installDate: Date | null; warrantyExpiry: Date | null; serviceIntervalMonths: number | null; lastServicedAt: Date | null; notes: string | null
}

export const equipmentCells = (e: EquipmentExportRow): Cell[] =>
  [e.customer.name, e.equipmentType, e.make, e.model, e.serialNumber, e.installDate, e.warrantyExpiry, e.serviceIntervalMonths, e.lastServicedAt, e.notes]

// ---------- jobs ----------

export const JOB_HEADERS = ["Job ID", "Scheduled (UTC)", "Customer", "Technician", "Status", "Priority", "Service type", "Equipment", "Problem", "Summary", "Work done", "Parts used", "Completed (UTC)", "Invoiced total"]

export interface JobExportRow {
  id: string; scheduledAt: Date; customer: { name: string }; technician: { name: string } | null; status: string; priority: string
  serviceType: string | null; equipmentType: string | null; symptomSummary: string | null; summary: string | null; actionsTaken: string | null
  partsUsed: string[]; completedAt: Date | null; invoices: Array<{ amount: number }>
}

export const jobCells = (j: JobExportRow): Cell[] => [
  j.id, isoDateTime(j.scheduledAt), j.customer.name, j.technician?.name ?? "", j.status, j.priority, j.serviceType, j.equipmentType,
  j.symptomSummary, j.summary, j.actionsTaken, j.partsUsed.join("; "), j.completedAt ? isoDateTime(j.completedAt) : "",
  j.invoices.length ? Math.round(j.invoices.reduce((s, i) => s + i.amount, 0) * 100) / 100 : "",
]

// ---------- invoices ----------

export const INVOICE_HEADERS = ["Invoice #", "Invoice ID", "Customer", "Issued", "Due", "Description", "Amount", "Status", "Service date", "Service type"]

export interface InvoiceExportRow {
  id: string; customer: { name: string }; issuedDate: Date; dueDate: Date; description: string; amount: number; status: string
  job: { scheduledAt: Date; serviceType: string | null } | null
}

export const invoiceCells = (i: InvoiceExportRow): Cell[] => [
  invoiceNumber(i.id), i.id, i.customer.name, i.issuedDate, i.dueDate, i.description, i.amount, i.status,
  i.job ? i.job.scheduledAt : "", i.job?.serviceType ?? "",
]
