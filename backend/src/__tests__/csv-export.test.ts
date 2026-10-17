import { describe, it, expect } from "vitest"
import Papa from "papaparse"
import {
  toCsv, invoiceNumber, isoDate, isoDateTime,
  CUSTOMER_HEADERS, customerCells, JOB_HEADERS, jobCells, INVOICE_HEADERS, invoiceCells, EQUIPMENT_HEADERS, equipmentCells,
} from "../services/csv-export.js"

const parse = (csv: string) => Papa.parse<string[]>(csv.replace(/^﻿/, ""), { skipEmptyLines: true }).data

describe("toCsv", () => {
  it("starts with a BOM, uses CRLF, and puts the headers first", () => {
    const csv = toCsv(["A", "B"], [["x", 1]])
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    expect(csv).toContain("\r\n")
    expect(parse(csv)).toEqual([["A", "B"], ["x", "1"]])
  })

  it("quotes commas, quotes and line breaks so a row stays one row", () => {
    const rows = parse(toCsv(["Notes"], [['Gate code "4471", call first\nthen knock']]))
    expect(rows).toHaveLength(2)
    expect(rows[1][0]).toBe('Gate code "4471", call first\nthen knock')
  })

  it("keeps text that starts like a formula from running when the file is opened", () => {
    const evil = ["=HYPERLINK(\"http://evil\",\"x\")", "+1+1", "-2+3", "@SUM(A1)"]
    const out = parse(toCsv(["Name"], evil.map((v) => [v]))).slice(1).map((r) => r[0])
    for (const cell of out) expect(cell.startsWith("'")).toBe(true)
  })

  it("leaves real numbers alone, including negatives", () => {
    expect(parse(toCsv(["Amount"], [[-12.5], [0], [199]])).slice(1)).toEqual([["-12.5"], ["0"], ["199"]])
  })

  it("writes empty for missing values, dates as plain dates, and booleans as Yes/No", () => {
    const row = parse(toCsv(["a", "b", "c", "d"], [[null, new Date("2026-03-09T23:30:00Z"), true, false]]))[1]
    expect(row).toEqual(["", "2026-03-09", "Yes", "No"])
  })

  it("keeps accented names intact", () => {
    expect(parse(toCsv(["Name"], [["José Muñoz-Zoë"]]))[1][0]).toBe("José Muñoz-Zoë")
  })
})

describe("date and number helpers", () => {
  it("formats in UTC", () => {
    expect(isoDate(new Date("2026-12-31T23:59:00Z"))).toBe("2026-12-31")
    expect(isoDateTime(new Date("2026-01-05T07:05:00Z"))).toBe("2026-01-05 07:05")
  })
  it("uses the same invoice number as the PDF", () => {
    expect(invoiceNumber("cmucxlois0003abcdwxyz1234")).toBe("WXYZ1234")
  })
})

describe("row shapes match their headers", () => {
  const d = new Date("2026-05-01T12:00:00Z")
  it("customers", () => {
    const cells = customerCells({ name: "A", phone: "p", email: null, address: "1 St", addressLine2: null, city: "Austin", state: "TX", postalCode: "78704", notes: null, smsOptOut: false, emailOptOut: true, createdAt: d })
    expect(cells).toHaveLength(CUSTOMER_HEADERS.length)
  })
  it("equipment", () => {
    const cells = equipmentCells({ customer: { name: "A" }, equipmentType: "ac", make: "Trane", model: "XR14", serialNumber: null, installDate: d, warrantyExpiry: null, serviceIntervalMonths: 12, lastServicedAt: d, notes: null })
    expect(cells).toHaveLength(EQUIPMENT_HEADERS.length)
  })
  it("jobs, including a joined parts list and an invoiced total", () => {
    const cells = jobCells({ id: "j1", scheduledAt: d, customer: { name: "A" }, technician: null, status: "completed", priority: "normal", serviceType: "repair", equipmentType: "ac", symptomSummary: "warm air", summary: "done", actionsTaken: "fixed", partsUsed: ["capacitor", "contactor"], completedAt: d, invoices: [{ amount: 100.1 }, { amount: 50.2 }] })
    expect(cells).toHaveLength(JOB_HEADERS.length)
    expect(cells[JOB_HEADERS.indexOf("Parts used")]).toBe("capacitor; contactor")
    expect(cells[JOB_HEADERS.indexOf("Invoiced total")]).toBe(150.3)
    expect(cells[JOB_HEADERS.indexOf("Technician")]).toBe("")
  })
  it("invoices, with the service date blank when there's no job (plan invoices)", () => {
    const withJob = invoiceCells({ id: "abc12345678", customer: { name: "A" }, issuedDate: d, dueDate: d, description: "x", amount: 10, status: "paid", job: { scheduledAt: d, serviceType: "repair" } })
    const noJob = invoiceCells({ id: "abc12345678", customer: { name: "A" }, issuedDate: d, dueDate: d, description: "x", amount: 10, status: "paid", job: null })
    expect(withJob).toHaveLength(INVOICE_HEADERS.length)
    expect(noJob[INVOICE_HEADERS.indexOf("Service date")]).toBe("")
  })
})
