import { describe, it, expect, vi, beforeEach } from "vitest"
import request from "supertest"
import express from "express"

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    customer: {
      findMany: vi.fn(),
      createMany: vi.fn(),
    },
  },
}))

import { prisma } from "../lib/prisma.js"
import { customersRouter } from "../routes/customers.js"

const mockPrisma = prisma as unknown as {
  customer: {
    findMany: ReturnType<typeof vi.fn>
    createMany: ReturnType<typeof vi.fn>
  }
}

function makeApp(role = "office", organizationId = "org1") {
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    ;(req as express.Request & { user: unknown }).user = {
      id: "user1",
      organizationId,
      role,
    }
    next()
  })
  app.use("/", customersRouter)
  return app
}

beforeEach(() => {
  vi.resetAllMocks()
  mockPrisma.customer.findMany.mockResolvedValue([])
  mockPrisma.customer.createMany.mockResolvedValue({ count: 0 })
})

describe("POST /import/parse", () => {
  it("returns 403 for non-office role", async () => {
    const res = await request(makeApp("technician"))
      .post("/import/parse")
      .attach("file", Buffer.from("name,phone\nAlice,5551234567"), "customers.csv")
    expect(res.status).toBe(403)
  })

  it("returns 400 if no file is attached", async () => {
    const res = await request(makeApp()).post("/import/parse")
    expect(res.status).toBe(400)
  })

  it("returns 400 for an empty file", async () => {
    const res = await request(makeApp())
      .post("/import/parse")
      .attach("file", Buffer.from(""), "customers.csv")
    expect(res.status).toBe(400)
  })

  it("returns 400 when there are no data rows below the header", async () => {
    const res = await request(makeApp())
      .post("/import/parse")
      .attach("file", Buffer.from("name,phone,address,city,state,postalCode"), "customers.csv")
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/no data rows/i)
  })

  it("parses headers and rows, stripping a leading BOM", async () => {
    const csv = "﻿name,phone,address,city,state,postalCode\nAlice Smith,5551234567,123 Main St,Austin,TX,78701\nBob Jones,5559876543,456 Oak Ave,Austin,TX,78702\n"
    const res = await request(makeApp())
      .post("/import/parse")
      .attach("file", Buffer.from(csv), "customers.csv")
    expect(res.status).toBe(200)
    expect(res.body.headers).toEqual(["name", "phone", "address", "city", "state", "postalCode"])
    expect(res.body.rowCount).toBe(2)
    expect(res.body.rows[0]).toEqual(["Alice Smith", "5551234567", "123 Main St", "Austin", "TX", "78701"])
  })

  it("rejects a file over the row limit", async () => {
    const header = "name,phone,address,city,state,postalCode\n"
    const row = "Test Person,5551234567,1 Test St,Austin,TX,78701\n"
    const csv = header + row.repeat(2001)
    const res = await request(makeApp())
      .post("/import/parse")
      .attach("file", Buffer.from(csv), "customers.csv")
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/too many rows/i)
  })
})

const HEADERS = ["Full Name", "Phone Number", "Street", "City", "State", "Zip", "Email", "Notes"]
const MAPPING = {
  name: 0,
  phone: 1,
  address: 2,
  city: 3,
  state: 4,
  postalCode: 5,
  email: 6,
  notes: 7,
}

function row(overrides: Partial<Record<keyof typeof MAPPING, string>> = {}): string[] {
  const base = {
    name: "Alice Smith",
    phone: "555-123-4567",
    address: "123 Main St",
    city: "Austin",
    state: "TX",
    postalCode: "78701",
    email: "alice@example.com",
    notes: "",
  }
  const merged = { ...base, ...overrides }
  const arr = new Array(HEADERS.length).fill("")
  for (const [field, idx] of Object.entries(MAPPING)) {
    arr[idx] = merged[field as keyof typeof merged]
  }
  return arr
}

describe("POST /import/commit", () => {
  it("returns 403 for non-office role", async () => {
    const res = await request(makeApp("technician"))
      .post("/import/commit")
      .send({ headers: HEADERS, rows: [row()], mapping: MAPPING })
    expect(res.status).toBe(403)
  })

  it("returns 400 when a required field isn't mapped", async () => {
    const { postalCode, ...incompleteMapping } = MAPPING
    const res = await request(makeApp())
      .post("/import/commit")
      .send({ headers: HEADERS, rows: [row()], mapping: incompleteMapping })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/postalCode/)
  })

  it("returns 400 when a mapping references a column that doesn't exist", async () => {
    const res = await request(makeApp())
      .post("/import/commit")
      .send({ headers: HEADERS, rows: [row()], mapping: { ...MAPPING, name: 99 } })
    expect(res.status).toBe(400)
  })

  it("creates valid rows and reports the created count", async () => {
    const res = await request(makeApp())
      .post("/import/commit")
      .send({ headers: HEADERS, rows: [row(), row({ name: "Bob Jones", phone: "555-999-0000", email: "bob@example.com" })], mapping: MAPPING })
    expect(res.status).toBe(200)
    expect(res.body.created).toBe(2)
    expect(res.body.skipped).toEqual([])
    const callArgs = mockPrisma.customer.createMany.mock.calls[0][0]
    expect(callArgs.data).toHaveLength(2)
    expect(callArgs.data[0].organizationId).toBe("org1")
    expect(callArgs.data[0].name).toBe("Alice Smith")
  })

  it("skips a row missing a required field and reports why", async () => {
    const res = await request(makeApp())
      .post("/import/commit")
      .send({ headers: HEADERS, rows: [row({ name: "" })], mapping: MAPPING })
    expect(res.status).toBe(200)
    expect(res.body.created).toBe(0)
    expect(res.body.skipped).toHaveLength(1)
    expect(res.body.skipped[0].row).toBe(2)
    expect(res.body.skipped[0].reason).toMatch(/name/i)
  })

  it("skips a row with an invalid email", async () => {
    const res = await request(makeApp())
      .post("/import/commit")
      .send({ headers: HEADERS, rows: [row({ email: "not-an-email" })], mapping: MAPPING })
    expect(res.status).toBe(200)
    expect(res.body.created).toBe(0)
    expect(res.body.skipped[0].reason).toMatch(/email/i)
  })

  it("silently skips a fully blank row without counting it as created or skipped", async () => {
    const blank = new Array(HEADERS.length).fill("")
    const res = await request(makeApp())
      .post("/import/commit")
      .send({ headers: HEADERS, rows: [row(), blank], mapping: MAPPING })
    expect(res.status).toBe(200)
    expect(res.body.created).toBe(1)
    expect(res.body.skipped).toEqual([])
  })

  it("skips a row whose phone number already exists in the database", async () => {
    mockPrisma.customer.findMany.mockResolvedValue([{ phone: "5551234567", email: null }])
    const res = await request(makeApp())
      .post("/import/commit")
      .send({ headers: HEADERS, rows: [row()], mapping: MAPPING })
    expect(res.status).toBe(200)
    expect(res.body.created).toBe(0)
    expect(res.body.skipped[0].reason).toMatch(/already exists/i)
  })

  it("skips a row whose email already exists in the database", async () => {
    mockPrisma.customer.findMany.mockResolvedValue([{ phone: "0000000000", email: "alice@example.com" }])
    const res = await request(makeApp())
      .post("/import/commit")
      .send({ headers: HEADERS, rows: [row({ phone: "555-000-1111" })], mapping: MAPPING })
    expect(res.status).toBe(200)
    expect(res.body.created).toBe(0)
    expect(res.body.skipped[0].reason).toMatch(/already exists/i)
  })

  it("skips the second occurrence of a duplicate phone within the same file", async () => {
    const res = await request(makeApp())
      .post("/import/commit")
      .send({
        headers: HEADERS,
        rows: [row(), row({ name: "Alice Duplicate", email: "alice2@example.com" })],
        mapping: MAPPING,
      })
    expect(res.status).toBe(200)
    expect(res.body.created).toBe(1)
    expect(res.body.skipped).toHaveLength(1)
    expect(res.body.skipped[0].reason).toMatch(/duplicate phone/i)
  })

  it("treats phone numbers with different formatting as the same for duplicate detection", async () => {
    const res = await request(makeApp())
      .post("/import/commit")
      .send({
        headers: HEADERS,
        rows: [row({ phone: "(555) 123-4567" }), row({ name: "Someone Else", phone: "555.123.4567", email: "other@example.com" })],
        mapping: MAPPING,
      })
    expect(res.status).toBe(200)
    expect(res.body.created).toBe(1)
    expect(res.body.skipped).toHaveLength(1)
  })
})
