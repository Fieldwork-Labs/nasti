import { useQuery } from "@tanstack/react-query"
import { useCallback } from "react"
import { supabase } from "@nasti/common/supabase" // Adjust import path as needed
import { Species } from "@nasti/common/types"

export const useSpeciesSearch = (searchTerm: string = "", tripId?: string) => {
  const searchSpecies = useCallback(
    async (term: string): Promise<Species[]> => {
      let query = supabase.from("species").select("*, trip_species!inner(*)")

      if (searchTerm !== "")
        query = query.or(`name.ilike.%${term}%,indigenous_name.ilike.%${term}%`)

      if (tripId) {
        query = query.eq("trip_species.trip_id", tripId)
      }

      const { data, error } = await query.limit(10)

      if (error) {
        throw new Error(error.message)
      }

      return data || []
    },
    [searchTerm, tripId],
  )

  const { data, isLoading, error } = useQuery({
    queryKey: tripId
      ? ["speciesSearch", "byTrip", tripId, searchTerm]
      : ["speciesSearch", searchTerm],
    queryFn: () => searchSpecies(searchTerm),
  })

  return {
    data: data || [],
    isLoading,
    error,
    searchTerm,
  }
}
