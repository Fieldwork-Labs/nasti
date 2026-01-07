import { Species } from "@nasti/common/types"

import { supabase } from "@nasti/common/supabase"
import { useQuery } from "@tanstack/react-query"

const getSpecies = async (speciesId: string) => {
  const { data, error } = await supabase
    .from("species")
    .select("*")
    .eq("id", speciesId)
    .maybeSingle()
    .overrideTypes<Species>()
  if (error) throw new Error(error.message)
  return data
}

export const useSpecies = (speciesId?: string) => {
  return useQuery({
    queryKey: ["species", "byIds", [speciesId]],
    queryFn: async () => (speciesId ? await getSpecies(speciesId) : null),
    enabled: Boolean(speciesId),
  })
}
