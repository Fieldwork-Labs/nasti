import {
  ScoutingNote,
  ScoutingNoteWithCoord,
  UpdateScoutingNote,
} from "@nasti/common/types"

import { queryClient } from "@/lib/queryClient"
import { useMutation } from "@tanstack/react-query"
import { getMutationKey } from "./useEntityCreate"
import { psUpdate } from "@/lib/powersync/crud"

const updateScoutingNote = async (updatedItem: UpdateScoutingNote) => {
  await psUpdate(
    "scouting_notes",
    updatedItem.id,
    updatedItem as unknown as Record<string, unknown>,
  )
  return updatedItem as unknown as ScoutingNote
}

export const useScoutingNoteUpdate = ({ tripId }: { tripId: string }) => {
  return useMutation<ScoutingNoteWithCoord, unknown, UpdateScoutingNote>({
    mutationKey: getMutationKey(tripId),
    mutationFn: (updatedItem) => updateScoutingNote(updatedItem),
    onMutate: (variables) => {
      queryClient.setQueryData<ScoutingNoteWithCoord[]>(
        ["scoutingNotes", "byTrip", tripId],
        (current) =>
          current?.map((item) =>
            item.id === variables.id ? { ...item, ...variables } : item,
          ),
      )

      // Update the individual item cache
      queryClient.setQueryData(
        ["scoutingNotes", "detail", variables.id],
        variables,
      )

      if (variables.species_id) {
        queryClient.setQueryData<Array<ScoutingNote | UpdateScoutingNote>>(
          ["scoutingNotes", "bySpecies", variables.species_id],
          (oldData) => {
            if (!oldData) return [variables]

            return oldData.map((item) =>
              item.id === variables.id ? { ...item, ...variables } : item,
            )
          },
        )
      }
    },
    onSettled(_, error, variables) {
      if (error) {
        // remove the scouting note from optmistic cache
        queryClient.setQueryData<ScoutingNoteWithCoord[]>(
          ["scoutingNotes", "byTrip", tripId],
          (current) => current?.filter((item) => item.id !== variables.id),
        )

        queryClient.removeQueries({
          queryKey: ["scoutingNotes", "detail", variables.id],
        })

        if (variables.species_id) {
          queryClient.setQueryData<Array<ScoutingNote | UpdateScoutingNote>>(
            ["scoutingNotes", "bySpecies", variables.species_id],
            (oldData) => {
              return oldData?.filter((item) => item.id !== variables.id) ?? []
            },
          )
        }
      }
    },
  })
}
