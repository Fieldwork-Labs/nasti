import { useMutation } from "@tanstack/react-query"
import { supabase } from "@nasti/common/supabase"
import { queryClient } from "@nasti/common/utils"

type CombineBatchesParams = {
  sourceBatchIds: string[]
  notes?: string
}

// Combines unprocessed batches into one new unprocessed batch. Not the same as
// mixing, which works on batches that already have weight (useMixBatches).
export const useCombineBatches = () => {
  return useMutation<string, Error, CombineBatchesParams>({
    mutationFn: async ({ sourceBatchIds, notes }) => {
      const { data, error } = await supabase.rpc("fn_combine_batches", {
        p_source_batch_ids: sourceBatchIds,
        p_notes: notes,
      })

      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["batches"],
      })
    },
  })
}
