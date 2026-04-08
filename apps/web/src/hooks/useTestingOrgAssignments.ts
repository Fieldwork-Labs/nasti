import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { supabase } from "@nasti/common/supabase"
import useUserStore from "@/store/userStore"
import type { BatchAssignmentWithOrg } from "./useBatchAssignments"

// Extended type with batch details
export type AssignmentWithBatchDetails = BatchAssignmentWithOrg & {
  batch?: {
    id: string
    code: string | null
    weight_grams: number | null
    collection: {
      id: string
      code: string | null
    }
    species: {
      id: string
      name: string
      ala_guid: string | null
    }
  }
}

// Fetch pending assignments (todo list - not yet completed)
export const useAssignmentsByStatus = ({
  status,
}: {
  status: "complete" | "pending"
}) => {
  const { organisation } = useUserStore()
  return useQuery<AssignmentWithBatchDetails[]>({
    queryKey: ["assignments", "byStatus", status],
    queryFn: async () => {
      if (!organisation?.id) throw new Error("No organisation found")

      let q = supabase
        .from("batch_testing_assignment")
        .select(
          `
          *,
          
          assigned_to_org:organisation!assigned_to_org_id(name),
          assigned_by_org:organisation!assigned_by_org_id(name),
          batch:batches!batch_id(
              id,
              code,
              weight_grams,
              collection:collection_id(
                id,
                code
              ),
              species:collection_id(...species(
                id,
                ala_guid,
                name
              ))
            )
              `,
        )
        .eq("assigned_to_org_id", organisation.id)
        .is("returned_at", null)

      if (status === "pending") {
        q = q.is("completed_at", null)
      } else {
        q = q.not("completed_at", "is", null)
      }
      const { data, error } = await q.order("assigned_at", { ascending: false })

      if (error) throw new Error(error.message)
      return data as AssignmentWithBatchDetails[]
    },

    enabled: Boolean(organisation?.id),
  })
}

// Fetch pending assignments (todo list - not yet completed)
export const usePendingAssignments = () => {
  return useAssignmentsByStatus({ status: "pending" })
}

// Fetch completed assignments (inventory - completed but not yet returned)
export const useCompletedAssignments = () => {
  return useAssignmentsByStatus({ status: "complete" })
}

// Mark assignment as completed
export const useCompleteAssignment = () => {
  const { organisation } = useUserStore()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (assignmentId: string) => {
      const { error, data } = await supabase.functions.invoke(
        "complete_testing_assignment",
        {
          body: { assignment_id: assignmentId },
        },
      )

      if (error) {
        throw new Error(error.message || "Failed to complete assignment")
      }

      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["testing-assignments", "pending", organisation?.id],
      })
      queryClient.invalidateQueries({
        queryKey: ["testing-assignments", "completed", organisation?.id],
      })
    },
  })
}

// Return batch/sample to owner
export const useReturnBatchFromTesting = () => {
  const { organisation } = useUserStore()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      assignmentId,
      subsampleWeightGrams,
      subsampleStorageLocationId,
    }: {
      assignmentId: string
      subsampleWeightGrams?: number
      subsampleStorageLocationId?: string
    }) => {
      const { error, data } = await supabase.functions.invoke(
        "return_batch_from_testing",
        {
          body: {
            assignment_id: assignmentId,
            subsample_weight_grams: subsampleWeightGrams,
            subsample_storage_location_id: subsampleStorageLocationId,
          },
        },
      )

      if (error) {
        throw new Error(error.message || "Failed to return batch")
      }

      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["testing-assignments", "completed", organisation?.id],
      })
    },
  })
}
