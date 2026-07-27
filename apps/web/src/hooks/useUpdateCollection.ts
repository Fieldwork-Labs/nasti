import { type Collection } from "@nasti/common/types"

import { supabase } from "@nasti/common/supabase"
import { queryClient } from "@nasti/common/utils"
import { useMutation } from "@tanstack/react-query"

export type MaybeNewCollection = Omit<
  Collection,
  "id" | "created_at" | "code"
> & {
  id?: string
  created_at?: string
  code?: string
}

export type CollectionContainerInput = {
  container_id: string
  amount: number | null
}

export type MaybeNewCollectionWithContainers = MaybeNewCollection & {
  containers: CollectionContainerInput[]
}

// The join rows are edited as a whole set in the form, so bring the stored set
// in line with it: drop the containers that were removed, upsert the rest.
const syncCollectionContainers = async (
  collectionId: string,
  containers: CollectionContainerInput[],
) => {
  const { data: existing, error: existingError } = await supabase
    .from("collection_containers")
    .select("id, container_id")
    .eq("collection_id", collectionId)

  if (existingError) throw new Error(existingError.message)

  const kept = new Set(containers.map(({ container_id }) => container_id))
  const removedIds = (existing ?? [])
    .filter((row) => !kept.has(row.container_id))
    .map((row) => row.id)

  if (removedIds.length > 0) {
    const { error } = await supabase
      .from("collection_containers")
      .delete()
      .in("id", removedIds)
    if (error) throw new Error(error.message)
  }

  if (containers.length > 0) {
    const { error } = await supabase.from("collection_containers").upsert(
      containers.map(({ container_id, amount }) => ({
        collection_id: collectionId,
        container_id,
        amount,
      })),
      { onConflict: "collection_id,container_id" },
    )
    if (error) throw new Error(error.message)
  }
}

const upsertCollection = async ({
  containers,
  ...updatedItem
}: MaybeNewCollectionWithContainers) => {
  const queryBase = supabase.from("collection").upsert(updatedItem)

  const query = updatedItem.id ? queryBase.eq("id", updatedItem.id) : queryBase

  const { data, error } = await query.select("*").single()

  if (error) throw new Error(error.message)
  if (!data) throw new Error("No data returned from collection upsert")

  await syncCollectionContainers(data.id, containers)

  return data as Collection
}

export const useUpdateCollection = () => {
  return useMutation<Collection, unknown, MaybeNewCollectionWithContainers>({
    mutationFn: (updatedItem) => upsertCollection(updatedItem),
    onSuccess: (updatedItem, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["collections", "containers", updatedItem.id],
      })
      queryClient.invalidateQueries({ queryKey: ["containers", "usage"] })

      // Update the individual item cache
      queryClient.setQueryData(
        ["collections", "detail", updatedItem.id],
        updatedItem,
      )

      // Get all existing queries for trip Collections
      const tripQueries = queryClient.getQueriesData({
        queryKey: ["collections", "byTrip", variables.trip_id],
      })
      const speciesQueries = variables.species_id
        ? queryClient.getQueriesData({
            queryKey: ["collections", "bySpecies", variables.species_id],
          })
        : []

      const queries = [...tripQueries, ...speciesQueries]
      // Update each query that exists in cache
      queries.forEach(([queryKey]) => {
        queryClient.setQueryData<Collection[]>(queryKey, (oldData) => {
          if (!oldData || oldData.length === 0) return [updatedItem]

          if (variables.id) {
            return oldData.map((item) =>
              item.id === updatedItem.id ? updatedItem : item,
            )
          } else {
            return [...oldData, updatedItem]
          }
        })
      })
    },
  })
}

const deleteCollection = async (id: string) => {
  const { error, data } = await supabase
    .from("collection")
    .delete()
    .eq("id", id)
    .select("*")
    .single()
  if (error) throw new Error(error.message)
  return data as Collection
}

export const useDeleteCollection = () => {
  return useMutation<Collection, unknown, string>({
    mutationFn: (id) => deleteCollection(id),
    onSuccess: (deletedObject) => {
      // Get all existing queries for trip Collections
      const tripQueries = queryClient.getQueriesData({
        queryKey: ["collections", "byTrip", deletedObject.trip_id],
      })
      const speciesQueries = deletedObject.species_id
        ? queryClient.getQueriesData({
            queryKey: ["collections", "bySpecies", deletedObject.species_id],
          })
        : []

      const queries = [...tripQueries, ...speciesQueries]
      // Update each query that exists in cache
      queries.forEach(([queryKey]) => {
        queryClient.setQueryData<Collection[]>(queryKey, (oldData) => {
          if (!oldData || oldData.length === 0) return []
          return oldData.filter((item) => item.id !== deletedObject.id)
        })
      })
    },
  })
}
