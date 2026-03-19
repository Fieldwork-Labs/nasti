import {
  ScoutingNoteWithCoordAndPhotos,
  useHydrateTripDetails,
} from "./useHydrateTripDetails"
import { Species } from "@nasti/common/types"
import { useSpeciesList } from "./useSpeciesList"

export type FullScoutingNote = ScoutingNoteWithCoordAndPhotos & {
  species?: Species
}

export const useScoutingNote = ({
  scoutingNoteId,
  tripId,
}: {
  scoutingNoteId: string
  tripId: string
}) => {
  const tripDetails = useHydrateTripDetails({ id: tripId })
  const scoutingNote = tripDetails.data.trip?.scoutingNotes.find(
    (c) => c.id === scoutingNoteId,
  )
  const { data: speciesList } = useSpeciesList()
  const species =
    speciesList?.find((s) => s.id === scoutingNote?.species_id) ?? {}

  return { ...scoutingNote, species } as FullScoutingNote
}
