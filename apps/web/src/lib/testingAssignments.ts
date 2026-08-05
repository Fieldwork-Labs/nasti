/**
 * Pure rules for testing assignments.
 *
 * These mirror the invariants the database enforces, so that the UI can hide
 * an action rather than let the user attempt it and read an exception back.
 * The database remains the authority: nothing here is a security boundary.
 *
 * The capability mapping is the one place this has gone wrong before, so state
 * it plainly: a `sample` needs `can_test`, a `full_batch` needs `can_process`,
 * and a selection containing both needs both.
 */

export type AssignmentType = "sample" | "full_batch"

export type LinkCapabilities = {
  can_test: boolean
  can_process: boolean
}

/** Where an assignment sits in its lifecycle. */
export type AssignmentStatus = "pending" | "completed" | "returned"

/** The status lists the Testing inventory offers. Returned rows appear in none. */
export type InventoryStatusFilter = "pending" | "completed" | "any"

export type AssignmentState = {
  assignment_type: string
  completed_at: string | null
  returned_at: string | null
}

export type AssignmentActions = {
  canTest: boolean
  canProcess: boolean
  canReturn: boolean
  canDelete: boolean
}

export type AssignmentActionContext = {
  /**
   * A quality test is recorded against a bag, so the action is only offered
   * once the caller can actually see one to test.
   */
  hasVisibleSubBatch?: boolean
}

/** The capabilities a selection of assignment types demands of a link. */
export const getRequiredCapabilities = (
  assignmentTypes: readonly AssignmentType[],
): LinkCapabilities => ({
  can_test: assignmentTypes.includes("sample"),
  can_process: assignmentTypes.includes("full_batch"),
})

/**
 * Whether a link can accept every one of the selected assignment types.
 * An empty selection is not assignable to anything.
 */
export const linkSupportsAssignmentTypes = (
  link: LinkCapabilities,
  assignmentTypes: readonly AssignmentType[],
): boolean => {
  if (assignmentTypes.length === 0) return false

  const required = getRequiredCapabilities(assignmentTypes)

  if (required.can_test && !link.can_test) return false
  if (required.can_process && !link.can_process) return false

  return true
}

export const getAssignmentStatus = (
  assignment: AssignmentState,
): AssignmentStatus => {
  if (assignment.returned_at) return "returned"
  if (assignment.completed_at) return "completed"
  return "pending"
}

export const isAssignmentActive = (assignment: AssignmentState): boolean =>
  getAssignmentStatus(assignment) !== "returned"

/**
 * Whether an assignment belongs in a given Testing inventory list.
 * Returned assignments are excluded from every list.
 */
export const matchesInventoryStatus = (
  assignment: AssignmentState,
  filter: InventoryStatusFilter,
): boolean => {
  const status = getAssignmentStatus(assignment)

  if (status === "returned") return false
  if (filter === "any") return true

  return status === filter
}

/**
 * Which row actions a Testing organisation may take.
 *
 * Processing is custody work, and only a full-batch assignment transfers
 * custody — a sample is seed on loan. Delete is never offered: the Testing
 * organisation does not own the batch.
 */
export const getAssignmentActions = (
  assignment: AssignmentState,
  context: AssignmentActionContext = {},
): AssignmentActions => {
  const active = isAssignmentActive(assignment)

  return {
    canTest: active && Boolean(context.hasVisibleSubBatch),
    canProcess: active && assignment.assignment_type === "full_batch",
    canReturn: active,
    canDelete: false,
  }
}
