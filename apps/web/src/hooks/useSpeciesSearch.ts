import { useQuery } from "@tanstack/react-query"
import { useCallback } from "react"
import { supabase } from "@/lib/supabase" // Adjust import path as needed
import { Species } from "@/types"

export const useSpeciesSearch = (searchTerm: string = "", tripId?: string) => {
  const searchSpecies = useCallback(
    async (term: string): Promise<Species[]> => {
      if (!term.trim()) {
        return []
      }

      let query = supabase
        .from("species")
        .select("*, trip_species!inner(*)")
        .or(`name.ilike.%${term}%,indigenous_name.ilike.%${term}%`)

      if (tripId) {
        query = query.eq("trip_species.trip_id", tripId)
      }

      const { data, error } = await query.limit(10)

      if (error) {
        throw new Error(error.message)
      }

      return data || []
    },
    [tripId],
  )

  const { data, isLoading, error } = useQuery({
    queryKey: tripId
      ? ["speciesSearch", searchTerm]
      : ["speciesSearch", "byTrip", tripId, searchTerm],
    queryFn: () => searchSpecies(searchTerm),
    enabled: searchTerm.length > 0,
  })

  return {
    data: data || [],
    isLoading,
    error,
    searchTerm,
  }
}
