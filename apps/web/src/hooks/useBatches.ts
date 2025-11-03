import { useMutation, useQuery } from "@tanstack/react-query"
import { supabase } from "@nasti/common/supabase"
import { queryClient } from "@nasti/common/utils"
import {
  type Batch,
  type BatchCustody,
  type BatchSplit,
  type BatchMerge,
  ActiveBatch,
} from "@nasti/common/types"
import { BatchStatus } from "@/components/inventory/BatchInventoryFilters"

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

// Query: Get batches for a filter object
export type BatchFilter = {
  status?: BatchStatus
  collectionId?: string
  speciesId?: string
  locationId?: string
  search: string
  sort: string
  order: string
}

type IsProcessedBatch = ActiveBatch & {
  is_processed: boolean
}

export type UnprocessedBatch = IsProcessedBatch & {
  weight_grams: null
  is_processed: false
}

export type BatchWithCurrentLocationAndSpecies = IsProcessedBatch & {
  current_location?: {
    batch_id: string
    location_id: string
    notes: string | null
    stored_at: string | null
  }[]
  species?: {
    id: string
    name: string
  } | null
  collection: {
    id: string
    field_name: string
    code: string
  }
  weights?: {
    original_weight: number
    current_weight: number
  } | null
}

export const useBatchesByFilter = (batchFilter: BatchFilter) => {
  return useQuery({
    queryKey: ["batches", "byFilter", batchFilter],
    queryFn: async () => {
      let q = supabase.from("active_batches").select(`*,
          current_location:current_batch_storage(
            location_id,
            notes,
            stored_at
          ),
          collection:collection_id!inner(
            id,
            field_name,
            code
          ),
          species:collection_id!inner(...species(
            id,
            name
          )
        )`)

      if (batchFilter.status === "unprocessed") {
        q = q.is("is_processed", false)
      } else if (batchFilter.status === "processed") {
        q = q.is("is_processed", true)
      }
      if (batchFilter.collectionId) {
        q = q.eq("collection_id", batchFilter.collectionId)
      }
      if (batchFilter.search) {
        q = q.ilike("code", `%${batchFilter.search}%`)
      }
      if (batchFilter.speciesId) {
        q = q.eq("collection_id.species_id", batchFilter.speciesId)
      }
      if (batchFilter.locationId) {
        q = q.eq("current_batch_storage.location_id", batchFilter.locationId)
      }

      const { data, error } = await q
        .order(batchFilter.sort, { ascending: batchFilter.order === "asc" })
        .overrideTypes<
          Array<
            Omit<BatchWithCurrentLocationAndSpecies, "weights"> & {
              original_weight: number
              current_weight: number
            }
          >
        >()

      if (error) throw new Error(error.message)

      // Transform original_weight and current_weight into weights object
      return data.map((batch) => ({
        ...batch,
        weights: {
          original_weight: batch.original_weight,
          current_weight: batch.current_weight,
        },
      })) as BatchWithCurrentLocationAndSpecies[]
    },
  })
}

export const invalidateBatchesByFilterCache = (batchFilter: BatchFilter) => {
  queryClient.invalidateQueries({
    queryKey: ["batches", "byFilter", batchFilter],
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
            organisation:organisation!batch_custody_organisation_id_fkey(name)
          ),
          current_custodian:current_batch_custody(
            organisation_id,
            received_at
          ),
          storage:current_batch_storage(
            *,
            location:storage_locations(name, description)
          ),
          latest_quality_statistics:tests!inner(
            id,
            statistics
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

export const useBatchHistory = (batchId: string) => {
  return useQuery({
    queryKey: ["batches", "history", batchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("batch_lineage")
        .select(`*`)
        .eq("batch_id", batchId)
        .single()

      if (error) throw new Error(error.message)
      return data
    },
  })
}

// Mutation: Split batch
type SplitBatchParams = {
  parentBatchId: string
  weight_grams?: number
  notes?: string
}

export const useBatchSplit = (splitId: string) => {
  return useQuery({
    queryKey: ["batcheSplits", "detail", splitId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("batch_splits")
        .select(
          `
          *,
          parent_batch:batches!batch_splits_parent_batch_id_fkey(id, notes, code, created_at)
        `,
        )
        .eq("id", splitId)
        .single()

      if (error) throw new Error(error.message)
      return data
    },
  })
}

export const useSplitBatch = () => {
  return useMutation<string, Error, SplitBatchParams>({
    mutationFn: async ({ parentBatchId, weight_grams, notes }) => {
      const { data, error } = await supabase.rpc("fn_split_batch", {
        p_parent_batch_id: parentBatchId,
        p_weight_grams: weight_grams || undefined,
        p_notes: notes || undefined,
      })

      if (error) throw new Error(error.message)
      return data as string
    },
    onSuccess: (childBatchId, variables) => {
      // Invalidate all batch queries since we don't have direct access to collection
      queryClient.invalidateQueries({
        queryKey: ["batches"],
      })

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
      // Invalidate all batch queries since we don't have direct access to collection
      queryClient.invalidateQueries({
        queryKey: ["batches"],
      })

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
  weight_grams?: number
  notes?: string
}

export const useUpdateBatch = () => {
  return useMutation<Batch, Error, UpdateBatchParams>({
    mutationFn: async ({ id, ...updateData }) => {
      // Filter out undefined values
      const cleanUpdateData = Object.fromEntries(
        Object.entries(updateData).filter(([_, value]) => value !== undefined),
      )

      const { data, error } = await supabase
        .from("batches")
        .update(cleanUpdateData)
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

      // Invalidate all batch queries
      queryClient.invalidateQueries({
        queryKey: ["batches"],
      })
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

export const useBatchDelete = () => {
  return useMutation<string, Error, string>({
    mutationFn: async (batchId: string) => {
      const { data, error } = await supabase
        .from("batches")
        .delete()
        .eq("id", batchId)
        .select()
        .single()

      if (error) throw new Error(error.message)
      return data?.id ?? null
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["batches"],
      })
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

// Query: Check if a batch can be deleted
// A batch cannot be deleted if it has any relationships in:
// - batch_splits (as parent or child)
// - batch_merges (as merged or source)
// - batch_processing (as input or output)
export const useCanDeleteBatch = (batchId: string) => {
  return useQuery({
    queryKey: ["batches", "canDelete", batchId],
    queryFn: async () => {
      // Check if this batch has been used to create other batches
      // by checking if any other batches reference this as their parent
      const { count: childCount, error: childError } = await supabase
        .from("batch_lineage")
        .select("batch_id", { count: "exact", head: true })
        .eq("parent_batch_id", batchId)

      if (childError) throw new Error(childError.message)

      // Check if this batch is a source in any merges
      const { count: mergeSourceCount, error: mergeError } = await supabase
        .from("batch_merges")
        .select("id", { count: "exact", head: true })
        .eq("source_batch_id", batchId)

      if (mergeError) throw new Error(mergeError.message)

      // A batch can be deleted only if:
      // It hasn't been used to create other batches
      const hasCreatedOtherBatches = Boolean(childCount && childCount > 0)
      const isSourceInMerge = Boolean(mergeSourceCount && mergeSourceCount > 0)

      const canDelete = Boolean(!hasCreatedOtherBatches && !isSourceInMerge)

      return { canDelete }
    },
  })
}
