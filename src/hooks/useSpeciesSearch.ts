import { useQuery } from "@tanstack/react-query"
import { useCallback } from "react"
import { supabase } from "@/lib/supabase" // Adjust import path as needed
import { Species } from "@/types"

export const useSpeciesSearch = (searchTerm: string = "") => {
  const searchSpecies = useCallback(
    async (term: string): Promise<Species[]> => {
      if (!term.trim()) {
        return []
      }

      const query = supabase
        .from("species")
        .select("*")
        .or(`name.ilike.%${term}%,indigenous_name.ilike.%${term}%`)
        .limit(10)

      const { data, error } = await query

      if (error) {
        throw new Error(error.message)
      }

      return data || []
    },
    [],
  )

  const { data, isLoading, error } = useQuery({
    queryKey: ["speciesSearch", searchTerm],
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
