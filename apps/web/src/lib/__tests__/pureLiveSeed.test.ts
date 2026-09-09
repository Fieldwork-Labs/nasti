import { describe, expect, it } from "vitest"

import {
  estimatePureLiveSeedCount,
  readPureLiveSeedStatistics,
} from "../pureLiveSeed"

// 0.005g per seed, 90% of it pure and live. A 100g bag is 20,000 seeds, of
// which 18,000 are pure live seed.
const stats = { tpsu: 0.005, pls: 0.9 }

describe("estimatePureLiveSeedCount", () => {
  it("divides the bag by mean seed weight and takes the live fraction", () => {
    expect(estimatePureLiveSeedCount(100, stats)).toBe(18000)
  })

  it("scales with the bag rather than the batch", () => {
    expect(estimatePureLiveSeedCount(50, stats)).toBe(9000)
    expect(estimatePureLiveSeedCount(200, stats)).toBe(36000)
  })

  it("rounds to whole seeds", () => {
    expect(estimatePureLiveSeedCount(1, { tpsu: 0.003, pls: 0.5 })).toBe(167)
  })

  it("is null when the bag has never been tested", () => {
    expect(estimatePureLiveSeedCount(100, null)).toBe(null)
    expect(estimatePureLiveSeedCount(100, undefined)).toBe(null)
  })

  it("is null when the weight is unknown", () => {
    expect(estimatePureLiveSeedCount(null, stats)).toBe(null)
    expect(estimatePureLiveSeedCount(undefined, stats)).toBe(null)
  })

  it("distinguishes an empty bag from an untested one", () => {
    // Zero seed, tested: genuinely zero live seed.
    expect(estimatePureLiveSeedCount(0, stats)).toBe(0)
    // Seed, untested: unknown, and must not read as zero.
    expect(estimatePureLiveSeedCount(100, null)).toBe(null)
  })

  it("refuses a mean seed weight that would divide the bag infinitely", () => {
    expect(estimatePureLiveSeedCount(100, { tpsu: 0, pls: 0.9 })).toBe(null)
    expect(estimatePureLiveSeedCount(100, { tpsu: -0.005, pls: 0.9 })).toBe(
      null,
    )
  })

  it("returns zero live seed for a test that found none", () => {
    expect(estimatePureLiveSeedCount(100, { tpsu: 0.005, pls: 0 })).toBe(0)
  })

  it("rejects non-finite statistics rather than propagating NaN", () => {
    expect(estimatePureLiveSeedCount(100, { tpsu: NaN, pls: 0.9 })).toBe(null)
    expect(estimatePureLiveSeedCount(100, { tpsu: Infinity, pls: 0.9 })).toBe(
      null,
    )
    expect(estimatePureLiveSeedCount(100, { tpsu: 0.005, pls: NaN })).toBe(null)
  })
})

describe("readPureLiveSeedStatistics", () => {
  it("reads the two ratios it needs and ignores the rest", () => {
    expect(
      readPureLiveSeedStatistics({
        tpsu: 0.005,
        pls: 0.9,
        psu: 0.95,
        vsu: 0.94,
        plsCount: 18000,
        psuCount: 19000,
        standardError: 0.01,
      }),
    ).toEqual({ tpsu: 0.005, pls: 0.9 })
  })

  it("is null for a test whose statistics have not been computed yet", () => {
    expect(readPureLiveSeedStatistics(null)).toBe(null)
    expect(readPureLiveSeedStatistics(undefined)).toBe(null)
  })

  it("is null when either ratio is missing or not a number", () => {
    expect(readPureLiveSeedStatistics({ pls: 0.9 })).toBe(null)
    expect(readPureLiveSeedStatistics({ tpsu: 0.005 })).toBe(null)
    expect(readPureLiveSeedStatistics({ tpsu: "0.005", pls: 0.9 })).toBe(null)
  })

  it("is null for a non-object", () => {
    expect(readPureLiveSeedStatistics("statistics")).toBe(null)
    expect(readPureLiveSeedStatistics(42)).toBe(null)
  })
})
