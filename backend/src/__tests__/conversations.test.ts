import { describe, it, expect, vi, beforeEach } from "vitest"
import request from "supertest"
import express from "express"

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    conversation: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    message: { create: vi.fn() },
  },
}))
vi.mock("../services/push.js", () => ({ sendPushToUser: vi.fn() }))
vi.mock("twilio", () => ({ default: vi.fn() }))

import { prisma } from "../lib/prisma.js"
import { conversationsRouter } from "../routes/conversations.js"

const mockPrisma = prisma as unknown as {
  conversation: {
    findMany: ReturnType<typeof vi.fn>
    findFirst: ReturnType<typeof vi.fn>
    create: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
  }
  message: { create: ReturnType<typeof vi.fn> }
}

function makeApp(user: { role: string; organizationId: string; customerId?: string | null }) {
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    ;(req as express.Request & { user: unknown }).user = { userId: "u1", ...user }
    next()
  })
  app.use("/", conversationsRouter)
  return app
}

beforeEach(() => vi.clearAllMocks())

describe("GET /api/conversations — role scoping", () => {
  it("office sees the whole org, internal included, no customer filter", async () => {
    mockPrisma.conversation.findMany.mockResolvedValue([])
    await request(makeApp({ role: "office", organizationId: "org-1" })).get("/")
    expect(mockPrisma.conversation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: "org-1" } })
    )
  })

  it("technician sees the whole org too (unchanged, pre-existing behavior)", async () => {
    mockPrisma.conversation.findMany.mockResolvedValue([])
    await request(makeApp({ role: "technician", organizationId: "org-1" })).get("/")
    expect(mockPrisma.conversation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: "org-1" } })
    )
  })

  it("a customer only sees their own conversations, and never internal ones", async () => {
    mockPrisma.conversation.findMany.mockResolvedValue([])
    await request(makeApp({ role: "customer", organizationId: "org-1", customerId: "cust-1" })).get("/")
    expect(mockPrisma.conversation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: "org-1", customerId: "cust-1", channel: { not: "internal" } },
      })
    )
  })

  it("a customer login with no linked customer record sees nothing", async () => {
    mockPrisma.conversation.findMany.mockResolvedValue([])
    await request(makeApp({ role: "customer", organizationId: "org-1", customerId: null })).get("/")
    const where = mockPrisma.conversation.findMany.mock.calls[0][0].where
    expect(where.id).toBe("__none__")
  })
})

describe("GET /api/conversations/:id — role scoping", () => {
  it("404s for a customer requesting another customer's (or an internal) conversation", async () => {
    mockPrisma.conversation.findFirst.mockResolvedValue(null)
    const res = await request(makeApp({ role: "customer", organizationId: "org-1", customerId: "cust-1" })).get(
      "/conv-belonging-to-someone-else"
    )
    expect(res.status).toBe(404)
    expect(mockPrisma.conversation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "conv-belonging-to-someone-else", organizationId: "org-1", customerId: "cust-1", channel: { not: "internal" } },
      })
    )
  })

  it("returns the conversation when it does belong to that customer", async () => {
    mockPrisma.conversation.findFirst.mockResolvedValue({ id: "conv-1", messages: [] })
    mockPrisma.conversation.update.mockResolvedValue({})
    const res = await request(makeApp({ role: "customer", organizationId: "org-1", customerId: "cust-1" })).get("/conv-1")
    expect(res.status).toBe(200)
  })
})

describe("POST /api/conversations — creation is self-scoped for customers", () => {
  it("a customer can't create an internal conversation", async () => {
    const res = await request(makeApp({ role: "customer", organizationId: "org-1", customerId: "cust-1" }))
      .post("/")
      .send({ subject: "Sneaky", channel: "internal", message: "hi", sender: "Marisol" })
    expect(res.status).toBe(403)
    expect(mockPrisma.conversation.create).not.toHaveBeenCalled()
  })

  it("a customer's conversation is always tagged with their own customerId, regardless of what they send", async () => {
    mockPrisma.conversation.create.mockResolvedValue({ id: "conv-1", messages: [] })
    await request(makeApp({ role: "customer", organizationId: "org-1", customerId: "cust-1" }))
      .post("/")
      .send({ subject: "Question", channel: "email", message: "hi", sender: "Marisol", customerId: "someone-elses-id" })
    const data = mockPrisma.conversation.create.mock.calls[0][0].data
    expect(data.customerId).toBe("cust-1")
  })

  it("office can create an internal conversation with no customerId", async () => {
    mockPrisma.conversation.create.mockResolvedValue({ id: "conv-1", messages: [] })
    const res = await request(makeApp({ role: "office", organizationId: "org-1" }))
      .post("/")
      .send({ subject: "Dispatch note", channel: "internal", message: "hi", sender: "Dispatch" })
    expect(res.status).toBe(201)
    const data = mockPrisma.conversation.create.mock.calls[0][0].data
    expect(data.customerId).toBeNull()
  })
})

describe("POST /api/conversations/:id/messages — role scoping", () => {
  it("404s (not 500 or leaked content) if a customer messages into a conversation that isn't theirs", async () => {
    mockPrisma.conversation.findFirst.mockResolvedValue(null)
    const res = await request(makeApp({ role: "customer", organizationId: "org-1", customerId: "cust-1" }))
      .post("/someone-elses-conversation/messages")
      .send({ sender: "Marisol", content: "hi" })
    expect(res.status).toBe(404)
    expect(mockPrisma.message.create).not.toHaveBeenCalled()
  })
})
