import { type Collection } from "@nasti/common/types"

import { supabase } from "@nasti/common/supabase"

import { useMutation } from "@tanstack/react-query"
import { TripDetails } from "./useHydrateTripDetails"
import { queryClient } from "@/lib/queryClient"

const createCollection = async (createdItem: Collection) => {
  const query = supabase.from("collection").insert(createdItem)

  const { data, error } = await query.select("*").single()

  if (error) throw new Error(error.message)
  if (!data) throw new Error("No data returned from collection upsert")

  return data as Collection
}

export const useCollectionCreate = () => {
  return useMutation<Collection, unknown, Collection>({
    mutationFn: (createdItem) => createCollection(createdItem),
    onSuccess: (createdItem, variables) => {
      // Update the individual item cache
      queryClient.setQueryData(
        ["collections", "detail", createdItem.id],
        createdItem,
      )

      // Get the trip details data blob
      const queryKey = ["trip", "details", variables.trip_id]
      const tripQuery = queryClient.getQueryData<TripDetails>(queryKey)
      if (!tripQuery) throw new Error("Unknown trip")

      queryClient.setQueryData(queryKey, {
        ...tripQuery,
        collections: [...tripQuery.collections, createdItem],
      })

      if (variables.species_id) {
        queryClient.setQueryData<Collection[]>(
          ["collections", "bySpecies", variables.species_id],
          (oldData) => {
            if (!oldData) return [createdItem]
            return [...oldData, createdItem]
          },
        )
      }
    },
  })
}
