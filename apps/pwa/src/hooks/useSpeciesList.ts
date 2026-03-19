import { Species } from "@nasti/common/types"

import { supabase } from "@nasti/common/supabase"
import { useQuery } from "@tanstack/react-query"

const getSpeciesList = async () => {
  const { data, error } = await supabase
    .from("species")
    .select("*")
    .overrideTypes<Species[]>()
  if (error) throw new Error(error.message)
  return data
}

export const getSpeciesListQueryOptions = () => ({
  queryKey: ["species", "list"],
  queryFn: async () => await getSpeciesList(),
})

export const useSpeciesList = () => {
  return useQuery(getSpeciesListQueryOptions())
}
