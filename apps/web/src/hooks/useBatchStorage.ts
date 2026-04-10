import { useMutation, useQuery } from "@tanstack/react-query"
import { supabase } from "@nasti/common/supabase"
import { queryClient } from "@nasti/common/utils"
import {
  type StorageLocation,
  type BatchStorage,
  type Batch,
  CurrentBatchStorage,
} from "@nasti/common/types"
import useUserStore from "@/store/userStore"

// Extended types for storage with related data
export type StorageLocationWithBatches = StorageLocation & {
  current_batches: Array<{
    batch_id: string
    stored_at: string
    notes: string | null
    batch: Batch & {
      collection: {
        id: string
        field_name: string | null
        species: { name: string } | null
      }
    }
  }>
  batch_count: number
}

export type BatchStorageWithLocation = BatchStorage & {
  location: StorageLocation
}

// Query: Get detailed view of a storage location
export const useStorageLocations = () => {
  return useQuery({
    queryKey: ["storageLocations", "list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("storage_locations")
        .select(`*`)

      if (error) throw new Error(error.message)
      return data
    },
  })
}

// Query: Get detailed view of a storage location
export const useStorageLocationDetail = (locationId: string) => {
  return useQuery({
    queryKey: ["storageLocations", "detail", locationId],
    queryFn: async () => {
      // Fetch location and current batches stored here (via view)
      const { data: location, error: locError } = await supabase
        .from("storage_locations")
        .select("*")
        .eq("id", locationId)
        .single()

      if (locError) throw new Error(locError.message)

      // Fetch current batches via the view
      const { data: currentSubBatches, error: cbError } = await supabase
        .from("current_batch_storage")
        .select("*")
        .eq("location_id", locationId)
        .overrideTypes<CurrentBatchStorage[]>()

      if (cbError) throw new Error(cbError.message)

      // Fetch batch details for current batches
      const subBatchIds = [
        ...new Set((currentSubBatches ?? []).map((cb) => cb.sub_batch_id)),
      ]
      const { data: subBatches } = subBatchIds.length
        ? await supabase
            .from("sub_batches")
            .select(
              `
              *,batch:batches(*)
            `,
            )
            .in("id", subBatchIds)
        : { data: [] }

      const subBatchMap = new Map((subBatches ?? []).map((b) => [b.id, b]))

      // Fetch storage history
      const { data: storageHistory, error: shError } = await supabase
        .from("batch_storage")
        .select(
          `
          *,
          location:storage_locations!batch_storage_location_id_fkey(
            id, name, description
          ),
          sub_batch:sub_batches(batch_id)
        `,
        )
        .eq("location_id", locationId)
        .order("stored_at", { ascending: false })

      if (shError) throw new Error(shError.message)

      return {
        ...location,
        current_sub_batches: (currentSubBatches ?? []).map((cb) => ({
          ...cb,
          subBatch: subBatchMap.get(cb.sub_batch_id) ?? null,
        })),
        storage_history: storageHistory ?? [],
      }
    },
  })
}

// Query: Get current storage location for a batch (via current_batch_storage view)
export const useCurrentBatchStorage = (batchId: string) => {
  return useQuery({
    queryKey: ["subBatches", "currentStorage", batchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("current_batch_storage")
        .select(
          `
          *,
          location:storage_locations(id, name, description)
          `,
        )
        .eq("batch_id", batchId)
        .limit(1)
        .maybeSingle()

      if (error) {
        // Batch might not have a storage record
        if (error.code === "PGRST116") return null
        throw new Error(error.message)
      }
      return data
    },
  })
}

// Query: Get complete storage history for a batch (via sub_batches)
export const useCompleteBatchStorageHistory = (batchId: string) => {
  return useQuery({
    queryKey: ["subBatches", "storageHistory", batchId],
    queryFn: async () => {
      // Get all sub-batch IDs for this batch
      const { data: subBatches, error: sbError } = await supabase
        .from("sub_batches")
        .select("id")
        .eq("batch_id", batchId)

      if (sbError) throw new Error(sbError.message)
      if (!subBatches?.length) return []

      const subBatchIds = subBatches.map((sb) => sb.id)

      const { data, error } = await supabase
        .from("batch_storage")
        .select(
          `
          *,
          location:storage_locations!batch_storage_location_id_fkey(
            id,
            name,
            description
          )
        `,
        )
        .in("sub_batch_id", subBatchIds)
        .order("stored_at", { ascending: false })

      if (error) throw new Error(error.message)
      return data as BatchStorageWithLocation[]
    },
  })
}

// Mutation: Create new storage location
type CreateStorageLocationParams = {
  name: string
  description?: string
}

export const useCreateStorageLocation = () => {
  const { organisation } = useUserStore()

  return useMutation<StorageLocation, Error, CreateStorageLocationParams>({
    mutationFn: async ({ name, description }) => {
      if (!organisation?.id) throw new Error("No organisation found")

      const { data, error } = await supabase
        .from("storage_locations")
        .insert({
          name,
          description,
          organisation_id: organisation.id,
        })
        .select()
        .single()

      if (error) throw new Error(error.message)
      return data as StorageLocation
    },
    onSuccess: (newLocation) => {
      // Invalidate storage locations list
      queryClient.invalidateQueries({
        queryKey: ["storageLocations"],
      })

      // Set initial data for the new location detail
      queryClient.setQueryData(["storageLocations", "detail", newLocation.id], {
        ...newLocation,
        current_batches: [],
        storage_history: [],
      })
    },
  })
}

// Mutation: Update storage location
type UpdateStorageLocationParams = {
  id: string
  name?: string
  description?: string
}

export const useUpdateStorageLocation = () => {
  return useMutation<StorageLocation, Error, UpdateStorageLocationParams>({
    mutationFn: async ({ id, name, description }) => {
      const updates: UpdateStorageLocationParams = { id }
      if (name !== undefined) updates.name = name
      if (description !== undefined) updates.description = description

      const { data, error } = await supabase
        .from("storage_locations")
        .update(updates)
        .eq("id", id)
        .select()
        .single()

      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: (updatedLocation) => {
      // Invalidate and update caches
      queryClient.invalidateQueries({
        queryKey: ["storageLocations"],
      })

      // Update detail cache
      queryClient.setQueryData<StorageLocation>(
        ["storageLocations", "detail", updatedLocation.id],
        (oldData) => ({
          ...oldData,
          ...updatedLocation,
        }),
      )
    },
  })
}

// Mutation: Delete storage location
export const useDeleteStorageLocation = () => {
  return useMutation<StorageLocation, Error, string>({
    mutationFn: async (locationId) => {
      // First check if there are any batches currently stored here
      const { data: currentBatches } = await supabase
        .from("current_batch_storage")
        .select("batch_id")
        .eq("location_id", locationId)

      if (currentBatches && currentBatches.length > 0) {
        throw new Error(
          `Cannot delete storage location: ${currentBatches.length} batch(es) currently stored here`,
        )
      }

      const { data, error } = await supabase
        .from("storage_locations")
        .delete()
        .eq("id", locationId)
        .select()
        .single()

      if (error) throw new Error(error.message)
      return data as StorageLocation
    },
    onSuccess: (deletedLocation) => {
      // Remove from caches
      queryClient.invalidateQueries({
        queryKey: ["storageLocations"],
      })

      // Remove detail cache
      queryClient.removeQueries({
        queryKey: ["storageLocations", "detail", deletedLocation.id],
      })
    },
  })
}

// Mutation: Move a sub-batch to a storage location
type MoveBatchToStorageParams = {
  batchId: string
  subBatchId: string
  currentBatchStorageId?: string
  locationId: string
  notes?: string
  storedAt?: string
}

export const useMoveBatchToStorage = () => {
  return useMutation<BatchStorage, Error, MoveBatchToStorageParams>({
    mutationFn: async ({
      subBatchId,
      currentBatchStorageId,
      locationId,
      notes,
      storedAt,
    }) => {
      const timestamp = new Date().toISOString()

      if (currentBatchStorageId) {
        // First, mark any current storage as moved out
        const { error: updateError } = await supabase
          .from("batch_storage")
          .update({ moved_out_at: timestamp })
          .eq("id", currentBatchStorageId)
          .is("moved_out_at", null)

        if (updateError) throw new Error(updateError.message)
      }

      // Create new storage record linked to sub-batch
      const { data, error } = await supabase
        .from("batch_storage")
        .insert({
          sub_batch_id: subBatchId,
          location_id: locationId,
          stored_at: storedAt || timestamp,
          notes,
        })
        .select()
        .single()
        .overrideTypes<BatchStorage>()

      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["subBatches", "currentStorage", variables.batchId],
      })

      queryClient.invalidateQueries({
        queryKey: ["subBatches", "storageHistory", variables.batchId],
      })

      queryClient.invalidateQueries({
        queryKey: ["batches", "detail", variables.batchId],
      })

      queryClient.invalidateQueries({
        queryKey: ["subBatches", variables.batchId],
      })
    },
  })
}

// Mutation: Remove batch from storage (mark as moved out)
type RemoveBatchFromStorageParams = {
  batchStorageId: string
  batchId: string // used for cache invalidation
  notes?: string
}

export const useRemoveBatchFromStorage = () => {
  return useMutation<BatchStorage, Error, RemoveBatchFromStorageParams>({
    mutationFn: async ({ batchStorageId, notes }) => {
      const { data, error } = await supabase
        .from("batch_storage")
        .update({
          moved_out_at: new Date().toISOString(),
          notes: notes || null,
        })
        .eq("id", batchStorageId)
        .is("moved_out_at", null)
        .select()
        .single()
        .overrideTypes<BatchStorage>()

      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: (_, { batchId }) => {
      queryClient.invalidateQueries({
        queryKey: ["subBatches", "currentStorage", batchId],
      })

      queryClient.invalidateQueries({
        queryKey: ["subBatches", "storageHistory", batchId],
      })

      queryClient.invalidateQueries({
        queryKey: ["batches", "detail", batchId],
      })

      queryClient.invalidateQueries({
        queryKey: ["subBatches", batchId],
      })
    },
  })
}

// Mutation: Create storage record
type CreateStorageRecordParams = {
  locationId: string
  subBatchId: string
  batchId: string // used for cache invalidation only
  notes?: string
}

export const useCreateStorageRecord = () => {
  return useMutation<BatchStorage, Error, CreateStorageRecordParams>({
    mutationFn: async ({ locationId, subBatchId, notes }) => {
      const { data, error } = await supabase
        .from("batch_storage")
        .insert({
          notes,
          location_id: locationId,
          sub_batch_id: subBatchId,
        })
        .select()
        .single()

      if (error) throw new Error(error.message)
      return data as BatchStorage
    },
    onSuccess: (_, variables) => {
      // Invalidate related caches
      queryClient.invalidateQueries({
        queryKey: ["storageLocations"],
      })

      queryClient.invalidateQueries({
        queryKey: ["subBatches", "storageHistory", variables.batchId],
      })

      queryClient.invalidateQueries({
        queryKey: ["subBatches", "currentStorage", variables.batchId],
      })
    },
  })
}
// Mutation: Update storage record notes
type UpdateStorageRecordParams = {
  storageId: string
  locationId?: string
  notes?: string
}

export const useUpdateStorageRecord = () => {
  return useMutation<BatchStorage, Error, UpdateStorageRecordParams>({
    mutationFn: async ({ storageId, locationId, notes }) => {
      const { data, error } = await supabase
        .from("batch_storage")
        .update({ notes, location_id: locationId })
        .eq("id", storageId)
        .select()
        .single()

      if (error) throw new Error(error.message)
      return data as BatchStorage
    },
    onSuccess: (updatedStorage) => {
      // Invalidate related caches
      queryClient.invalidateQueries({
        queryKey: ["storageLocations"],
      })

      queryClient.invalidateQueries({
        queryKey: ["subBatches", "storageHistory", updatedStorage.sub_batch_id],
      })

      queryClient.invalidateQueries({
        queryKey: ["subBatches", "currentStorage", updatedStorage.sub_batch_id],
      })
    },
  })
}

// Query: Get batches without current storage location
export const useBatchesWithoutStorage = () => {
  return useQuery({
    queryKey: ["batches", "withoutStorage"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("batches")
        .select(
          `
          *,
          collection:collection!batches_collection_id_fkey(
            id,
            field_name,
            species:species(name)
          )
        `,
        )
        .not(
          "id",
          "in",
          `(
          SELECT batch_id 
          FROM current_batch_storage 
          WHERE moved_out_at IS NULL
        )`,
        )
        .order("created_at", { ascending: false })

      if (error) throw new Error(error.message)
      return data
    },
  })
}

// Utility function to get storage summary statistics
export const useStorageSummary = () => {
  return useQuery({
    queryKey: ["storage", "summary"],
    queryFn: async () => {
      const [locationsResult, batchesResult, unstored] = await Promise.all([
        // Count total storage locations
        supabase.from("storage_locations").select("id", { count: "exact" }),

        // Count total stored batches
        supabase
          .from("current_batch_storage")
          .select("batch_id", { count: "exact" }),

        // Count batches without storage
        supabase
          .from("batches")
          .select("id")
          .not(
            "id",
            "in",
            `(
            SELECT batch_id 
            FROM current_batch_storage
          )`,
          ),
      ])

      if (locationsResult.error) throw new Error(locationsResult.error.message)
      if (batchesResult.error) throw new Error(batchesResult.error.message)
      if (unstored.error) throw new Error(unstored.error.message)

      return {
        totalLocations: locationsResult.count || 0,
        totalStoredBatches: batchesResult.count || 0,
        unstoredBatches: unstored.data?.length || 0,
        totalBatches: (batchesResult.count || 0) + (unstored.data?.length || 0),
      }
    },
  })
}
