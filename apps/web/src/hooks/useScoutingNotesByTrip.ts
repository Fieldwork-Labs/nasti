import { supabase } from "@nasti/common/supabase"
import { ScoutingNote } from "@nasti/common/types"
import { useQuery } from "@tanstack/react-query"

const getScoutingNotesByTrip = async (tripId: string) => {
  const { data, error } = await supabase
    .from("scouting_notes")
    .select("*")
    .eq("trip_id", tripId)
    .overrideTypes<ScoutingNote[]>()

  if (error) throw new Error(error.message)

  return data
}

export const useScoutingNotesByTrip = (tripId: string) => {
  return useQuery({
    queryKey: ["scoutingNotes", "byTrip", tripId],
    queryFn: () => getScoutingNotesByTrip(tripId),
    enabled: Boolean(tripId), // Only run if tripId is present
  })
}
