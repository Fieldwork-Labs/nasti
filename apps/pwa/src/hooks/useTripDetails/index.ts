import { Collection, Trip } from "@nasti/common/types"
import {
  getTrip,
  getTripCollections,
  getTripMembers,
  getTripSpecies,
  parseLocation,
} from "./helpers"

import { useQuery } from "@tanstack/react-query"

/**
 * Produces a denormalised trip containing collections with location coords, alongside species and members for the trip
 */
export const useTripDetails = ({ tripId }: { tripId: string }) =>
  useQuery({
    queryKey: ["trip", "details", tripId],
    queryFn: async () => {
      const [trip, tripSpecies, tripMembers] = await Promise.all([
        getTrip(tripId),
        getTripSpecies(tripId),
        getTripMembers(tripId),
      ])
      if (!trip.data) return null

      const collections = await getTripCollections(tripId)

      if (collections.error) throw new Error(collections.error.message)

      const collectionsWithCoord = (collections.data as Collection[]).map(
        parseLocation,
      )

      const collectionsData = [...collectionsWithCoord]

      const result = {
        ...(trip.data as Trip),
        collections: collectionsData,
        species: tripSpecies.data,
        members: tripMembers.data,
      }
      return result
    },
  })
