import { useQuery } from "@tanstack/react-query"
import { supabase } from "@nasti/common/supabase"
import type { BatchTestingAssignment } from "@nasti/common/types"

const ASSIGNMENT_WITH_ORGS = `
  *,
  assigned_to_org:organisation!assigned_to_org_id(name),
  assigned_by_org:organisation!assigned_by_org_id(name)
`

// Extended type with organization name
export type BatchAssignmentWithOrg = BatchTestingAssignment & {
  assigned_to_org?: {
    name: string
  }
  assigned_by_org?: {
    name: string
  }
}

/**
 * Every open assignment, indexed by the bag it names.
 *
 * A parent batch may have several bags out at once, so this cannot be keyed by
 * batch: two bags of one batch would collapse into one entry and the second
 * would silently disappear.
 */
export const useActiveBagAssignments = () => {
  return useQuery<Map<string, BatchAssignmentWithOrg>>({
    queryKey: ["batch-assignments", "active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("batch_testing_assignment")
        .select(ASSIGNMENT_WITH_ORGS)
        .is("closed_at", null)
        .order("assigned_at", { ascending: false })

      if (error) throw new Error(error.message)

      return new Map(
        (data as BatchAssignmentWithOrg[]).map((assignment) => [
          assignment.sub_batch_id,
          assignment,
        ]),
      )
    },
  })
}

/**
 * The open assignment for one bag, if it has one.
 *
 * `maybeSingle` is safe here in a way it was not when this was keyed by batch:
 * a partial unique index enforces at most one open assignment per bag.
 */
export const useActiveBagAssignment = (subBatchId: string | undefined) => {
  return useQuery<BatchAssignmentWithOrg | null>({
    queryKey: ["batch-assignment", subBatchId],
    enabled: Boolean(subBatchId),
    queryFn: async () => {
      if (!subBatchId) return null

      const { data, error } = await supabase
        .from("batch_testing_assignment")
        .select(ASSIGNMENT_WITH_ORGS)
        .eq("sub_batch_id", subBatchId)
        .is("closed_at", null)
        .maybeSingle()

      if (error) throw new Error(error.message)
      return data as BatchAssignmentWithOrg | null
    },
  })
}

/**
 * The open assignments covering any bag of one parent batch.
 *
 * For General inventory, which shows a batch row and needs to know which of its
 * bags are out. Returns a map keyed by `sub_batch_id`, empty when none are.
 */
export const useActiveAssignmentsForBatch = (batchId: string | undefined) => {
  return useQuery<Map<string, BatchAssignmentWithOrg>>({
    queryKey: ["batch-assignment", "by-batch", batchId],
    enabled: Boolean(batchId),
    queryFn: async () => {
      if (!batchId) return new Map()

      const { data, error } = await supabase
        .from("batch_testing_assignment")
        .select(ASSIGNMENT_WITH_ORGS)
        .eq("batch_id", batchId)
        .is("closed_at", null)

      if (error) throw new Error(error.message)

      return new Map(
        (data as BatchAssignmentWithOrg[]).map((assignment) => [
          assignment.sub_batch_id,
          assignment,
        ]),
      )
    },
  })
}
