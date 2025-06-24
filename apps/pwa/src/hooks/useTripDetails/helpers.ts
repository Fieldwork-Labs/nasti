import { supabase } from "@nasti/common/supabase"
import { Collection, CollectionWithCoord } from "@nasti/common/types"
import { parsePostGISPoint } from "@nasti/common/utils"

export const getTrip = (tripId: string) =>
  supabase.from("trip").select("*").eq("id", tripId).single()

export const getTripSpecies = (tripId: string) =>
  supabase.from("trip_species").select("*").eq("trip_id", tripId)

export const getTripMembers = (tripId: string) =>
  supabase.from("trip_member").select("*").eq("trip_id", tripId)

export const getTripCollections = (tripId: string) =>
  supabase
    .from("collection")
    .select("*")
    .eq("trip_id", tripId)
    .order("created_at", { ascending: false })

export function parseLocation(coll: Collection): CollectionWithCoord {
  if (!coll.location) return coll
  return {
    ...coll,
    locationCoord: parsePostGISPoint(coll.location),
  }
}
