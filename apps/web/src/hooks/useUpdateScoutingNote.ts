import { type ScoutingNote } from "@nasti/common/types"

import { supabase } from "@nasti/common/supabase"
import { queryClient } from "@nasti/common/utils"
import { useMutation } from "@tanstack/react-query"

type MaybeNewScoutingNote = Omit<ScoutingNote, "id" | "created_at"> & {
  id?: string
  created_at?: string
}

const upsertScoutingNote = async (updatedItem: MaybeNewScoutingNote) => {
  const queryBase = supabase.from("scouting_notes").upsert(updatedItem)

  const query = updatedItem.id ? queryBase.eq("id", updatedItem.id) : queryBase

  const { data, error } = await query.select("*").single()

  if (error) throw new Error(error.message)
  if (!data) throw new Error("No data returned from scouting note upsert")

  return data as ScoutingNote
}

export const useUpdateScoutingNote = () => {
  return useMutation<ScoutingNote, unknown, MaybeNewScoutingNote>({
    mutationFn: (updatedItem) => upsertScoutingNote(updatedItem),
    onSuccess: (updatedItem, variables) => {
      // Update the individual item cache
      queryClient.setQueryData(
        ["scoutingNotes", "detail", updatedItem.id],
        updatedItem,
      )

      // Get all existing queries for trip ScoutingNotes
      const tripQueries = queryClient.getQueriesData({
        queryKey: ["scoutingNotes", "byTrip", variables.trip_id],
      })
      const speciesQueries = variables.species_id
        ? queryClient.getQueriesData({
            queryKey: ["scoutingNotes", "bySpecies", variables.species_id],
          })
        : []

      const queries = [...tripQueries, ...speciesQueries]
      // Update each query that exists in cache
      queries.forEach(([queryKey]) => {
        queryClient.setQueryData<ScoutingNote[]>(queryKey, (oldData) => {
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

const deleteScoutingNote = async (id: string) => {
  const { error, data } = await supabase
    .from("scouting_notes")
    .delete()
    .eq("id", id)
    .select("*")
    .single()
  if (error) throw new Error(error.message)
  return data as ScoutingNote
}

export const useDeleteScoutingNote = () => {
  return useMutation<ScoutingNote, unknown, string>({
    mutationFn: (id) => deleteScoutingNote(id),
    onSuccess: (deletedObject) => {
      // Get all existing queries for trip ScoutingNotes
      const tripQueries = queryClient.getQueriesData({
        queryKey: ["scoutingNotes", "byTrip", deletedObject.trip_id],
      })
      const speciesQueries = deletedObject.species_id
        ? queryClient.getQueriesData({
            queryKey: ["scoutingNotes", "bySpecies", deletedObject.species_id],
          })
        : []

      const queries = [...tripQueries, ...speciesQueries]
      // Update each query that exists in cache
      queries.forEach(([queryKey]) => {
        queryClient.setQueryData<ScoutingNote[]>(queryKey, (oldData) => {
          if (!oldData || oldData.length === 0) return []
          return oldData.filter((item) => item.id !== deletedObject.id)
        })
      })
    },
  })
}
