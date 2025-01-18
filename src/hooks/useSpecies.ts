import { getSpecies } from "@/queries/species"
import { useQuery } from "@tanstack/react-query"

export const useSpecies = (tripSpeciesId: string) => {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["tripSpecies", tripSpeciesId],
    queryFn: async () => {
      if (!tripSpeciesId) {
        throw new Error("Species not found")
      }
      return getSpecies(tripSpeciesId)
    },
    enabled: Boolean(tripSpeciesId),
  })
  return { data, isLoading, isError, error }
}
