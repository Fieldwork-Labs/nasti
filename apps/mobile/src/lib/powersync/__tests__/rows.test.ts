import { describe, expect, it } from "vitest"
import { toMaterialTypes } from "@nasti/common/types"

import { rowToCollection } from "../rows"
import type { PowerSyncCollectionRow } from "../schema"

const row = (overrides: Partial<PowerSyncCollectionRow> = {}) =>
  ({
    id: "collection-1",
    species_uncertain: 1,
    specimen_collected: 1,
    person_ids: null,
    material_type: null,
    ...overrides,
  }) as PowerSyncCollectionRow

describe("rowToCollection material_type", () => {
  it("defaults to an empty array when the column is unset", () => {
    expect(rowToCollection(row()).material_type).toEqual([])
    expect(rowToCollection(row({ material_type: "" })).material_type).toEqual(
      [],
    )
  })

  it("parses the JSON array PowerSync stores for text[] columns", () => {
    const collection = rowToCollection(
      row({ material_type: '["seed","branches_stems"]' }),
    )

    expect(collection.material_type).toEqual(["seed", "branches_stems"])
  })

  it("parses a Postgres array literal", () => {
    expect(
      rowToCollection(row({ material_type: "{seed,capsules_pods_fruit}" }))
        .material_type,
    ).toEqual(["seed", "capsules_pods_fruit"])
    expect(rowToCollection(row({ material_type: "{}" })).material_type).toEqual(
      [],
    )
  })
})

describe("toMaterialTypes", () => {
  it("keeps recognised values and drops everything else", () => {
    expect(
      toMaterialTypes(["seed", "not_a_material", "branches_stems"]),
    ).toEqual(["seed", "branches_stems"])
  })

  it("handles a missing value", () => {
    expect(toMaterialTypes(null)).toEqual([])
    expect(toMaterialTypes(undefined)).toEqual([])
  })
})
