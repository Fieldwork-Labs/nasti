import { supabase } from "@/lib/supabase"
import { Trip } from "@nasti/common/types"

export const getTrips = async (orgId: string): Promise<Trip[]> => {
  const { data: trips, error } = await supabase
    .from("trip")
    .select("*")
    .eq("organisation_id", orgId)
    .order("created_at", { ascending: false })

  if (error) throw new Error(error.message)

  return trips as Trip[]
}
