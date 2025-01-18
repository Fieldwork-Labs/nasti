import { supabase } from "@/lib/supabase"
import { Species } from "@/types"
import { getTripSpecies } from "./tripspecies"

export const getSpecies = async (tripSpeciesId: string): Promise<Species[]> => {
  const speciesId = await getTripSpecies(tripSpeciesId)
  const { data, error } = await supabase
    .from("species")
    .select("*")
    .eq(
      "id",
      speciesId.map((id) => id.species_id),
    )

  if (error) throw new Error(error.message)

  return data as Species[]
}
