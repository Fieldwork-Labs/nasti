import { useMutation, useQuery } from "@tanstack/react-query"
import { supabase } from "@nasti/common/supabase"
import { queryClient } from "@nasti/common/utils"
import type { StorageLocation, BatchStorage, Batch } from "@nasti/common/types"
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
      const { data, error } = await supabase
        .from("storage_locations")
        .select(
          `
          *,
          current_batches:current_batch_storage(
            batch_id,
            stored_at,
            notes,
            batch:batches!current_batch_storage_batch_id_fkey(
              id,
              notes,
              created_at,
              collection_id,
              collection:collection!batches_collection_id_fkey(
                id,
                field_name,
                description,
                species_id,
                species:species(name, indigenous_name),
                trip:trip(id, name, start_date, end_date)
              )
            )
          ),
          storage_history:batch_storage(
            *,
            batch:batches!batch_storage_batch_id_fkey(
              id,
              notes,
              created_at,
              collection:collection!batches_collection_id_fkey(
                field_name,
                species:species(name)
              )
            )
          )
        `,
        )
        .eq("id", locationId)
        .single()

      if (error) throw new Error(error.message)
      return data
    },
  })
}

// Query: Get current storage location for a batch
export const useCurrentBatchStorage = (batchId: string) => {
  return useQuery({
    queryKey: ["batches", "currentStorage", batchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("batch_storage")
        .select(
          `
            *,
            location:storage_locations(id, name, description)
          `,
        )
        .eq("batch_id", batchId)
        .single()

      if (error) {
        // Batch might not be in storage yet
        if (error.code === "PGRST116") return null
        throw new Error(error.message)
      }
      return data
    },
  })
}

// Query: Get complete storage history for a batch
export const useCompleteBatchStorageHistory = (batchId: string) => {
  return useQuery({
    queryKey: ["batches", "storageHistory", batchId],
    queryFn: async () => {
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
        .eq("batch_id", batchId)
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

// Mutation: Move batch to storage location
type MoveBatchToStorageParams = {
  batchId: string
  locationId: string
  notes?: string
  storedAt?: string
}

export const useMoveBatchToStorage = () => {
  return useMutation<BatchStorage, Error, MoveBatchToStorageParams>({
    mutationFn: async ({ batchId, locationId, notes, storedAt }) => {
      // First, mark any current storage as moved out
      const { error: updateError } = await supabase
        .from("batch_storage")
        .update({ moved_out_at: new Date().toISOString() })
        .eq("batch_id", batchId)
        .is("moved_out_at", null)

      if (updateError) throw new Error(updateError.message)

      // Create new storage record
      const { data, error } = await supabase
        .from("batch_storage")
        .insert({
          batch_id: batchId,
          location_id: locationId,
          stored_at: storedAt || new Date().toISOString(),
          notes,
        })
        .select()
        .single()

      if (error) throw new Error(error.message)
      return data as BatchStorage
    },
    onSuccess: (_, variables) => {
      // Invalidate all storage-related caches
      queryClient.invalidateQueries({
        queryKey: ["storageLocations"],
      })

      queryClient.invalidateQueries({
        queryKey: ["batches", "currentStorage", variables.batchId],
      })

      queryClient.invalidateQueries({
        queryKey: ["batches", "storageHistory", variables.batchId],
      })

      queryClient.invalidateQueries({
        queryKey: ["batches", "detail", variables.batchId],
      })
    },
  })
}

// Mutation: Remove batch from storage (mark as moved out)
type RemoveBatchFromStorageParams = {
  batchId: string
  notes?: string
}

export const useRemoveBatchFromStorage = () => {
  return useMutation<BatchStorage, Error, RemoveBatchFromStorageParams>({
    mutationFn: async ({ batchId, notes }) => {
      const { data, error } = await supabase
        .from("batch_storage")
        .update({
          moved_out_at: new Date().toISOString(),
          notes: notes || null,
        })
        .eq("batch_id", batchId)
        .is("moved_out_at", null)
        .select()
        .single()

      if (error) throw new Error(error.message)
      return data as BatchStorage
    },
    onSuccess: (_, variables) => {
      // Invalidate storage caches
      queryClient.invalidateQueries({
        queryKey: ["storageLocations"],
      })

      queryClient.invalidateQueries({
        queryKey: ["batches", "currentStorage", variables.batchId],
      })

      queryClient.invalidateQueries({
        queryKey: ["batches", "storageHistory", variables.batchId],
      })

      queryClient.invalidateQueries({
        queryKey: ["batches", "detail", variables.batchId],
      })
    },
  })
}

// Mutation: Create storage record notes
type CreateStorageRecordParams = {
  locationId: string
  batchId: string
  notes?: string
}

export const useCreateStorageRecord = () => {
  return useMutation<BatchStorage, Error, CreateStorageRecordParams>({
    mutationFn: async ({ locationId, batchId, notes }) => {
      const { data, error } = await supabase
        .from("batch_storage")
        .insert({ notes, location_id: locationId, batch_id: batchId })
        .select()
        .single()

      if (error) throw new Error(error.message)
      return data as BatchStorage
    },
    onSuccess: (created) => {
      // Invalidate related caches
      queryClient.invalidateQueries({
        queryKey: ["storageLocations"],
      })

      queryClient.invalidateQueries({
        queryKey: ["batches", "storageHistory", created.batch_id],
      })

      queryClient.setQueryData<BatchStorage>(
        ["batches", "currentStorage", created.batch_id],
        (oldData) => {
          if (!oldData) return created
          return { ...oldData, ...created }
        },
      )
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
        queryKey: ["batches", "storageHistory", updatedStorage.batch_id],
      })

      queryClient.invalidateQueries({
        queryKey: ["batches", "currentStorage", updatedStorage.batch_id],
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
