import { describe, it, expect } from "vitest"
import { stripJsonFence } from "../lib/ai-json.js"

describe("stripJsonFence", () => {
  it("strips a ```json ... ``` fence", () => {
    const text = '```json\n[{"name":"a"}]\n```'
    expect(stripJsonFence(text)).toBe('[{"name":"a"}]')
  })

  it("strips a plain ``` ... ``` fence with no language tag", () => {
    const text = '```\n{"a":1}\n```'
    expect(stripJsonFence(text)).toBe('{"a":1}')
  })

  it("leaves unfenced JSON untouched", () => {
    const text = '{"a":1}'
    expect(stripJsonFence(text)).toBe('{"a":1}')
  })

  it("trims surrounding whitespace either way", () => {
    expect(stripJsonFence('  \n{"a":1}\n  ')).toBe('{"a":1}')
    expect(stripJsonFence('  \n```json\n{"a":1}\n```\n  ')).toBe('{"a":1}')
  })

  it("round-trips through JSON.parse on a realistic fenced pricebook response", () => {
    const text = '```json\n[{"name":"AC tune-up","unitPrice":120}]\n```'
    expect(JSON.parse(stripJsonFence(text))).toEqual([{ name: "AC tune-up", unitPrice: 120 }])
  })
})
