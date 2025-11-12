import { useMutation } from "@tanstack/react-query"
import { supabase } from "@nasti/common/supabase"
import { queryClient } from "@nasti/common/utils"
import type { BatchProcessType, BatchQuality } from "@nasti/common/types"

// Mutation: Process a batch (origin batch or regular batch)
type ProcessBatchParams = {
  inputBatchId: string
  originBatchWeight?: number
  outputWeight: number
  process: BatchProcessType[]
  qualityAssessment: BatchQuality
  notes?: string
}

export const useProcessBatch = () => {
  return useMutation<string, Error, ProcessBatchParams>({
    mutationFn: async ({
      inputBatchId,
      originBatchWeight,
      outputWeight,
      process,
      qualityAssessment,
      notes,
    }) => {
      const { data, error } = await supabase.rpc("fn_process_batch", {
        p_input_batch_id: inputBatchId,
        p_output_weight: outputWeight,
        p_process: process,
        p_quality_assessment: qualityAssessment,
        p_origin_batch_weight: originBatchWeight ?? undefined, // db function will treat undefined as null
        p_notes: notes,
      })

      if (error) throw new Error(error.message)
      return data as string
    },
    onSuccess: () => {
      // Invalidate batch queries
      queryClient.invalidateQueries({
        queryKey: ["batches"],
      })

      // Invalidate processing history
      queryClient.invalidateQueries({
        queryKey: ["batchProcessing"],
      })
    },
  })
}
