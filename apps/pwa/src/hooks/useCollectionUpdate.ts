import { type Collection } from "@nasti/common/types"

import { supabase } from "@nasti/common/supabase"
import { queryClient } from "@/lib/queryClient"
import { useMutation } from "@tanstack/react-query"
import { TripDetails } from "./useHydrateTripDetails"

const updateCollection = async (updatedItem: Collection) => {
  const query = supabase
    .from("collection")
    .upsert(updatedItem)
    .eq("id", updatedItem.id)

  const { data, error } = await query.select("*").single()

  if (error) throw new Error(error.message)
  if (!data) throw new Error("No data returned from collection upsert")

  return data as Collection
}

export const useCollectionUpdate = () => {
  return useMutation<Collection, unknown, Collection>({
    mutationFn: (updatedItem) => updateCollection(updatedItem),
    onSuccess: (updatedItem, variables) => {
      // Update the individual item cache
      queryClient.setQueryData(
        ["collections", "detail", updatedItem.id],
        updatedItem,
      )

      // Get the trip details data blob
      const tripQuery = queryClient.getQueryData<TripDetails>([
        "trip",
        "details",
        variables.trip_id,
      ])
      if (!tripQuery) throw new Error("Unknown trip")

      tripQuery.collections = tripQuery.collections.map((item) =>
        item.id === updatedItem.id ? { ...item, ...updatedItem } : item,
      )

      queryClient.setQueryData(["trip", "details", variables.trip_id], {
        ...tripQuery,
      })

      if (variables.species_id) {
        queryClient.setQueryData<Collection[]>(
          ["collections", "bySpecies", variables.species_id],
          (oldData) => {
            if (!oldData || oldData.length === 0) return [updatedItem]

            return oldData.map((item) =>
              item.id === updatedItem.id ? updatedItem : item,
            )
          },
        )
      }
    },
  })
}
