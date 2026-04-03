import { useMutation } from "@tanstack/react-query"
import { supabase } from "@nasti/common/supabase"
import { queryClient } from "@nasti/common/utils"
import type { MaterialType } from "@nasti/common/types"

type CleaningOutput = {
  quality: "ORG" | "HQ" | "LQ"
  material_type: MaterialType
  weight_grams: number
}

type CleanBatchParams = {
  inputBatchId: string
  materialType: MaterialType
  materialSubtype?: string
  materialNotes?: string
  isCleaned: boolean
  cleaningNotes?: string
  outputs: CleaningOutput[]
}

export const useCleanBatch = () => {
  return useMutation<string, Error, CleanBatchParams>({
    mutationFn: async ({
      inputBatchId,
      materialType,
      materialSubtype,
      materialNotes,
      isCleaned,
      cleaningNotes,
      outputs,
    }) => {
      const { data, error } = await supabase.rpc("fn_clean_batch", {
        p_input_batch_id: inputBatchId,
        p_material_type: materialType,
        p_material_subtype: materialSubtype,
        p_material_notes: materialNotes,
        p_is_cleaned: isCleaned,
        p_cleaning_notes: cleaningNotes,
        p_outputs: outputs,
      })

      if (error) throw new Error(error.message)
      return data as string
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["batches"],
      })
      queryClient.invalidateQueries({
        queryKey: ["batchCleaning"],
      })
    },
  })
}
