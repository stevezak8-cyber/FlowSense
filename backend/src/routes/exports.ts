import { Router } from "express"
import type { Response } from "express"
import { z } from "zod"
import { prisma } from "../lib/prisma.js"
import {
  toCsv, isoDate,
  CUSTOMER_HEADERS, customerCells, EQUIPMENT_HEADERS, equipmentCells, JOB_HEADERS, jobCells, INVOICE_HEADERS, invoiceCells,
} from "../services/csv-export.js"

export const exportsRouter = Router()

// Office staff can download their own organization's records. Sandbox sample rows are left out.
// Kept well above any realistic shop, so a runaway query can't build a huge response in memory.
const MAX_ROWS = 50_000

exportsRouter.use((req, res, next) => {
  if (req.user!.role !== "office") return res.status(403).json({ error: "Forbidden" })
  next()
})

const rangeSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

// Dates are inclusive and read as UTC days, matching the dates written into the file.
function parseRange(query: unknown): { gte?: Date; lt?: Date } | null {
  const parsed = rangeSchema.safeParse(query)
  if (!parsed.success) return null
  const { from, to } = parsed.data
  const gte = from ? new Date(`${from}T00:00:00Z`) : undefined
  const lt = to ? new Date(new Date(`${to}T00:00:00Z`).getTime() + 24 * 60 * 60 * 1000) : undefined
  if ((gte && Number.isNaN(gte.getTime())) || (lt && Number.isNaN(lt.getTime()))) return null
  return { ...(gte && { gte }), ...(lt && { lt }) }
}

function sendCsv(res: Response, kind: string, csv: string) {
  res.setHeader("Content-Type", "text/csv; charset=utf-8")
  res.setHeader("Content-Disposition", `attachment; filename="pneuros-${kind}-${isoDate(new Date())}.csv"`)
  res.setHeader("Cache-Control", "no-store")
  res.send(csv)
}

exportsRouter.get("/customers.csv", async (req, res) => {
  try {
    const rows = await prisma.customer.findMany({
      where: { organizationId: req.user!.organizationId, isSample: false },
      orderBy: { name: "asc" },
      take: MAX_ROWS,
    })
    sendCsv(res, "customers", toCsv(CUSTOMER_HEADERS, rows.map(customerCells)))
  } catch {
    res.status(500).json({ error: "Failed to export customers" })
  }
})

exportsRouter.get("/equipment.csv", async (req, res) => {
  try {
    const rows = await prisma.equipment.findMany({
      where: { organizationId: req.user!.organizationId, customer: { isSample: false } },
      include: { customer: { select: { name: true } } },
      orderBy: [{ customer: { name: "asc" } }, { equipmentType: "asc" }],
      take: MAX_ROWS,
    })
    sendCsv(res, "equipment", toCsv(EQUIPMENT_HEADERS, rows.map(equipmentCells)))
  } catch {
    res.status(500).json({ error: "Failed to export equipment" })
  }
})

exportsRouter.get("/jobs.csv", async (req, res) => {
  const range = parseRange(req.query)
  if (!range) return res.status(400).json({ error: "Dates must look like 2026-01-31" })
  try {
    const rows = await prisma.job.findMany({
      where: {
        organizationId: req.user!.organizationId,
        customer: { isSample: false },
        ...(Object.keys(range).length > 0 && { scheduledAt: range }),
      },
      include: { customer: { select: { name: true } }, technician: { select: { name: true } }, invoices: { select: { amount: true } } },
      orderBy: { scheduledAt: "asc" },
      take: MAX_ROWS,
    })
    sendCsv(res, "jobs", toCsv(JOB_HEADERS, rows.map(jobCells)))
  } catch {
    res.status(500).json({ error: "Failed to export jobs" })
  }
})

exportsRouter.get("/invoices.csv", async (req, res) => {
  const range = parseRange(req.query)
  if (!range) return res.status(400).json({ error: "Dates must look like 2026-01-31" })
  try {
    const rows = await prisma.invoice.findMany({
      where: {
        organizationId: req.user!.organizationId,
        customer: { isSample: false },
        ...(Object.keys(range).length > 0 && { issuedDate: range }),
      },
      include: { customer: { select: { name: true } }, job: { select: { scheduledAt: true, serviceType: true } } },
      orderBy: { issuedDate: "asc" },
      take: MAX_ROWS,
    })
    sendCsv(res, "invoices", toCsv(INVOICE_HEADERS, rows.map(invoiceCells)))
  } catch {
    res.status(500).json({ error: "Failed to export invoices" })
  }
})
