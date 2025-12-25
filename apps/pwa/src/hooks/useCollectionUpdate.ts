import {
  CollectionWithCoord,
  UpdateCollection,
  type Collection,
} from "@nasti/common/types"

import { supabase } from "@nasti/common/supabase"
import { queryClient } from "@/lib/queryClient"
import { useMutation } from "@tanstack/react-query"
import { getMutationKey } from "./useEntityCreate"

const updateCollection = async (updatedItem: UpdateCollection) => {
  const query = supabase
    .from("collection")
    .upsert(updatedItem)
    .eq("id", updatedItem.id)

  const { data, error } = await query
    .select("*")
    .single()
    .overrideTypes<Collection>()

  if (error) throw new Error(error.message)
  if (!data) throw new Error("No data returned from collection upsert")

  return data
}

export const useCollectionUpdate = ({ tripId }: { tripId: string }) => {
  return useMutation<Collection, unknown, UpdateCollection>({
    mutationKey: getMutationKey(tripId),
    mutationFn: (updatedItem) => updateCollection(updatedItem),
    onMutate: (variables) => {
      queryClient.setQueryData<CollectionWithCoord[]>(
        ["collections", "byTrip", tripId],
        (current) =>
          current?.map((item) =>
            item.id === variables.id ? { ...item, ...variables } : item,
          ),
      )

      // Update the individual item cache
      queryClient.setQueryData(
        ["collections", "detail", variables.id],
        variables,
      )

      if (variables.species_id) {
        queryClient.setQueryData<Array<Collection | UpdateCollection>>(
          ["collections", "bySpecies", variables.species_id],
          (oldData) => {
            if (!oldData) return [variables]

            return oldData.map((item) =>
              item.id === variables.id ? { ...item, ...variables } : item,
            )
          },
        )
      }
    },
    onSettled(data, error, variables) {
      if (error) {
        // remove the scouting note from optmistic cache
        queryClient.setQueryData<CollectionWithCoord[]>(
          ["collections", "byTrip", tripId],
          (current) => current?.filter((item) => item.id !== variables.id),
        )

        queryClient.removeQueries({
          queryKey: ["collections", "detail", variables.id],
        })

        if (variables.species_id) {
          queryClient.setQueryData<Array<Collection | UpdateCollection>>(
            ["collections", "bySpecies", variables.species_id],
            (oldData) => {
              return oldData?.filter((item) => item.id !== variables.id) ?? []
            },
          )
        }
      }
      if (!data) throw new Error("No data returned from collection insert")
    },
  })
}
