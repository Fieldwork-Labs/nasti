import { useQuery } from "@tanstack/react-query"

import { supabase } from "@nasti/common/supabase"
import { Trip } from "@nasti/common/types"
import { useCallback } from "react"
import { queryClient } from "@nasti/common/utils"

export type TripWithDetails = Trip & {
  members: string[]
  species: string[]
}

export const getTripDetail = async (
  tripId?: string,
): Promise<TripWithDetails> => {
  if (!tripId) throw new Error("No trip ID provided")
  const { data: trip, error } = await supabase
    .rpc("get_trip", { p_trip_id: tripId })
    .order("created_at", { ascending: false })

  if (error) throw new Error(error.message)

  return trip[0] as TripWithDetails
}

export const getTripDetailQueryOptions = (tripId?: string) => ({
  queryKey: ["trip", tripId],
  queryFn: () => getTripDetail(tripId),
  enabled: Boolean(tripId),
  refetchOnMount: false,
})

export const useTripDetail = (tripId?: string) => {
  const { data, isLoading, isError, error } = useQuery(
    getTripDetailQueryOptions(tripId),
  )

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: ["trip", tripId],
    })
  }, [tripId])

  return { data, isLoading, isError, error, invalidate }
}
