import {
  ScoutingNote,
  ScoutingNoteWithCoord,
  UpdateScoutingNote,
} from "@nasti/common/types"

import { useMutation } from "@tanstack/react-query"
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
    mutationKey: ["scoutingNotes", "update", tripId],
    mutationFn: (updatedItem) => updateScoutingNote(updatedItem),
  })
}
