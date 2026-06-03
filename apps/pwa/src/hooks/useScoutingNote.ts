import {
  ScoutingNoteWithCoordAndPhotos,
  useHydrateTripDetails,
} from "./useHydrateTripDetails"
import {
  ScoutingNote,
  ScoutingNoteWithCoord,
  Species,
} from "@nasti/common/types"
import { useSpeciesList } from "./useSpeciesList"
import { useQuery } from "@powersync/tanstack-react-query"
import { parseLocation } from "./useTripDetails/helpers"
import { TripScoutingNotePhotos, usePhotosForTrip } from "./usePhotosForTrip"
import type { PowerSyncScoutingNoteRow } from "@/lib/powersync/schema"
import { rowToScoutingNote } from "@/lib/powersync/rows"

export type FullScoutingNote = ScoutingNoteWithCoordAndPhotos & {
  species?: Species
}

export const getScoutingNote = async (id?: string) => {
  if (!id) return null
  const data = await import("@/lib/powersync/db").then(({ powerSyncDb }) =>
    powerSyncDb.getOptional<PowerSyncScoutingNoteRow>(
      "SELECT * FROM scouting_notes WHERE id = ?",
      [id],
    ),
  )

  return data ? rowToScoutingNote(data) : null
}

const useScoutingNoteQuery = (
  id: string,
  placeholder: ScoutingNote | null = null,
  enabled: boolean = true,
) => {
  const query = useQuery<PowerSyncScoutingNoteRow>({
    queryKey: ["scoutingNotes", "detail", id],
    query: "SELECT * FROM scouting_notes WHERE id = ?",
    parameters: [id],
    enabled,
  })
  const row = query.data?.[0]
  const data: ScoutingNoteWithCoord | null = row
    ? parseLocation(rowToScoutingNote(row))
    : placeholder
      ? parseLocation(placeholder)
      : null

  return { ...query, data }
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
  const { data: snData } = useScoutingNoteQuery(
    scoutingNoteId,
    scoutingNote,
    !Boolean(scoutingNote),
  )

  const { data: newPhotos } = usePhotosForTrip({
    tripId: tripId,
    entityType: "scoutingNote",
    enabled: !Boolean(scoutingNote),
  })
  const photos =
    scoutingNote?.photos ??
    (newPhotos?.find(
      (p) => "scouting_notes_id" in p && p.scouting_notes_id === scoutingNoteId,
    ) as unknown as TripScoutingNotePhotos)

  const species =
    speciesList?.find((s) => s.id === snData?.species_id) ?? undefined

  const result: FullScoutingNote | undefined = snData
    ? { ...snData, photos: photos ?? [], species }
    : undefined
  return result
}
