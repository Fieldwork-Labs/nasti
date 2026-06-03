import { type Collection } from "@nasti/common/types"

import { powerSyncDb } from "@/lib/powersync/db"
import { queryClient } from "@/lib/queryClient"
import { useMutation } from "@tanstack/react-query"
import { psDelete } from "@/lib/powersync/crud"
import type { PowerSyncCollectionRow } from "@/lib/powersync/schema"
import { rowToCollection } from "@/lib/powersync/rows"

const deleteCollection = async (id: string) => {
  const row = await powerSyncDb.getOptional<PowerSyncCollectionRow>(
    "SELECT * FROM collection WHERE id = ?",
    [id],
  )
  await psDelete("collection", id)
  return rowToCollection(row ?? ({ id } as PowerSyncCollectionRow))
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
