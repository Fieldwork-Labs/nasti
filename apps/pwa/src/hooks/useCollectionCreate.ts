import { CollectionWithCoord, type Collection } from "@nasti/common/types"

import { supabase } from "@nasti/common/supabase"

import { useMutation, useMutationState } from "@tanstack/react-query"
import { TripDetails } from "./useHydrateTripDetails"
import { queryClient } from "@/lib/queryClient"
import { useCallback } from "react"
import { parsePostGISPoint } from "@nasti/common/utils"

const createCollection = async (createdItem: Collection) => {
  const query = supabase.from("collection").insert(createdItem)

  const { data, error } = await query.select("*").single()

  if (error) throw new Error(error.message)
  if (!data) throw new Error("No data returned from collection upsert")

  const collection = data as Collection

  return collection
}

export const getMutationKey = (tripId?: string) => ["createCollection", tripId]

export const useCollectionCreate = ({ tripId }: { tripId: string }) => {
  const mutation = useMutation<Collection, unknown, Collection>({
    mutationKey: getMutationKey(tripId),
    mutationFn: (createdItem) => createCollection(createdItem),
    onMutate: (variable) => {
      // Get the trip details data blob
      const queryKey = ["trip", "details", variable.trip_id]
      const tripQuery = queryClient.getQueryData<TripDetails>(queryKey)
      if (!tripQuery) throw new Error("Unknown trip")

      const pendingCollection: CollectionWithCoord = { ...variable }

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
        queryClient.setQueryData<Collection[]>(
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
    filters: { mutationKey: getMutationKey(tripId), status: "pending" },
  })

  /*
   * function getIsMutating
   * Returns a function that returns whether a collection is currently being mutated (ie, in process of uploading to server)
   * @param id - The id of the collection to check
   */
  const getIsMutating = useCallback(
    ({ id }: { id: string }) =>
      isMutating.find(
        ({ variables, isPaused }) =>
          !isPaused && (variables as Collection).id === id,
      ),
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
