import { describe, expect, it } from "vitest"

import {
  getAssignmentActions,
  getAssignmentStatus,
  getRequiredCapabilities,
  isAssignmentActive,
  linkSupportsAssignmentTypes,
  matchesInventoryStatus,
  type AssignmentState,
  type AssignmentType,
  type LinkCapabilities,
} from "../testingAssignments"

const link = (can_test: boolean, can_process: boolean): LinkCapabilities => ({
  can_test,
  can_process,
})

const assignment = (
  overrides: Partial<AssignmentState> = {},
): AssignmentState => ({
  assignment_type: "sample",
  completed_at: null,
  returned_at: null,
  ...overrides,
})

const SAMPLE: AssignmentType[] = ["sample"]
const FULL: AssignmentType[] = ["full_batch"]
const MIXED: AssignmentType[] = ["sample", "full_batch"]

describe("getRequiredCapabilities", () => {
  it("maps sample to can_test", () => {
    expect(getRequiredCapabilities(SAMPLE)).toEqual({
      can_test: true,
      can_process: false,
    })
  })

  it("maps full_batch to can_process", () => {
    expect(getRequiredCapabilities(FULL)).toEqual({
      can_test: false,
      can_process: true,
    })
  })

  it("requires both for a mixed selection", () => {
    expect(getRequiredCapabilities(MIXED)).toEqual({
      can_test: true,
      can_process: true,
    })
  })

  it("collapses repeated types", () => {
    expect(getRequiredCapabilities(["sample", "sample", "sample"])).toEqual({
      can_test: true,
      can_process: false,
    })
  })
})

describe("linkSupportsAssignmentTypes", () => {
  // Every capability combination against every selection shape.
  const cases: Array<{
    capabilities: [boolean, boolean]
    selection: AssignmentType[]
    expected: boolean
    because: string
  }> = [
    // can_test only
    {
      capabilities: [true, false],
      selection: SAMPLE,
      expected: true,
      because: "a sample needs can_test",
    },
    {
      capabilities: [true, false],
      selection: FULL,
      expected: false,
      because: "a full batch needs can_process",
    },
    {
      capabilities: [true, false],
      selection: MIXED,
      expected: false,
      because: "a mixed selection needs both",
    },
    // can_process only
    {
      capabilities: [false, true],
      selection: SAMPLE,
      expected: false,
      because: "can_process does not permit samples",
    },
    {
      capabilities: [false, true],
      selection: FULL,
      expected: true,
      because: "a full batch needs can_process",
    },
    {
      capabilities: [false, true],
      selection: MIXED,
      expected: false,
      because: "a mixed selection needs both",
    },
    // both
    {
      capabilities: [true, true],
      selection: SAMPLE,
      expected: true,
      because: "a fully capable link accepts samples",
    },
    {
      capabilities: [true, true],
      selection: FULL,
      expected: true,
      because: "a fully capable link accepts full batches",
    },
    {
      capabilities: [true, true],
      selection: MIXED,
      expected: true,
      because: "a fully capable link accepts a mixed selection",
    },
    // neither
    {
      capabilities: [false, false],
      selection: SAMPLE,
      expected: false,
      because: "a link with no capabilities accepts nothing",
    },
    {
      capabilities: [false, false],
      selection: FULL,
      expected: false,
      because: "a link with no capabilities accepts nothing",
    },
    {
      capabilities: [false, false],
      selection: MIXED,
      expected: false,
      because: "a link with no capabilities accepts nothing",
    },
  ]

  it.each(cases)(
    "$because (can_test=$capabilities.0, can_process=$capabilities.1)",
    ({ capabilities, selection, expected }) => {
      expect(
        linkSupportsAssignmentTypes(
          link(capabilities[0], capabilities[1]),
          selection,
        ),
      ).toBe(expected)
    },
  )

  it("rejects an empty selection even for a fully capable link", () => {
    expect(linkSupportsAssignmentTypes(link(true, true), [])).toBe(false)
  })
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
  it("offers processing only for an active full-batch assignment", () => {
    expect(
      getAssignmentActions(assignment({ assignment_type: "full_batch" }))
        .canProcess,
    ).toBe(true)

    expect(
      getAssignmentActions(assignment({ assignment_type: "sample" }))
        .canProcess,
    ).toBe(false)
  })

  it("does not offer processing once the batch has been returned", () => {
    expect(
      getAssignmentActions(
        assignment({
          assignment_type: "full_batch",
          returned_at: "2026-08-02T00:00:00Z",
        }),
      ).canProcess,
    ).toBe(false)
  })

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
        assignment_type: "full_batch",
        completed_at: "2026-08-01T00:00:00Z",
        returned_at: "2026-08-02T00:00:00Z",
      }),
      { hasVisibleSubBatch: true },
    )

    expect(actions).toEqual({
      canTest: false,
      canProcess: false,
      canReturn: false,
      canDelete: false,
    })
  })

  it("never offers delete to a Testing organisation", () => {
    expect(
      getAssignmentActions(assignment({ assignment_type: "full_batch" }), {
        hasVisibleSubBatch: true,
      }).canDelete,
    ).toBe(false)
  })
})
