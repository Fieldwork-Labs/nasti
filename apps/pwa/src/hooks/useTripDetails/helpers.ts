import { supabase } from "@nasti/common/supabase"
import {
  Collection,
  CollectionWithCoord,
  ScoutingNote,
} from "@nasti/common/types"
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
    .overrideTypes<Collection[]>()

export const getTripScoutingNotes = (tripId: string) =>
  supabase
    .from("scouting_notes")
    .select("*")
    .eq("trip_id", tripId)
    .order("created_at", { ascending: false })
    .overrideTypes<ScoutingNote[]>()

export function parseLocation<T extends { location: string | null }>(
  obj: T,
): T & { locationCoord?: { latitude: number; longitude: number } } {
  if (!obj.location) return obj
  return {
    ...obj,
    locationCoord: parsePostGISPoint(obj.location),
  }
}
