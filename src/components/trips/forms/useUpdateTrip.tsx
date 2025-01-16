import { TripWithDetails } from "@/hooks/useTripDetail"
import { useTrips } from "@/hooks/useTrips"
import { supabase } from "@/lib/supabase"
import useUserStore from "@/store/userStore"
import { Trip } from "@/types"
import { useCallback } from "react"

export const useUpdateTrip = (trip?: Trip | TripWithDetails) => {
  const { invalidate } = useTrips()
  const { orgId } = useUserStore()
  return useCallback(
    async (newTripDetails: Partial<Trip>) => {
      if (!orgId) throw new Error("No organisation available")
      if (!trip) throw new Error("No trip available")

      // trip may contain properties that are not part of the trip table
      let existingTrip = trip
      if ("species" in trip || "members" in trip) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { species, members, ...rest } = trip as TripWithDetails
        existingTrip = rest
      }

      const sbresponse = await supabase
        .from("trip")
        .upsert({
          ...existingTrip,
          ...newTripDetails,
        })
        .select("*")
        .single()

      if (sbresponse.error) throw new Error(sbresponse.error.message)
      // type assertion required because of bad typing in supabase for postgis geometry columns
      const newTrip = sbresponse.data as Trip
      invalidate()
      return newTrip
    },
    [orgId, trip, invalidate],
  )
}
