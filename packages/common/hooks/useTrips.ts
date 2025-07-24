import { supabase } from "../supabase"
import { Trip } from "../types"
import { useQuery } from "@tanstack/react-query"

const getTrips = async (): Promise<Trip[]> => {
  const { data: trips, error } = await supabase
    .from("trip")
    .select("*")
    .order("created_at", { ascending: true })

  if (error) throw new Error(error.message)

  return trips as Trip[]
}

export const getTripsQueryOptions = () => ({
  queryKey: ["trips", "list"],
  queryFn: () => getTrips(),
})

export const useTrips = () => {
  // Fetch trips
  const { data, isLoading, isError, error, isPending } = useQuery(
    getTripsQueryOptions(),
  )

  return { data, isLoading, isError, error, isPending }
}
