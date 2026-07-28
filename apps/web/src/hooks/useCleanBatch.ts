import { useMutation, useQuery } from "@tanstack/react-query"
import { supabase } from "@nasti/common/supabase"
import { queryClient } from "@nasti/common/utils"
import type {
  BatchCleaning,
  BatchCleaningOutput,
  MaterialType,
} from "@nasti/common/types"

export type BatchCleaningWithOutputs = BatchCleaning & {
  outputs: BatchCleaningOutput[]
}

type CleaningOutput = {
  quality: "ORG" | "HQ" | "LQ"
  material_type: MaterialType
  weight_grams: number
}

type CleanBatchParams = {
  inputBatchId: string
  materialType?: MaterialType
  materialSubtype?: string
  materialNotes?: string
  isCleaned: boolean
  cleaningNotes?: string
  workerIds: string[]
  duration?: string
  outputs: CleaningOutput[]
}

type UpdateBatchCleaningParams = Omit<
  CleanBatchParams,
  "inputBatchId" | "isCleaned" | "outputs"
> & {
  cleaningId: string
}

export const useBatchCleaning = (cleaningId?: string) => {
  return useQuery({
    queryKey: ["batchCleaning", "detail", cleaningId],
    queryFn: async () => {
      if (!cleaningId) return null

      const { data, error } = await supabase
        .from("batch_cleaning")
        .select(
          `
          *,
          outputs:batch_cleaning_output(*)
        `,
        )
        .eq("id", cleaningId)
        .single()
        .overrideTypes<BatchCleaningWithOutputs, { merge: false }>()

      if (error) throw new Error(error.message)
      return data
    },
    enabled: Boolean(cleaningId),
  })
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
      workerIds,
      duration,
      outputs,
    }) => {
      const { data, error } = await supabase.rpc("fn_clean_batch", {
        p_input_batch_id: inputBatchId,
        p_duration: duration,
        p_material_type: materialType,
        p_material_subtype: materialSubtype,
        p_material_notes: materialNotes,
        p_is_cleaned: isCleaned,
        p_cleaning_notes: cleaningNotes,
        p_worker_ids: workerIds,
        p_outputs: outputs,
      })

      if (error) throw new Error(error.message)
      return data
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

export const useUpdateBatchCleaning = () => {
  return useMutation<string, Error, UpdateBatchCleaningParams>({
    mutationFn: async ({
      cleaningId,
      materialType,
      materialSubtype,
      materialNotes,
      cleaningNotes,
      workerIds,
      duration,
    }) => {
      const { data, error } = await supabase.rpc("fn_update_batch_cleaning", {
        p_cleaning_id: cleaningId,
        p_duration: duration,
        p_material_type: materialType,
        p_material_subtype: materialSubtype,
        p_material_notes: materialNotes,
        p_cleaning_notes: cleaningNotes,
        p_worker_ids: workerIds,
      })

      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: (_cleaningId, { cleaningId }) => {
      queryClient.invalidateQueries({
        queryKey: ["batchCleaning", "detail", cleaningId],
      })
      queryClient.invalidateQueries({
        queryKey: ["batchCleaning"],
      })
    },
  })
}
