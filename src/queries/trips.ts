import { supabase } from "@/lib/supabase"
import { Trip } from "@/types"

export type TripWithCoordinates = Trip & {
  longitude: number
  latitude: number
}

export const getTrips = async (
  orgId: string,
): Promise<TripWithCoordinates[]> => {
  const { data: trips, error } = await supabase
    .rpc("get_trips")
    .eq("organisation_id", orgId)
    .order("created_at", { ascending: false })

  if (error) throw new Error(error.message)

  return trips as TripWithCoordinates[]
}
