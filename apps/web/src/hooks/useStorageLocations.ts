import { useMutation, useQuery } from "@tanstack/react-query"
import { supabase } from "@nasti/common/supabase"
import { queryClient } from "@nasti/common/utils"
import type { StorageLocation, BatchStorage } from "@nasti/common/types"
import useUserStore from "@/store/userStore"

// Query: Get all storage locations for the user's organization
export const useStorageLocations = () => {
  return useQuery({
    queryKey: ["storageLocations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("storage_locations")
        .select("*")
        .order("name")
        .overrideTypes<StorageLocation[]>()

      if (error) throw new Error(error.message)
      return data
    },
  })
}

// Query: Get storage location details
export const useStorageLocation = (locationId: string) => {
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
            batch:batches(
              id,
              notes,
              created_at,
              collection:collection(
                id,
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

// Mutation: Create storage location
type CreateStorageLocationParams = {
  name: string
  description?: string
}

export const useCreateStorageLocation = () => {
  const { organisation } = useUserStore()
  return useMutation<StorageLocation, Error, CreateStorageLocationParams>({
    mutationFn: async ({ name, description }) => {
      if (!organisation) throw new Error("No organisation ID found")
      const { data, error } = await supabase
        .from("storage_locations")
        .insert({ name, description, organisation_id: organisation.id })
        .select()
        .single()

      if (error) throw new Error(error.message)
      return data as StorageLocation
    },
    onSuccess: (newLocation) => {
      // Add to cache
      queryClient.setQueryData<StorageLocation[]>(
        ["storageLocations"],
        (oldData) => {
          if (!oldData) return [newLocation]
          return [...oldData, newLocation].sort((a, b) =>
            a.name.localeCompare(b.name),
          )
        },
      )
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
      const { data, error } = await supabase
        .from("storage_locations")
        .update({ name, description })
        .eq("id", id)
        .select()
        .single()

      if (error) throw new Error(error.message)
      return data as StorageLocation
    },
    onSuccess: (updatedLocation) => {
      // Update in list cache
      queryClient.setQueryData<StorageLocation[]>(
        ["storageLocations"],
        (oldData) => {
          if (!oldData) return [updatedLocation]
          return oldData.map((location) =>
            location.id === updatedLocation.id ? updatedLocation : location,
          )
        },
      )

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

// Query: Get batch storage history
export const useBatchStorageHistory = (batchId: string) => {
  return useQuery({
    queryKey: ["batches", "storage", batchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("batch_storage")
        .select(
          `
          *,
          location:storage_locations(name, description)
        `,
        )
        .eq("batch_id", batchId)
        .order("stored_at", { ascending: false })

      if (error) throw new Error(error.message)
      return data as (BatchStorage & {
        location: { name: string; description: string | null }
      })[]
    },
  })
}
