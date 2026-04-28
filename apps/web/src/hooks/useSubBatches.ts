import { useMutation, useQuery } from "@tanstack/react-query"
import { supabase } from "@nasti/common/supabase"
import { queryClient } from "@nasti/common/utils"
import type { ActiveSubBatch, StorageLocation } from "@nasti/common/types"
import { useMemo } from "react"

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
  const { data, ...rest } = useQuery({
    queryKey: ["subBatches", batchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("active_sub_batches")
        .select("*")
        .eq("batch_id", batchId)
        .order("created_at", { ascending: true })
        .overrideTypes<ActiveSubBatch[]>()

      if (error) throw new Error(error.message)
      return data
    },
    enabled: Boolean(batchId),
  })

  const ids = data?.map((sb) => sb.id)
  const storageQuery = useQuery({
    enabled: Boolean(ids && ids?.length && ids.length > 0),
    queryKey: ["subBatches", "storage", ids],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("batch_storage")
        .select(
          "id, location_id, stored_at, notes, sub_batch_id, location:storage_locations(*)",
        )
        .in("sub_batch_id", ids ?? [])
        .is("moved_out_at", null)
        .order("stored_at", { ascending: false })

      if (error) throw new Error(error.message)
      return data
    },
  })

  const result = useMemo(() => {
    const storageData = new Map(
      storageQuery.data?.map((st) => [st.sub_batch_id, st]),
    )
    return data?.map((sb) => ({
      ...sb,
      current_storage: storageData.get(sb.id),
    }))
  }, [storageQuery.data, data])

  return { ...rest, ...storageQuery, data: result }
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
