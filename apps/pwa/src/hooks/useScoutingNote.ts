import {
  ScoutingNoteWithCoordAndPhotos,
  useHydrateTripDetails,
} from "./useHydrateTripDetails"
import { ScoutingNote, Species } from "@nasti/common/types"
import { useSpeciesList } from "./useSpeciesList"
import { supabase } from "@nasti/common/supabase"
import { useQuery } from "@tanstack/react-query"
import { parseLocation } from "./useTripDetails/helpers"
import { TripScoutingNotePhotos, usePhotosForTrip } from "./usePhotosForTrip"

export type FullScoutingNote = ScoutingNoteWithCoordAndPhotos & {
  species?: Species
}

export const getScoutingNote = async (id?: string) => {
  if (!id) return null
  const { data, error } = await supabase
    .from("scouting_notes")
    .select("*")
    .eq("id", id)
    .maybeSingle()
    .overrideTypes<ScoutingNote>()

  if (error) throw new Error(error.message)
  if (!data) throw new Error("No data returned from scoutingNote upsert")

  return data
}

const useScoutingNoteQuery = (
  id: string,
  placeholder: ScoutingNote | null = null,
  enabled: boolean = true,
) => {
  return useQuery({
    queryKey: ["scoutingNotes", "detail", id],
    queryFn: () => getScoutingNote(id),
    enabled,
    refetchOnMount: true,
    refetchOnReconnect: true,
    select(data) {
      return data ? parseLocation(data) : null
    },
    initialData: placeholder,
    placeholderData: placeholder,
  })
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

  const result = snData ? { ...snData, photos, species } : undefined
  return result
}
