import { describe, expect, it } from "vitest"

import { resolveSendingWeight } from "../sendingWeight"

describe("resolveSendingWeight", () => {
  it("sends the whole bag when the field is left alone", () => {
    expect(resolveSendingWeight("", 100)).toEqual({ kind: "whole", grams: 100 })
    expect(resolveSendingWeight(undefined, 100)).toEqual({
      kind: "whole",
      grams: 100,
    })
  })

  it("treats whitespace as untouched rather than as nonsense", () => {
    expect(resolveSendingWeight("   ", 100)).toEqual({
      kind: "whole",
      grams: 100,
    })
  })

  it("sends a sample when less than the bag is asked for", () => {
    expect(resolveSendingWeight("25", 100)).toEqual({
      kind: "sample",
      grams: 25,
    })
  })

  it("accepts fractional grams", () => {
    expect(resolveSendingWeight("0.5", 100)).toEqual({
      kind: "sample",
      grams: 0.5,
    })
  })

  it("treats the bag's exact weight as sending the whole bag", () => {
    // Not an error: the database wants a sample strictly lighter than its
    // source, but that is about how a split is expressed, not the user's
    // problem to solve.
    expect(resolveSendingWeight("100", 100)).toEqual({
      kind: "whole",
      grams: 100,
    })
  })

  it("rejects more than the bag holds", () => {
    expect(resolveSendingWeight("101", 100)).toEqual({
      kind: "invalid",
      grams: 100,
    })
  })

  it("rejects zero and negatives", () => {
    expect(resolveSendingWeight("0", 100).kind).toBe("invalid")
    expect(resolveSendingWeight("-5", 100).kind).toBe("invalid")
  })

  it("rejects text and half-typed numbers that parse to nothing", () => {
    expect(resolveSendingWeight("abc", 100).kind).toBe("invalid")
    expect(resolveSendingWeight("-", 100).kind).toBe("invalid")
  })

  it("reports invalid for a bag with no weight, whatever was typed", () => {
    expect(resolveSendingWeight("", 0)).toEqual({ kind: "invalid", grams: 0 })
    expect(resolveSendingWeight("10", 0)).toEqual({ kind: "invalid", grams: 0 })
  })

  it("falls back to the bag's weight on invalid input, for display", () => {
    // The weight column still has something sensible to show while the field
    // is in an unusable state.
    expect(resolveSendingWeight("999", 100).grams).toBe(100)
  })
})
