import { type Collection } from "@/types"

import { supabase } from "@/lib/supabase"
import { queryClient } from "@/lib/utils"
import { useMutation } from "@tanstack/react-query"

type MaybeNewCollection = Omit<Collection, "id" | "created_at"> & {
  id?: string
  created_at?: string
}

const upsertCollection = async (updatedItem: MaybeNewCollection) => {
  const queryBase = supabase.from("collection").upsert(updatedItem)

  const query = updatedItem.id ? queryBase.eq("id", updatedItem.id) : queryBase

  const { data, error } = await query.select("*").single()

  if (error) throw new Error(error.message)
  if (!data) throw new Error("No data returned from collection upsert")

  return data as Collection
}

export const useUpdateCollection = () => {
  return useMutation<Collection, unknown, MaybeNewCollection>({
    mutationFn: (updatedItem) => upsertCollection(updatedItem),
    onSuccess: (updatedItem, variables) => {
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
