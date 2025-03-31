import { CollectionMaybePending, type Collection } from "@nasti/common/types"

import { supabase } from "@nasti/common/supabase"

import { useMutation, useMutationState } from "@tanstack/react-query"
import { TripDetails } from "./useHydrateTripDetails"
import { queryClient } from "@/lib/queryClient"
import { useCallback } from "react"

const createCollection = async (createdItem: Collection) => {
  const query = supabase.from("collection").insert(createdItem)

  const { data, error } = await query.select("*").single()

  if (error) throw new Error(error.message)
  if (!data) throw new Error("No data returned from collection upsert")

  return data as Collection
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

      queryClient.setQueryData(queryKey, {
        ...tripQuery,
        collections: [
          ...tripQuery.collections,
          { ...variable, isPending: true },
        ],
      })
      // TODO - update list for species if implemented
    },
    onSettled: (createdItem) => {
      if (!createdItem) return
      // Update the individual item cache
      queryClient.setQueryData(
        ["collections", "detail", createdItem.id],
        createdItem,
      )

      // Get the trip details data blob
      const queryKey = ["trip", "details", createdItem.trip_id]
      const tripQuery = queryClient.getQueryData<TripDetails>(queryKey)
      if (!tripQuery) throw new Error("Unknown trip")

      queryClient.setQueryData(queryKey, {
        ...tripQuery,
        collections: [
          ...tripQuery.collections.filter((c) => c.id !== createdItem.id),
          createdItem,
        ],
      })

      if (createdItem.species_id) {
        queryClient.setQueryData<Collection[]>(
          ["collections", "bySpecies", createdItem.species_id],
          (oldData) => {
            if (!oldData) return [createdItem]
            return [...oldData, createdItem]
          },
        )
      }
    },
  })

  const isMutating = useMutationState({
    filters: { mutationKey: getMutationKey(tripId) },
  })

  const getIsMutating = useCallback(
    ({ id }: { id: string }) =>
      isMutating.find(
        ({ status, variables, isPaused }) =>
          status === "pending" &&
          !isPaused &&
          (variables as CollectionMaybePending).id === id,
      ),
    [isMutating],
  )

  return { ...mutation, getIsMutating }
}
