import { supabase } from "../supabase"
import { Trip } from "../types"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useCallback } from "react"

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
  const queryClient = useQueryClient()
  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: ["trips", "list"],
    })
  }, [queryClient])

  return { data, isLoading, isError, error, isPending, invalidate }
}
