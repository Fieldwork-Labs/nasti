/**
 * Pure rules for testing assignments.
 *
 * These mirror the invariants the database enforces, so that the UI can hide
 * an action rather than let the user attempt it and read an exception back.
 * The database remains the authority: nothing here is a security boundary.
 */

/**
 * How an assignment ended.
 *
 * A bag that came back is `returned`. A bag entirely consumed in testing is
 * `consumed` and was never returnable, because there was nothing left to
 * return. Null while the assignment is still open.
 */
export type AssignmentOutcome = "returned" | "consumed"

/** Where an assignment sits in its lifecycle. */
export type AssignmentStatus = "pending" | "completed" | "closed"

/** The status lists the Testing inventory offers. Closed rows appear in none. */
export type InventoryStatusFilter = "pending" | "completed" | "any"

export type AssignmentState = {
  completed_at: string | null
  closed_at: string | null
  outcome: string | null
}

export type AssignmentActions = {
  canTest: boolean
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

export const getAssignmentStatus = (
  assignment: AssignmentState,
): AssignmentStatus => {
  if (assignment.closed_at) return "closed"
  if (assignment.completed_at) return "completed"
  return "pending"
}

export const isAssignmentActive = (assignment: AssignmentState): boolean =>
  getAssignmentStatus(assignment) !== "closed"

/** Null while open, so read it only once the assignment has closed. */
export const getAssignmentOutcome = (
  assignment: AssignmentState,
): AssignmentOutcome | null =>
  assignment.outcome === "returned" || assignment.outcome === "consumed"
    ? assignment.outcome
    : null

/**
 * Whether an assignment belongs in a given Testing inventory list.
 * Closed assignments are excluded from every list.
 */
export const matchesInventoryStatus = (
  assignment: AssignmentState,
  filter: InventoryStatusFilter,
): boolean => {
  const status = getAssignmentStatus(assignment)

  if (status === "closed") return false
  if (filter === "any") return true

  return status === filter
}

/**
 * Which row actions a Testing organisation may take.
 *
 * Delete is never offered: the Testing organisation does not own the batch.
 */
export const getAssignmentActions = (
  assignment: AssignmentState,
  context: AssignmentActionContext = {},
): AssignmentActions => {
  const active = isAssignmentActive(assignment)

  return {
    canTest: active && Boolean(context.hasVisibleSubBatch),
    canReturn: active,
    canDelete: false,
  }
}
