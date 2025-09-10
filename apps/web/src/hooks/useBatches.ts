import { useMutation, useQuery } from "@tanstack/react-query"
import { supabase } from "@nasti/common/supabase"
import { queryClient } from "@nasti/common/utils"
import type {
  Batch,
  BatchCustody,
  BatchSplit,
  BatchMerge,
} from "@nasti/common/types"

// Extended batch type with custody information
export type BatchWithCustody = Batch & {
  current_custodian?: {
    organisation_id: string
    received_at: string
  }
}

// Query: Get batches for a collection
export const useBatchesByCollection = (collectionId: string) => {
  return useQuery({
    queryKey: ["batches", "byCollection", collectionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("batches")
        .select(
          `
          *,
          current_custodian:current_batch_custody(
            organisation_id,
            received_at
          )
        `,
        )
        .eq("collection_id", collectionId)
        .order("created_at", { ascending: false })
        .overrideTypes<BatchWithCustody[]>()

      if (error) throw new Error(error.message)
      return data
    },
  })
}

// Query: Get batch details with full custody history
export const useBatchDetail = (batchId: string) => {
  return useQuery({
    queryKey: ["batches", "detail", batchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("batches")
        .select(
          `
          *,
          custody_history:batch_custody(
            *,
            organisation:organisation(name)
          ),
          current_custodian:current_batch_custody(
            organisation_id,
            received_at
          ),
          splits:batch_splits(
            *,
            child_batch:batches(id, notes, created_at)
          ),
          merges:batch_merges(
            *,
            source_batch:batches(id, notes, created_at)
          ),
          storage:current_batch_storage(
            *,
            location:storage_locations(name, description)
          )
        `,
        )
        .eq("id", batchId)
        .single()

      if (error) throw new Error(error.message)
      return data
    },
  })
}

// Mutation: Create batch from collection
type CreateBatchFromCollectionParams = {
  collectionId: string
  notes?: string
}

export const useCreateBatchFromCollection = () => {
  return useMutation<string, Error, CreateBatchFromCollectionParams>({
    mutationFn: async ({ collectionId, notes }) => {
      const { data, error } = await supabase.rpc(
        "fn_create_batch_from_collection",
        {
          p_collection_id: collectionId,
          p_notes: notes || undefined,
        },
      )

      if (error) throw new Error(error.message)
      return data as string
    },
    onSuccess: (newBatchId, variables) => {
      // Invalidate collection batches cache
      queryClient.invalidateQueries({
        queryKey: ["batches", "byCollection", variables.collectionId],
      })

      // Invalidate batch detail cache for new batch
      queryClient.invalidateQueries({
        queryKey: ["batches", "detail", newBatchId],
      })
    },
  })
}

// Mutation: Split batch
type SplitBatchParams = {
  parentBatchId: string
  notes?: string
}

export const useSplitBatch = () => {
  return useMutation<string, Error, SplitBatchParams>({
    mutationFn: async ({ parentBatchId, notes }) => {
      const { data, error } = await supabase.rpc("fn_split_batch", {
        p_parent_batch_id: parentBatchId,
        p_notes: notes || undefined,
      })

      if (error) throw new Error(error.message)
      return data as string
    },
    onSuccess: (childBatchId, variables) => {
      // Get parent batch to find collection
      const parentBatchData = queryClient.getQueryData<Batch>([
        "batches",
        "detail",
        variables.parentBatchId,
      ])

      if (parentBatchData?.collection_id) {
        // Invalidate collection batches cache
        queryClient.invalidateQueries({
          queryKey: ["batches", "byCollection", parentBatchData.collection_id],
        })
      }

      // Invalidate parent batch detail cache
      queryClient.invalidateQueries({
        queryKey: ["batches", "detail", variables.parentBatchId],
      })

      // Invalidate child batch detail cache
      queryClient.invalidateQueries({
        queryKey: ["batches", "detail", childBatchId],
      })
    },
  })
}

// Mutation: Merge batches
type MergeBatchesParams = {
  sourceBatchIds: string[]
  notes?: string
}

export const useMergeBatches = () => {
  return useMutation<string, Error, MergeBatchesParams>({
    mutationFn: async ({ sourceBatchIds, notes }) => {
      const { data, error } = await supabase.rpc("fn_merge_batches", {
        p_source_batch_ids: sourceBatchIds,
        p_notes: notes || undefined,
      })

      if (error) throw new Error(error.message)
      return data as string
    },
    onSuccess: (mergedBatchId, variables) => {
      // Get first source batch to find collection
      const firstSourceBatch = queryClient.getQueryData<Batch>([
        "batches",
        "detail",
        variables.sourceBatchIds[0],
      ])

      if (firstSourceBatch?.collection_id) {
        // Invalidate collection batches cache
        queryClient.invalidateQueries({
          queryKey: ["batches", "byCollection", firstSourceBatch.collection_id],
        })
      }

      // Invalidate all source batch caches
      variables.sourceBatchIds.forEach((batchId) => {
        queryClient.invalidateQueries({
          queryKey: ["batches", "detail", batchId],
        })
      })

      // Invalidate merged batch detail cache
      queryClient.invalidateQueries({
        queryKey: ["batches", "detail", mergedBatchId],
      })
    },
  })
}

// Mutation: Update batch
type UpdateBatchParams = {
  id: string
  notes?: string
}

export const useUpdateBatch = () => {
  return useMutation<Batch, Error, UpdateBatchParams>({
    mutationFn: async ({ id, notes }) => {
      const { data, error } = await supabase
        .from("batches")
        .update({ notes })
        .eq("id", id)
        .select()
        .single()

      if (error) throw new Error(error.message)
      return data as Batch
    },
    onSuccess: (updatedBatch) => {
      // Update batch detail cache
      queryClient.setQueryData<Batch>(
        ["batches", "detail", updatedBatch.id],
        (oldData) => ({
          ...oldData,
          ...updatedBatch,
        }),
      )

      // Invalidate collection batches cache
      if (updatedBatch.collection_id) {
        queryClient.invalidateQueries({
          queryKey: ["batches", "byCollection", updatedBatch.collection_id],
        })
      }
    },
  })
}

// Query: Get batch custody history
export const useBatchCustodyHistory = (batchId: string) => {
  return useQuery({
    queryKey: ["batches", "custody", batchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("batch_custody")
        .select(
          `
            *,
            organisation(name),
            transferred_by_user:users!batch_custody_transferred_by_fkey(email)
          `,
        )

        .eq("batch_id", batchId)
        .order("received_at", { ascending: false })
        .overrideTypes<
          Array<
            BatchCustody & {
              organisation: { name: string }
              transferred_by_user?: { email: string }
            }
          >
        >()

      if (error) throw new Error(error.message)
      return data as (BatchCustody & {
        organisation: { name: string }
        transferred_by_user?: { email: string }
      })[]
    },
  })
}

// Query: Get batch lineage (splits and merges)
export const useBatchLineage = (batchId: string) => {
  return useQuery({
    queryKey: ["batches", "lineage", batchId],
    queryFn: async () => {
      const [splitsResult, mergesResult] = await Promise.all([
        // Get splits where this batch is the parent
        supabase
          .from("batch_splits")
          .select(
            `
            *,
            child_batch:batches!batch_splits_child_batch_id_fkey (
              id,
              notes,
              created_at
            )
          `,
          )
          .eq("parent_batch_id", batchId),

        // Get merges where this batch is the result
        supabase
          .from("batch_merges")
          .select(
            `
            *,
            source_batch:batches!batch_merges_source_batch_id_fkey (
              id,
              notes,
              created_at
            )
          `,
          )
          .eq("merged_batch_id", batchId),
      ])

      if (splitsResult.error) throw new Error(splitsResult.error.message)
      if (mergesResult.error) throw new Error(mergesResult.error.message)

      return {
        splits: splitsResult.data as (BatchSplit & { child_batch: Batch })[],
        merges: mergesResult.data as (BatchMerge & { source_batch: Batch })[],
      }
    },
  })
}
