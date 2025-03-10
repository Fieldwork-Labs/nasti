import { useQuery } from "@tanstack/react-query"

import { supabase } from "@/lib/supabase"
import { Trip } from "@nasti/common/types"
import { useCallback } from "react"
import { queryClient } from "@/lib/utils"

export type TripWithDetails = Trip & {
  members: string[]
  species: string[]
}

export const getTripDetail = async (
  tripId: string,
): Promise<TripWithDetails> => {
  const { data: trip, error } = await supabase
    .rpc("get_trip", { p_trip_id: tripId })
    .order("created_at", { ascending: false })

  if (error) throw new Error(error.message)

  return trip[0] as TripWithDetails
}

export const useTripDetail = (tripId?: string) => {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["trip", tripId],
    queryFn: () => (tripId ? getTripDetail(tripId) : null),
    enabled: Boolean(tripId),
    refetchOnMount: false,
  })

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: ["trip", tripId],
    })
  }, [tripId])

  return { data, isLoading, isError, error, invalidate }
}
