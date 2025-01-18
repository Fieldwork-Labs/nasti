import { supabase } from "@/lib/supabase"
import { TripSpecies } from "@/types"

export const getTripSpecies = async (id: string): Promise<TripSpecies[]> => {
  const { data, error } = await supabase
    .from("trip_species")
    .select("*")
    .eq("id", id)

  if (error) throw new Error(error.message)

  return data as TripSpecies[]
}
