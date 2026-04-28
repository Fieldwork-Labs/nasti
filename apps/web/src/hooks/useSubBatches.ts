import { useMutation, useQuery } from "@tanstack/react-query"
import { supabase } from "@nasti/common/supabase"
import { queryClient } from "@nasti/common/utils"
import type { ActiveSubBatch, StorageLocation } from "@nasti/common/types"

export type SubBatchWithStorage = ActiveSubBatch & {
  current_storage?: {
    id: string
    location_id: string
    stored_at: string | null
    notes: string | null
    location: StorageLocation
  } | null
}

// Query: Get sub-batches for a batch
export const useSubBatches = (batchId: string) => {
  return useQuery({
    queryKey: ["subBatches", batchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("active_sub_batches")
        .select("*")
        .eq("batch_id", batchId)
        .order("created_at", { ascending: true })
        .overrideTypes<ActiveSubBatch[]>()

      if (error) throw new Error(error.message)

      // For each sub-batch, get current storage
      const subBatchesWithStorage: SubBatchWithStorage[] = await Promise.all(
        (data ?? []).map(async (sb) => {
          const { data: storageData } = await supabase
            .from("batch_storage")
            .select(
              "id, location_id, stored_at, notes, location:storage_locations(*)",
            )
            .eq("sub_batch_id", sb.id)
            .is("moved_out_at", null)
            .order("stored_at", { ascending: false })
            .limit(1)
            .single()

          return {
            ...sb,
            current_storage:
              storageData as SubBatchWithStorage["current_storage"],
          }
        }),
      )

      return subBatchesWithStorage
    },
    enabled: Boolean(batchId),
  })
}

// Mutation: Split a sub-batch into one or more new sub-batches
type SplitSubBatchOutput = {
  weight_grams: number
  notes?: string
}

type SplitSubBatchParams = {
  subBatchId: string
  outputs: SplitSubBatchOutput[]
}

export const useSplitSubBatch = () => {
  return useMutation<string[], Error, SplitSubBatchParams>({
    mutationFn: async ({ subBatchId, outputs }) => {
      const { data, error } = await supabase.rpc("fn_split_sub_batch", {
        p_sub_batch_id: subBatchId,
        p_outputs: outputs,
      })

      if (error) throw new Error(error.message)
      return data as string[]
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subBatches"] })
      queryClient.invalidateQueries({ queryKey: ["batches"] })
    },
  })
}

// Mutation: Merge sub-batches within a batch
type MergeSubBatchesParams = {
  subBatchIds: string[]
  notes?: string
}

export const useMergeSubBatches = () => {
  return useMutation<string, Error, MergeSubBatchesParams>({
    mutationFn: async ({ subBatchIds, notes }) => {
      const { data, error } = await supabase.rpc("fn_merge_sub_batches", {
        p_sub_batch_ids: subBatchIds,
        p_notes: notes,
      })

      if (error) throw new Error(error.message)
      return data as string
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subBatches"] })
      queryClient.invalidateQueries({ queryKey: ["batches"] })
    },
  })
}
