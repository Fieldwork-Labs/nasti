import { describe, expect, it } from "vitest"

import {
  formatContainerTotal,
  totalContainerAmounts,
} from "../containerAmounts"

const bucket = { id: "bucket", name: "Bucket" }
const bag = { id: "bag", name: "Bag" }

describe("totalContainerAmounts", () => {
  it("is empty when nothing was recorded", () => {
    expect(totalContainerAmounts([])).toEqual([])
  })

  it("sums the same container across sources", () => {
    expect(
      totalContainerAmounts([
        { amount: 2, container: bucket },
        { amount: 3, container: bucket },
      ]),
    ).toEqual([
      { containerId: "bucket", name: "Bucket", amount: 5, partial: false },
    ])
  })

  it("keeps different containers apart and sorts them by name", () => {
    expect(
      totalContainerAmounts([
        { amount: 1, container: bucket },
        { amount: 4, container: bag },
      ]).map(({ name, amount }) => [name, amount]),
    ).toEqual([
      ["Bag", 4],
      ["Bucket", 1],
    ])
  })

  it("has no amount when no source recorded one", () => {
    expect(
      totalContainerAmounts([
        { amount: null, container: bucket },
        { amount: null, container: bucket },
      ]),
    ).toEqual([
      { containerId: "bucket", name: "Bucket", amount: null, partial: true },
    ])
  })

  it("marks the total partial when only some sources recorded an amount", () => {
    expect(
      totalContainerAmounts([
        { amount: 2, container: bucket },
        { amount: null, container: bucket },
      ]),
    ).toEqual([
      { containerId: "bucket", name: "Bucket", amount: 2, partial: true },
    ])
  })

  it("does not mistake an unspecified amount for zero", () => {
    const [total] = totalContainerAmounts([{ amount: null, container: bucket }])

    expect(total?.amount).toBeNull()
  })
})

describe("formatContainerTotal", () => {
  it("prefixes the amount", () => {
    expect(
      formatContainerTotal({ name: "Bucket", amount: 3, partial: false }),
    ).toBe("3 × Bucket")
  })

  it("says at least when the total is incomplete", () => {
    expect(
      formatContainerTotal({ name: "Bucket", amount: 3, partial: true }),
    ).toBe("3+ × Bucket")
  })

  it("is the bare name when no amount was recorded", () => {
    expect(
      formatContainerTotal({ name: "Bucket", amount: null, partial: true }),
    ).toBe("Bucket")
  })
})
