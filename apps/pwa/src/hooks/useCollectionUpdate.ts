import {
  CollectionWithCoord,
  UpdateCollection,
  type Collection,
} from "@nasti/common/types"

import { supabase } from "@nasti/common/supabase"
import { queryClient } from "@/lib/queryClient"
import { useMutation } from "@tanstack/react-query"
import { TripDetails } from "./useHydrateTripDetails"
import { parsePostGISPoint } from "@nasti/common/utils"
import { getMutationKey } from "./useCollectionCreate"

const updateCollection = async (updatedItem: UpdateCollection) => {
  const query = supabase
    .from("collection")
    .upsert(updatedItem)
    .eq("id", updatedItem.id)

  const { data, error } = await query.select("*").single()

  if (error) throw new Error(error.message)
  if (!data) throw new Error("No data returned from collection upsert")

  return data as Collection
}

export const useCollectionUpdate = ({ tripId }: { tripId: string }) => {
  return useMutation<Collection, unknown, UpdateCollection>({
    mutationKey: getMutationKey(tripId),
    mutationFn: (updatedItem) => updateCollection(updatedItem),
    onMutate: (variables) => {
      // Get the trip details data blob
      const tripQuery = queryClient.getQueryData<TripDetails>([
        "trip",
        "details",
        variables.trip_id,
      ])
      if (!tripQuery) throw new Error("Unknown trip")

      const newCollections = tripQuery.collections.map((item) =>
        item.id === variables.id ? { ...item, ...variables } : item,
      )

      queryClient.setQueryData(["trip", "details", variables.trip_id], {
        ...tripQuery,
        collections: newCollections,
      })

      // Update the individual item cache
      queryClient.setQueryData(
        ["collections", "detail", variables.id],
        variables,
      )

      if (variables.species_id) {
        queryClient.setQueryData<Array<Collection | UpdateCollection>>(
          ["collections", "bySpecies", variables.species_id],
          (oldData) => {
            if (!oldData || oldData.length === 0) return [variables]

            return oldData.map((item) =>
              item.id === variables.id ? { ...item, ...variables } : item,
            )
          },
        )
      }
    },
    onSettled(data, error, variables) {
      if (error) throw error
      if (!data) throw new Error("No data returned from collection insert")
      // Get the trip details data blob
      const tripQuery = queryClient.getQueryData<TripDetails>([
        "trip",
        "details",
        variables.trip_id,
      ])
      if (!tripQuery) throw new Error("Unknown trip")

      const updatedCollection: CollectionWithCoord = { ...data }
      if (updatedCollection.location) {
        updatedCollection.locationCoord = parsePostGISPoint(
          updatedCollection.location,
        )
      }

      tripQuery.collections = tripQuery.collections.map((item) =>
        item.id === variables.id ? { ...item, ...updatedCollection } : item,
      )

      queryClient.setQueryData(["trip", "details", variables.trip_id], {
        ...tripQuery,
      })
    },
  })
}
