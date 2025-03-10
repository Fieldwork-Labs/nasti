import { supabase } from "@/lib/supabase"
import { Collection } from "@nasti/common/types"
import { useQuery } from "@tanstack/react-query"

const getCollectionsBySpecies = async (speciesId: string) => {
  const { data, error } = await supabase
    .from("collection")
    .select("*")
    .eq("species_id", speciesId)

  if (error) throw new Error(error.message)

  return data as Collection[]
}

export const useCollectionsBySpecies = (speciesId: string) => {
  return useQuery({
    queryKey: ["collections", "bySpecies", speciesId],
    queryFn: () => getCollectionsBySpecies(speciesId),
    enabled: Boolean(speciesId),
  })
}
