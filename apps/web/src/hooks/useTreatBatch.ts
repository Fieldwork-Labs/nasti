import { useMutation } from "@tanstack/react-query"
import { supabase } from "@nasti/common/supabase"
import { queryClient } from "@nasti/common/utils"
import type { BatchTreatType, BatchQuality } from "@nasti/common/types"

type TreatBatchParams = {
  inputBatchId: string
  originBatchWeight?: number
  outputWeight: number
  treatment: BatchTreatType[]
  qualityAssessment: BatchQuality
  notes?: string
}

export const useTreatBatch = () => {
  return useMutation<string, Error, TreatBatchParams>({
    mutationFn: async ({
      inputBatchId,
      originBatchWeight,
      outputWeight,
      treatment,
      qualityAssessment,
      notes,
    }) => {
      const { data, error } = await supabase.rpc("fn_treat_batch", {
        p_input_batch_id: inputBatchId,
        p_output_weight: outputWeight,
        p_treat: treatment,
        p_quality_assessment: qualityAssessment,
        p_origin_batch_weight: originBatchWeight ?? undefined,
        p_notes: notes,
      })

      if (error) throw new Error(error.message)
      return data as string
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["batches"],
      })
      queryClient.invalidateQueries({
        queryKey: ["treatments"],
      })
    },
  })
}
