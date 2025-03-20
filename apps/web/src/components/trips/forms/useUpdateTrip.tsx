import {
  getTripDetailQueryOptions,
  TripWithDetails,
} from "@/hooks/useTripDetail"
import { getTripsQueryOptions } from "@nasti/common/hooks/useTrips"
import { supabase } from "@nasti/common/supabase"
import { Trip } from "@nasti/common/types"
import { useMutation, useQueryClient } from "@tanstack/react-query"

const tripTypeGuard = (
  trip?: Trip | TripWithDetails,
): trip is TripWithDetails => {
  return Boolean(trip && ("species" in trip || "members" in trip))
}

const tripValidationGuard = (trip?: Partial<Trip>): trip is Trip => {
  if (!trip) throw new Error("Trip is required")
  if (!trip.name) throw new Error("Trip name is required")
  return true
}

export const useUpdateTrip = (trip?: Trip | TripWithDetails) => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (newTripDetails: Partial<Trip>) => {
      // trip may contain properties that are not part of the trip table
      let existingTrip: Trip | TripWithDetails | object = trip ?? {}
      if (tripTypeGuard(trip)) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { species, members, ...rest } = trip as TripWithDetails
        existingTrip = rest
      }

      const combined = {
        ...existingTrip,
        ...newTripDetails,
      }
      try {
        const isTrip = tripValidationGuard(combined)
        if (!isTrip) throw new Error("Invalid trip")
      } catch (e) {
        throw e as Error
      }

      const sbresponse = await supabase
        .from("trip")
        .upsert(combined)
        .select("*")
        .single()

      if (sbresponse.error) throw new Error(sbresponse.error.message)
      // type assertion required because of bad typing in supabase for postgis geometry columns
      return sbresponse.data as Trip
    },
    onSuccess: (updatedTrip) => {
      // Get the query key for trips
      const tripsQueryOptions = getTripsQueryOptions()

      // Update the cached data with the new trip
      queryClient.setQueryData(
        tripsQueryOptions.queryKey,
        (oldData: Trip[]) => {
          // If there's no cached data, don't try to update it
          if (!oldData) return oldData

          // Update the trip in the cache if we are updating an existing trip
          if (trip)
            return oldData.map((cachedTrip: Trip) =>
              cachedTrip.id === updatedTrip.id ? updatedTrip : cachedTrip,
            )
          else return [updatedTrip, ...oldData]
        },
      )

      //also update the cached data in trip detail cache
      if (trip)
        queryClient.setQueryData(
          getTripDetailQueryOptions(trip.id).queryKey,
          (oldData: TripWithDetails) => {
            if (!oldData) return oldData
            return {
              ...oldData,
              ...updatedTrip,
            }
          },
        )
    },
  })
}
