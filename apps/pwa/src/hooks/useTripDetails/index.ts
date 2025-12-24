import { Trip } from "@nasti/common/types"
import {
  getTrip,
  getTripCollections,
  getTripMembers,
  getTripScoutingNotes,
  getTripSpecies,
  parseLocation,
} from "./helpers"

import { useQuery } from "@tanstack/react-query"
import { useMemo } from "react"

const useTripCollections = (tripId: string) =>
  useQuery({
    queryKey: ["collections", "byTrip", tripId],
    queryFn: async () => {
      const collections = await getTripCollections(tripId)
      if (collections.error) throw new Error(collections.error.message)
      return collections.data
    },
  })

const useTripScoutingNotes = (tripId: string) =>
  useQuery({
    queryKey: ["scoutingNotes", "byTrip", tripId],
    queryFn: async () => {
      const scoutingNotes = await getTripScoutingNotes(tripId)
      if (scoutingNotes.error) throw new Error(scoutingNotes.error.message)
      return scoutingNotes.data
    },
  })

/**
 * Produces a denormalised trip containing collections and scouting notes with location coords, alongside species and members for the trip
 */
export const useTripDetails = ({ tripId }: { tripId: string }) => {
  const collectionsQuery = useTripCollections(tripId)
  const collectionsWithCoord = useMemo(
    () => collectionsQuery.data?.map(parseLocation),
    [collectionsQuery.data],
  )
  const scoutingNotesQuery = useTripScoutingNotes(tripId)
  const scoutingNotesWithCoord = useMemo(
    () => scoutingNotesQuery.data?.map(parseLocation),
    [scoutingNotesQuery.data],
  )

  const tripDetails = useQuery({
    queryKey: ["trip", "details", tripId],
    queryFn: async () => {
      const [trip, tripSpecies, tripMembers] = await Promise.all([
        getTrip(tripId),
        getTripSpecies(tripId),
        getTripMembers(tripId),
      ])
      if (!trip.data) return null

      const result = {
        ...(trip.data as Trip),
        species: tripSpecies.data,
        members: tripMembers.data,
      }
      return result
    },
  })

  const result = useMemo(() => {
    if (!tripDetails.data) return null
    return {
      ...tripDetails.data,
      collections: collectionsWithCoord ?? [],
      scoutingNotes: scoutingNotesWithCoord ?? [],
    }
  }, [tripDetails.data, collectionsWithCoord, scoutingNotesWithCoord])
  return { ...tripDetails, data: result }
}
