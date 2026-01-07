import { Trip } from "@nasti/common/types"
import {
  getTrip,
  getTripCollections,
  getTripMembers,
  parseLocation,
} from "./helpers"

import { useQuery } from "@tanstack/react-query"

/**
 * Produces a denormalised trip containing collections with location coords, alongside species and members for the trip
 */
export const useTripDetails = ({ tripId }: { tripId: string }) => {
  return useQuery({
    queryKey: ["trip", "details", tripId],
    queryFn: async () => {
      const [trip, tripMembers] = await Promise.all([
        getTrip(tripId),
        getTripMembers(tripId),
      ])
      console.log({ trip })
      if (!trip.data) return null

      const collections = await getTripCollections(tripId)

      if (collections.error) throw new Error(collections.error.message)

      const collectionsWithCoord = collections.data?.map(parseLocation) ?? []

      const collectionsData = [...collectionsWithCoord]

      const result = {
        ...(trip.data as Trip),
        collections: collectionsData,
        members: tripMembers.data,
      }
      return result
    },
  })
}
