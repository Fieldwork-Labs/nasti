import { useQuery } from "@tanstack/react-query"

import { supabase } from "@/lib/supabase"
import { TripSpecies } from "@/types"
import { queryClient } from "@/lib/utils"
import { useCallback } from "react"

export type TripSpeciesWithDetails = TripSpecies & {
  species: {
    name: string
    ala_guid: string
    indigenous_name: string
  }
}

export const getTripSpecies = async (tripId: string) => {
  const { data, error } = await supabase
    .from("trip_species")
    .select("*, species(name, ala_guid, indigenous_name)")
    .eq("trip_id", tripId)

  if (error) throw new Error(error.message)

  return data as TripSpeciesWithDetails[]
}

export const useTripSpecies = (tripId: string | undefined) => {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["tripSpecies", tripId],
    queryFn: () => {
      if (!tripId) {
        throw new Error("Trip not found")
      }
      return getTripSpecies(tripId)
    },
    enabled: Boolean(tripId),
  })

  const invalidate = useCallback(
    () =>
      queryClient.invalidateQueries({
        queryKey: ["tripSpecies", tripId],
      }),
    [tripId],
  )

  return { data, isLoading, isError, error, invalidate }
}
