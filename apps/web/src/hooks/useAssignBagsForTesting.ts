import { supabase } from "@nasti/common/supabase"
import { useMutation, useQueryClient } from "@tanstack/react-query"

/**
 * One bag to send. Omit `sample_weight_grams` to send the whole bag; supply it
 * to have the database split that weight off first and send the child instead.
 * `container_id` is what the seed is physically mailed in.
 */
export interface BagAssignment {
  sub_batch_id: string
  sample_weight_grams?: number
  container_id?: string
}

export const useAssignBagsForTesting = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      sub_batch_assignments,
      testing_org_id,
    }: {
      sub_batch_assignments: BagAssignment[]
      testing_org_id: string
    }) => {
      const { error, data } = await supabase.functions.invoke(
        "assign_batches_for_testing",
        {
          body: { sub_batch_assignments, testing_org_id },
        },
      )

      if (error) {
        throw new Error(error.message || "Failed to send bags for testing")
      }

      return data
    },
    onSuccess: () => {
      // Assignment moves custody, which changes what both organisations can
      // see and what each batch weighs from their side. A sample assignment
      // also creates a bag that did not exist a moment ago. Nothing here can be
      // narrowed to the bags named in the request.
      for (const key of [
        ["batches"],
        ["sub-batches"],
        ["assignments"],
        ["batch-assignment"],
        ["batch-storage"],
        ["tests"],
      ]) {
        queryClient.invalidateQueries({ queryKey: key })
      }
    },
  })
}
