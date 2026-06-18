import { ScoutingNoteWithCoord, Species } from "@nasti/common/types"
import { useQuery } from "@/lib/powersync/query"
import { parseLocation } from "./useTripDetails/helpers"
import { TripScoutingNotePhotos } from "./usePhotosForTrip"
import type {
  PowerSyncScoutingNotePhotoRow,
  PowerSyncScoutingNoteRow,
  PowerSyncSpeciesRow,
} from "@/lib/powersync/schema"
import { rowToScoutingNote, rowToSpecies } from "@/lib/powersync/rows"
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

const useScoutingNotePhotosQuery = (scoutingNoteId: string) => {
  const query = useQuery<PowerSyncScoutingNotePhotoRow>({
    queryKey: ["photos", "scoutingNote", "byScoutingNote", scoutingNoteId],
    query:
      "SELECT * FROM scouting_notes_photos WHERE scouting_notes_id = ? ORDER BY uploaded_at DESC",
    parameters: [scoutingNoteId],
    enabled: Boolean(scoutingNoteId),
  })

  return {
    ...query,
    data: query.data as TripScoutingNotePhotos | undefined,
  }
}

const useScoutingNoteSpeciesQuery = (speciesId?: string | null) => {
  const query = useQuery<PowerSyncSpeciesRow>({
    queryKey: ["species", "detail", speciesId],
    query: "SELECT * FROM species WHERE id = ?",
    parameters: [speciesId ?? ""],
    enabled: Boolean(speciesId),
  })

  const row = query.data?.[0]
  return { ...query, data: row ? rowToSpecies(row) : undefined }
}

export const useScoutingNote = ({
  scoutingNoteId,
}: {
  scoutingNoteId: string
}) => {
  const { data: snData } = useScoutingNoteQuery(scoutingNoteId)
  const { data: photos } = useScoutingNotePhotosQuery(scoutingNoteId)
  const { data: species } = useScoutingNoteSpeciesQuery(snData?.species_id)

  const result: FullScoutingNote | undefined = snData
    ? { ...snData, photos: photos ?? [], species }
    : undefined
  return result
}
