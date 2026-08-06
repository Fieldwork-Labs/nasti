import { describe, expect, it } from "vitest"

import {
  getAssignmentActions,
  getAssignmentStatus,
  isAssignmentActive,
  matchesInventoryStatus,
  type AssignmentState,
} from "../testingAssignments"

const assignment = (
  overrides: Partial<AssignmentState> = {},
): AssignmentState => ({
  completed_at: null,
  returned_at: null,
  ...overrides,
})

describe("getAssignmentStatus", () => {
  it("is pending while neither completed nor returned", () => {
    expect(getAssignmentStatus(assignment())).toBe("pending")
  })

  it("is completed once a test has been recorded", () => {
    expect(
      getAssignmentStatus(assignment({ completed_at: "2026-08-01T00:00:00Z" })),
    ).toBe("completed")
  })

  it("is returned once returned, whether or not it was completed", () => {
    expect(
      getAssignmentStatus(assignment({ returned_at: "2026-08-02T00:00:00Z" })),
    ).toBe("returned")

    expect(
      getAssignmentStatus(
        assignment({
          completed_at: "2026-08-01T00:00:00Z",
          returned_at: "2026-08-02T00:00:00Z",
        }),
      ),
    ).toBe("returned")
  })

  it("treats anything not returned as active", () => {
    expect(isAssignmentActive(assignment())).toBe(true)
    expect(
      isAssignmentActive(assignment({ completed_at: "2026-08-01T00:00:00Z" })),
    ).toBe(true)
    expect(
      isAssignmentActive(assignment({ returned_at: "2026-08-02T00:00:00Z" })),
    ).toBe(false)
  })
})

describe("matchesInventoryStatus", () => {
  const pending = assignment()
  const completed = assignment({ completed_at: "2026-08-01T00:00:00Z" })
  const returned = assignment({
    completed_at: "2026-08-01T00:00:00Z",
    returned_at: "2026-08-02T00:00:00Z",
  })

  it("puts incomplete active assignments in the pending list only", () => {
    expect(matchesInventoryStatus(pending, "pending")).toBe(true)
    expect(matchesInventoryStatus(pending, "completed")).toBe(false)
    expect(matchesInventoryStatus(pending, "any")).toBe(true)
  })

  it("puts completed active assignments in the completed list only", () => {
    expect(matchesInventoryStatus(completed, "completed")).toBe(true)
    expect(matchesInventoryStatus(completed, "pending")).toBe(false)
    expect(matchesInventoryStatus(completed, "any")).toBe(true)
  })

  it("excludes returned assignments from every list", () => {
    expect(matchesInventoryStatus(returned, "pending")).toBe(false)
    expect(matchesInventoryStatus(returned, "completed")).toBe(false)
    expect(matchesInventoryStatus(returned, "any")).toBe(false)
  })
})

describe("getAssignmentActions", () => {
  it("offers a quality test only when a bag is visible to test", () => {
    expect(
      getAssignmentActions(assignment(), { hasVisibleSubBatch: true }).canTest,
    ).toBe(true)

    expect(
      getAssignmentActions(assignment(), { hasVisibleSubBatch: false }).canTest,
    ).toBe(false)

    expect(getAssignmentActions(assignment()).canTest).toBe(false)
  })

  it("still offers a quality test after the first one completed the assignment", () => {
    expect(
      getAssignmentActions(
        assignment({ completed_at: "2026-08-01T00:00:00Z" }),
        { hasVisibleSubBatch: true },
      ).canTest,
    ).toBe(true)
  })

  it("offers return for any active assignment", () => {
    expect(getAssignmentActions(assignment()).canReturn).toBe(true)
    expect(
      getAssignmentActions(assignment({ completed_at: "2026-08-01T00:00:00Z" }))
        .canReturn,
    ).toBe(true)
  })

  it("leaves a returned assignment with no actions at all", () => {
    const actions = getAssignmentActions(
      assignment({
        completed_at: "2026-08-01T00:00:00Z",
        returned_at: "2026-08-02T00:00:00Z",
      }),
      { hasVisibleSubBatch: true },
    )

    expect(actions).toEqual({
      canTest: false,
      canReturn: false,
      canDelete: false,
    })
  })

  it("never offers delete to a Testing organisation", () => {
    expect(
      getAssignmentActions(assignment(), {
        hasVisibleSubBatch: true,
      }).canDelete,
    ).toBe(false)
  })
})
