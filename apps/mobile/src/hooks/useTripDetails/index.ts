import { Trip } from "@nasti/common/types"
import { parseLocation } from "./helpers"

import { useQuery } from "@/lib/powersync/query"
import { useMemo } from "react"
import type {
  PowerSyncCollectionRow,
  PowerSyncScoutingNoteRow,
  PowerSyncTripMemberRow,
  PowerSyncTripRow,
} from "@/lib/powersync/schema"
import {
  rowToCollection,
  rowToScoutingNote,
  rowToTrip,
  rowToTripMember,
} from "@/lib/powersync/rows"

const useTripCollections = (tripId: string) => {
  const query = useQuery<PowerSyncCollectionRow>({
    queryKey: ["collections", "byTrip", tripId],
    query:
      "SELECT * FROM collection WHERE trip_id = ? ORDER BY created_at DESC",
    parameters: [tripId],
  })
  const collectionsWithCoord = useMemo(
    () => query.data?.map((row) => parseLocation(rowToCollection(row))),
    [query.data],
  )

  return { ...query, data: collectionsWithCoord }
}

const useTripScoutingNotes = (tripId: string) => {
  const query = useQuery<PowerSyncScoutingNoteRow>({
    queryKey: ["scoutingNotes", "byTrip", tripId],
    query:
      "SELECT * FROM scouting_notes WHERE trip_id = ? ORDER BY created_at DESC",
    parameters: [tripId],
  })

  const scoutingNotesWithCoord = useMemo(
    () => query.data?.map((row) => parseLocation(rowToScoutingNote(row))),
    [query.data],
  )

  return { ...query, data: scoutingNotesWithCoord }
}

const useTripMembers = (tripId: string) => {
  const query = useQuery<PowerSyncTripMemberRow>({
    queryKey: ["tripMembers", "byTrip", tripId],
    query: "SELECT * FROM trip_member WHERE trip_id = ?",
    parameters: [tripId],
  })

  const data = useMemo(() => query.data?.map(rowToTripMember), [query.data])

  return { ...query, data }
}

/**
 * Produces a denormalised trip containing collections and scouting notes with location coords, alongside species and members for the trip
 */
export const useTripDetails = ({ tripId }: { tripId: string }) => {
  const collectionsQuery = useTripCollections(tripId)
  const scoutingNotesQuery = useTripScoutingNotes(tripId)
  const tripMembersQuery = useTripMembers(tripId)

  const tripDetails = useQuery<PowerSyncTripRow>({
    queryKey: ["trip", "details", tripId],
    query: "SELECT * FROM trip WHERE id = ?",
    parameters: [tripId],
  })

  const result = useMemo(() => {
    const trip = tripDetails.data?.[0]
    if (!trip) return null
    return {
      ...(rowToTrip(trip) as Trip),
      members: tripMembersQuery.data ?? [],
      collections: collectionsQuery.data ?? [],
      scoutingNotes: scoutingNotesQuery.data ?? [],
    }
  }, [
    tripDetails.data,
    tripMembersQuery.data,
    collectionsQuery.data,
    scoutingNotesQuery.data,
  ])
  return { ...tripDetails, data: result }
}
