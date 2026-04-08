import { supabase } from "@nasti/common/supabase"
import { useMutation, useQueryClient } from "@tanstack/react-query"

interface BatchAssignment {
  batch_id: string
  sample_weight_grams?: number
  assignment_type: "sample" | "full_batch"
}

// Assign batches for testing
export const useAssignBatchesForTesting = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      batch_assignments,
      testing_org_id,
    }: {
      batch_assignments: BatchAssignment[]
      testing_org_id: string
    }) => {
      const { error, data } = await supabase.functions.invoke(
        "assign_batches_for_testing",
        {
          body: { batch_assignments, testing_org_id },
        },
      )

      if (error) {
        throw new Error(error.message || "Failed to assign batches for testing")
      }

      return data
    },
    onSuccess: (_, variables) => {
      // Invalidate batches queries to refresh inventory
      queryClient.invalidateQueries({
        queryKey: ["batches"],
      })
      variables.batch_assignments.forEach((assignment) => {
        queryClient.invalidateQueries({
          queryKey: ["batch-assignment", assignment.batch_id],
        })
      })
    },
  })
}
