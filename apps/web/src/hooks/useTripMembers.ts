import { supabase } from "@/lib/supabase"
import { useQuery } from "@tanstack/react-query"
import { queryClient } from "@/lib/utils"
import { useCallback } from "react"
import { TripMember } from "@nasti/common/types"

const getTripMembers = async (tripId: string): Promise<TripMember[]> => {
  const { data: members, error } = await supabase
    .from("trip_member")
    .select("*")
    .eq("trip_id", tripId)

  if (error) throw new Error(error.message)

  return members
}

export const useTripMembers = (tripId: string | undefined) => {
  const {
    data: members,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["tripMembers", tripId],
    queryFn: () => (tripId ? getTripMembers(tripId) : []),
    enabled: Boolean(tripId),
  })

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["tripMembers", tripId] })
  }, [tripId])

  return {
    data: members,
    isLoading,
    isError,
    error,
    invalidate,
  }
}
