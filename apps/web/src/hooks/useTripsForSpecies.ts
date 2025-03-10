import { supabase } from "@/lib/supabase"
import { Trip } from "@nasti/common/types"
import { useQuery } from "@tanstack/react-query"

const getTripsForSpecies = async (speciesId: string) => {
  const { data, error } = await supabase
    .from("trip")
    .select(
      `
        id,
        name,
        start_date,
        end_date,
        metadata,
        location_name,
        location_coordinate,
        created_at,
        created_by,
        organisation_id,
        trip_species!inner (
          species_id
        )
      `,
    )
    .eq("trip_species.species_id", speciesId)

  if (error) throw new Error(error.message)

  return data as Array<Trip & { trip_species: { species_id: string }[] }>
}

export const useTripsForSpecies = (speciesId: string) => {
  return useQuery({
    queryKey: ["trips", "forSpecies", speciesId],
    queryFn: () => getTripsForSpecies(speciesId),
    enabled: Boolean(speciesId), // Only run if speciesId is present
  })
}
