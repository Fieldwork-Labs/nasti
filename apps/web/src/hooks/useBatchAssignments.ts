import { useQuery } from "@tanstack/react-query"
import { supabase } from "@nasti/common/supabase"
import type { BatchTestingAssignment } from "@nasti/common/types"

// Extended type with organization name
export type BatchAssignmentWithOrg = BatchTestingAssignment & {
  assigned_to_org?: {
    name: string
  }
  assigned_by_org?: {
    name: string
  }
}

// Fetch active assignments for batches (not yet returned)
export const useActiveBatchAssignments = () => {
  return useQuery<BatchAssignmentWithOrg[]>({
    queryKey: ["batch-assignments", "active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("batch_testing_assignment")
        .select(
          `
          *,
          assigned_to_org:organisation!assigned_to_org_id(name),
          assigned_by_org:organisation!assigned_by_org_id(name)
        `,
        )
        .is("returned_at", null)
        .order("assigned_at", { ascending: false })

      if (error) throw new Error(error.message)
      return data as BatchAssignmentWithOrg[]
    },
  })
}

// Get active assignment for a specific batch
export const useActiveBatchAssignment = (batchId: string) => {
  return useQuery<BatchAssignmentWithOrg | null>({
    queryKey: ["batch-assignment", batchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("batch_testing_assignment")
        .select(
          `
          *,
          assigned_to_org:organisation!assigned_to_org_id(name),
          assigned_by_org:organisation!assigned_by_org_id(name)
        `,
        )
        .eq("batch_id", batchId)
        .is("returned_at", null)
        .maybeSingle()

      if (error) throw new Error(error.message)
      return data as BatchAssignmentWithOrg | null
    },
  })
}
