import { useMutation } from "@tanstack/react-query"
import { supabase } from "@nasti/common/supabase"
import { queryClient } from "@nasti/common/utils"

type MixBatchesParams = {
  sourceBatchIds: string[]
  notes?: string
}

export const useMixBatches = () => {
  return useMutation<string, Error, MixBatchesParams>({
    mutationFn: async ({ sourceBatchIds, notes }) => {
      const { data, error } = await supabase.rpc("fn_mix_batches", {
        p_source_batch_ids: sourceBatchIds,
        p_notes: notes,
      })

      if (error) throw new Error(error.message)
      return data as string
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["batches"],
      })
    },
  })
}
