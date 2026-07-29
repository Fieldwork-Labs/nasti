import { useMutation, useQuery } from "@tanstack/react-query"
import { supabase } from "@nasti/common/supabase"
import { queryClient } from "@nasti/common/utils"
import type {
  BatchCleaning,
  BatchCleaningOutput,
  Batch,
  MaterialType,
} from "@nasti/common/types"

export type BatchCleaningOutputWithBatch = BatchCleaningOutput & {
  output_batch: Pick<Batch, "id" | "code" | "weight_grams">
}

export type BatchCleaningWithOutputs = BatchCleaning & {
  outputs: BatchCleaningOutputWithBatch[]
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
          outputs:batch_cleaning_output(
            *,
            output_batch:batches!batch_cleaning_output_output_batch_id_fkey(
              id,
              code,
              weight_grams
            )
          )
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

export type CleaningBaggingContainerGroup = {
  container_id: string
  location_id?: string
  quantity: number
  weight_grams: number
}

export type CleaningBaggingOutput = {
  output_batch_id: string
  containers: CleaningBaggingContainerGroup[]
}

export const useBagAndStoreCleaningOutputs = () =>
  useMutation<
    string[],
    Error,
    { cleaningId: string; outputs: CleaningBaggingOutput[] }
  >({
    mutationFn: async ({ cleaningId, outputs }) => {
      const { data, error } = await supabase.rpc(
        "fn_bag_and_store_cleaning_outputs",
        {
          p_cleaning_id: cleaningId,
          p_bags: outputs,
        },
      )

      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["batches"] })
      queryClient.invalidateQueries({ queryKey: ["subBatches"] })
      queryClient.invalidateQueries({ queryKey: ["storageLocations"] })
      queryClient.invalidateQueries({ queryKey: ["containers"] })
    },
  })

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
