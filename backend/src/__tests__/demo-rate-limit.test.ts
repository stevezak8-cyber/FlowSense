import express from "express"
import request from "supertest"
import { describe, expect, it } from "vitest"
import { createDemoLimiter } from "../middleware/rate-limits.js"

describe("createDemoLimiter", () => {
  it("allows more demo sessions than the password-login limit within one minute", async () => {
    const app = express()
    app.use("/demo", createDemoLimiter())
    app.post("/demo", (_req, res) => res.status(200).json({ ok: true }))

    const responses = await Promise.all(
      Array.from({ length: 21 }, () => request(app).post("/demo"))
    )

    expect(responses.every((response) => response.status === 200)).toBe(true)
  })
})
