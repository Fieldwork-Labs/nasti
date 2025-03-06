import { supabase } from "@/lib/supabase"
import { Collection } from "@/types"
import { useQuery } from "@tanstack/react-query"

const getCollectionsByTrip = async (tripId: string) => {
  const { data, error } = await supabase
    .from("collection")
    .select("*")
    .eq("trip_id", tripId)

  if (error) throw new Error(error.message)

  return data as Collection[]
}

export const useCollectionsByTrip = (tripId: string) => {
  return useQuery({
    queryKey: ["collections", "byTrip", tripId],
    queryFn: () => getCollectionsByTrip(tripId),
    enabled: Boolean(tripId), // Only run if tripId is present
  })
}
