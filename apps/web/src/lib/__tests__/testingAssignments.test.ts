import { describe, expect, it } from "vitest"

import {
  getAssignmentActions,
  getAssignmentOutcome,
  getAssignmentStatus,
  isAssignmentActive,
  matchesInventoryStatus,
  type AssignmentState,
} from "../testingAssignments"

const assignment = (
  overrides: Partial<AssignmentState> = {},
): AssignmentState => ({
  completed_at: null,
  closed_at: null,
  outcome: null,
  ...overrides,
})

/** Closing always sets both halves; the database constrains them together. */
const closed = (
  outcome: "returned" | "consumed",
  overrides: Partial<AssignmentState> = {},
): AssignmentState =>
  assignment({
    closed_at: "2026-08-02T00:00:00Z",
    outcome,
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

  it("is closed once closed, whether or not it was completed", () => {
    expect(getAssignmentStatus(closed("returned"))).toBe("closed")

    expect(
      getAssignmentStatus(
        closed("returned", { completed_at: "2026-08-01T00:00:00Z" }),
      ),
    ).toBe("closed")
  })

  it("is closed for a consumed bag as much as a returned one", () => {
    expect(
      getAssignmentStatus(
        closed("consumed", { completed_at: "2026-08-01T00:00:00Z" }),
      ),
    ).toBe("closed")
  })

  it("treats anything not closed as active", () => {
    expect(isAssignmentActive(assignment())).toBe(true)
    expect(
      isAssignmentActive(assignment({ completed_at: "2026-08-01T00:00:00Z" })),
    ).toBe(true)
    expect(isAssignmentActive(closed("returned"))).toBe(false)
    expect(isAssignmentActive(closed("consumed"))).toBe(false)
  })
})

describe("getAssignmentOutcome", () => {
  it("is null while the assignment is open", () => {
    expect(getAssignmentOutcome(assignment())).toBe(null)
  })

  it("reports how a closed assignment ended", () => {
    expect(getAssignmentOutcome(closed("returned"))).toBe("returned")
    expect(getAssignmentOutcome(closed("consumed"))).toBe("consumed")
  })

  it("rejects an outcome the database would not have written", () => {
    expect(getAssignmentOutcome(assignment({ outcome: "nonsense" }))).toBe(null)
  })
})

describe("matchesInventoryStatus", () => {
  const pending = assignment()
  const completed = assignment({ completed_at: "2026-08-01T00:00:00Z" })
  const returned = closed("returned", {
    completed_at: "2026-08-01T00:00:00Z",
  })
  const consumed = closed("consumed", {
    completed_at: "2026-08-01T00:00:00Z",
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

  it("excludes closed assignments from every list, however they closed", () => {
    for (const closedAssignment of [returned, consumed]) {
      expect(matchesInventoryStatus(closedAssignment, "pending")).toBe(false)
      expect(matchesInventoryStatus(closedAssignment, "completed")).toBe(false)
      expect(matchesInventoryStatus(closedAssignment, "any")).toBe(false)
    }
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

  it("keeps custody actions available after work closes while seed remains held", () => {
    const actions = getAssignmentActions(
      closed("returned", { completed_at: "2026-08-01T00:00:00Z" }),
      {
        hasVisibleSubBatch: true,
        hasReturnableSeed: true,
      },
    )

    expect(actions).toEqual({
      canTest: true,
      canReturn: true,
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
