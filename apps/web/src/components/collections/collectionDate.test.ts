import { describe, expect, it } from "vitest"

import { collectedOnSchema, formatDateInputValue } from "./collectionDate"

describe("collectedOnSchema", () => {
  it("accepts a real ISO calendar date", () => {
    expect(collectedOnSchema.safeParse("2026-07-28").success).toBe(true)
    expect(collectedOnSchema.safeParse("2024-02-29").success).toBe(true)
  })

  it("rejects locale-formatted and impossible dates", () => {
    expect(collectedOnSchema.safeParse("28/07/2026").success).toBe(false)
    expect(collectedOnSchema.safeParse("2026-02-29").success).toBe(false)
    expect(collectedOnSchema.safeParse("2026-13-01").success).toBe(false)
    expect(collectedOnSchema.safeParse("").success).toBe(false)
  })
})

describe("formatDateInputValue", () => {
  it("formats the local calendar date for an HTML date input", () => {
    expect(formatDateInputValue(new Date(2026, 6, 28, 23, 30))).toBe(
      "2026-07-28",
    )
  })
})
