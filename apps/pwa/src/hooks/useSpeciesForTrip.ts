import { Species } from "@nasti/common/types"

import { supabase } from "@nasti/common/supabase"
import { useQuery } from "@tanstack/react-query"

const getTripSpecies = async (tripId: string) => {
  const { data, error } = await supabase
    .from("trip_species")
    .select("*, species(*)")
    .eq("trip_id", tripId)
    .overrideTypes<Species[]>()
  if (error) throw new Error(error.message)
  return data?.map((ts) => ts.species) ?? []
}

export const useSpeciesForTrip = (tripId?: string) => {
  return useQuery({
    queryKey: ["species", "byTrip", tripId],
    queryFn: async () => (tripId ? await getTripSpecies(tripId) : null),
    enabled: Boolean(tripId),
  })
}
