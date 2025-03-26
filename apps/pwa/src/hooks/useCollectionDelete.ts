import { type Collection } from "@nasti/common/types"

import { supabase } from "@nasti/common/supabase"
import { queryClient } from "@/lib/queryClient"
import { useMutation } from "@tanstack/react-query"

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

export const useCollectionDelete = () => {
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
