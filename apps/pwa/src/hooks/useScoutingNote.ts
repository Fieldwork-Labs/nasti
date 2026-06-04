import { ScoutingNoteWithCoord, Species } from "@nasti/common/types"
import { useSpeciesList } from "./useSpeciesList"
import { useQuery } from "@powersync/tanstack-react-query"
import { parseLocation } from "./useTripDetails/helpers"
import { TripScoutingNotePhotos, usePhotosForTrip } from "./usePhotosForTrip"
import type { PowerSyncScoutingNoteRow } from "@/lib/powersync/schema"
import { rowToScoutingNote } from "@/lib/powersync/rows"
import type { ScoutingNoteWithCoordAndPhotos } from "./useTripDetails/types"

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

const useScoutingNoteQuery = (id: string) => {
  const query = useQuery<PowerSyncScoutingNoteRow>({
    queryKey: ["scoutingNotes", "detail", id],
    query: "SELECT * FROM scouting_notes WHERE id = ?",
    parameters: [id],
    enabled: Boolean(id),
  })
  const row = query.data?.[0]
  const data: ScoutingNoteWithCoord | null = row
    ? parseLocation(rowToScoutingNote(row))
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
  const { data: speciesList } = useSpeciesList()
  const { data: snData } = useScoutingNoteQuery(scoutingNoteId)

  const { data: tripPhotos } = usePhotosForTrip({
    tripId: tripId,
    entityType: "scoutingNote",
  })
  const photos = tripPhotos?.filter(
      (p) => "scouting_notes_id" in p && p.scouting_notes_id === scoutingNoteId,
    ) as TripScoutingNotePhotos | undefined

  const species =
    speciesList?.find((s) => s.id === snData?.species_id) ?? undefined

  const result: FullScoutingNote | undefined = snData
    ? { ...snData, photos: photos ?? [], species }
    : undefined
  return result
}
