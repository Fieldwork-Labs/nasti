import {
  CollectionWithCoord,
  NewCollection,
  type Collection,
} from "@nasti/common/types"

import { supabase } from "@nasti/common/supabase"

import { useMutation, useMutationState } from "@tanstack/react-query"
import { TripDetails } from "./useHydrateTripDetails"
import { queryClient } from "@/lib/queryClient"
import { useCallback } from "react"
import { parsePostGISPoint } from "@nasti/common/utils"

const createCollection = async (createdItem: NewCollection) => {
  const query = supabase.from("collection").insert(createdItem)

  const { data: collection, error } = await query
    .select("*")
    .single()
    .overrideTypes<Collection>()

  if (error) throw new Error(error.message)
  if (!collection) throw new Error("No data returned from collection upsert")

  return collection
}

export const getMutationKey = (tripId?: string) => ["createCollection", tripId]

export const useCollectionCreate = ({ tripId }: { tripId: string }) => {
  const mutation = useMutation<Collection, unknown, NewCollection>({
    mutationKey: getMutationKey(tripId),
    mutationFn: (createdItem) => createCollection(createdItem),
    onMutate: (variable) => {
      // Get the trip details data blob
      const queryKey = ["trip", "details", variable.trip_id]
      const tripQuery = queryClient.getQueryData<TripDetails>(queryKey)
      if (!tripQuery) throw new Error("Unknown trip")
      type InsertCollectionWithCoord = NewCollection & {
        locationCoord?: { latitude: number; longitude: number }
      }
      const pendingCollection: InsertCollectionWithCoord = { ...variable }

      if (variable.location) {
        const innerString = variable.location.substring(
          7,
          variable.location.length - 1,
        )
        const [lng, lat] = innerString.split(" ")
        pendingCollection.locationCoord = {
          latitude: parseFloat(lat),
          longitude: parseFloat(lng),
        }
      }

      queryClient.setQueryData(queryKey, {
        ...tripQuery,
        collections: [...tripQuery.collections, pendingCollection],
      })

      // Update the individual item cache
      queryClient.setQueryData(
        ["collections", "detail", variable.id],
        pendingCollection,
      )

      if (variable.species_id) {
        queryClient.setQueryData<Array<Collection | NewCollection>>(
          ["collections", "bySpecies", pendingCollection.species_id],
          (oldData) => {
            if (!oldData) return [pendingCollection]
            return [...oldData, pendingCollection]
          },
        )
      }
    },
    onSettled(data, error, variables) {
      if (error) throw error
      if (!data) throw new Error("No data returned from collection insert")
      // Get the trip details data blob
      const queryKey = ["trip", "details", variables.trip_id]
      const tripQuery = queryClient.getQueryData<TripDetails>(queryKey)
      if (!tripQuery) throw new Error("Unknown trip")

      const newCollection: CollectionWithCoord = { ...data }
      if (newCollection.location) {
        newCollection.locationCoord = parsePostGISPoint(newCollection.location)
      }

      queryClient.setQueryData(queryKey, {
        ...tripQuery,
        collections: [
          ...tripQuery.collections.filter((c) => c.id !== newCollection.id),
          newCollection,
        ],
      })

      if (data.species_id) {
        queryClient.setQueryData<Collection[]>(
          ["collections", "bySpecies", data.species_id],
          (oldData) => {
            if (!oldData) return [newCollection]
            return [
              ...oldData.filter((c) => c.id !== newCollection.id),
              newCollection,
            ]
          },
        )
      }
    },
  })

  const isMutating = useMutationState({
    filters: {
      mutationKey: getMutationKey(tripId),
      status: "pending",
      predicate: ({ state }) => !state.isPaused,
    },
  })

  /*
   * function getIsMutating
   * Returns a function that returns whether a collection is currently being mutated (ie, in process of uploading to server)
   * @param id - The id of the collection to check
   * @param includeChildren - Whether to include photo mutations in the check
   */
  const getIsMutating = useCallback(
    ({ id, includeChildren }: { id: string; includeChildren?: boolean }) => {
      const isItemMutating = isMutating.find(
        ({ variables }) => (variables as Collection).id === id,
      )
      if (includeChildren) {
        const photos = queryClient.getMutationCache().findAll({
          mutationKey: ["collectionPhotos", "create", id],
          status: "pending",
          predicate: ({ state }) => !state.isPaused,
        })
        return isItemMutating || (photos && photos.length > 0)
      }
      return isItemMutating
    },
    [isMutating],
  )
  /*
   * function getIsPending
   * Returns a function that returns whether a collection is pending update (ie, will upload to server on network availability)
   * @param id - The id of the collection to check
   */
  const getIsPending = useCallback(
    ({ id }: { id: string }) =>
      isMutating.find(({ variables }) => (variables as Collection).id === id),
    [isMutating],
  )

  return { ...mutation, getIsMutating, getIsPending }
}
