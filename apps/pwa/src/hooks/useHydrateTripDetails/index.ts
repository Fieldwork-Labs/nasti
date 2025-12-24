import {
  Collection,
  CollectionPhoto,
  ScoutingNotePhoto,
} from "@nasti/common/types"

import { getMutationKey } from "@/hooks/useEntityCreate"
import { usePhotosForTrip } from "@/hooks/usePhotosForTrip"
import { useNetwork } from "@/hooks/useNetwork"
import { useTripDetails } from "@/hooks/useTripDetails"
import { useMutationState } from "@tanstack/react-query"
import { useCallback, useMemo, useState } from "react"
import {
  useOrgMembers,
  getCollectionPhotoMap,
  getScoutingNotePhotoMap,
  useTripFullSpecies,
  parsePendingLocation,
} from "./helpers"
import { TripDetails } from "./types"

export * from "./types"

export const usePhotosMap = ({ tripId }: { tripId: string }) => {
  const {
    data: collectionPhotosData,
    refetch: collectionPhotosRefetch,
    error: collectionPhotosError,
    isFetching: collectionPhotosIsFetching,
  } = usePhotosForTrip({ tripId, entityType: "collection" })

  const collectionPhotosMap = useMemo(
    () =>
      getCollectionPhotoMap(
        collectionPhotosData as CollectionPhoto[],
        collectionPhotosError,
      ),
    [collectionPhotosData],
  )
  const {
    data: scoutingNotePhotosData,
    refetch: scoutingNotePhotosRefetch,
    error: scoutingNotePhotosError,
    isFetching: scoutingNotePhotosIsFetching,
  } = usePhotosForTrip({ tripId, entityType: "scoutingNote" })

  const scoutingNotePhotosMap = useMemo(
    () =>
      getScoutingNotePhotoMap(
        scoutingNotePhotosData as ScoutingNotePhoto[],
        scoutingNotePhotosError,
      ),
    [scoutingNotePhotosData],
  )

  return {
    collectionPhotosMap,
    collectionPhotosRefetch,
    collectionPhotosError,
    collectionPhotosIsFetching,
    scoutingNotePhotosMap,
    scoutingNotePhotosRefetch,
    scoutingNotePhotosError,
    scoutingNotePhotosIsFetching,
  }
}

export const usePendingCollections = ({ tripId }: { tripId: string }) => {
  return useMutationState<Collection>({
    filters: {
      mutationKey: getMutationKey(tripId),
      status: "pending",
    },
    select: (mutation) => mutation.state.variables as Collection,
  }).map((coll) => ({
    ...coll,
    isPending: true,
  }))
}

export const useHydrateTripDetails = ({ id }: { id: string }) => {
  const [isRefetching, setIsRefetching] = useState(false)
  const {
    collectionPhotosMap,
    collectionPhotosRefetch,
    collectionPhotosIsFetching,
    scoutingNotePhotosMap,
    scoutingNotePhotosRefetch,
    scoutingNotePhotosIsFetching,
  } = usePhotosMap({ tripId: id })

  const pendingCollections = usePendingCollections({ tripId: id })

  const tripDetailsQuery = useTripDetails({ tripId: id })

  const tripDetailsData = useMemo(() => {
    if (!tripDetailsQuery.data) return null
    const { collections, scoutingNotes, ...rest } = tripDetailsQuery.data

    const pendingCollectionsWithCoord =
      pendingCollections.map(parsePendingLocation)

    // Add the pending collections to the collections array
    // filter out the pending collections from the collections array to prevent duplicates
    // pending collections have more recently updated data so should override
    const newCollections = [
      ...collections.filter(
        ({ id }) => !pendingCollectionsWithCoord.find((c) => c.id === id),
      ),
      ...pendingCollectionsWithCoord,
    ]

    const result: TripDetails = {
      ...rest,
      collections: newCollections.map((col) => ({
        ...col,
        photos: collectionPhotosMap[col.id] ?? [],
      })),
      scoutingNotes: scoutingNotes.map((sn) => ({
        ...sn,
        photos: scoutingNotePhotosMap[sn.id] ?? [],
      })),
    }

    return result
  }, [tripDetailsQuery.data, collectionPhotosMap, pendingCollections])

  const peopleQuery = useOrgMembers()

  const tripSpecies = tripDetailsQuery.data?.species?.map((s) => s.species_id)
  const speciesQuery = useTripFullSpecies(id, tripSpecies)

  const isPending =
    !isRefetching &&
    (tripDetailsQuery.isPending ||
      speciesQuery.isPending ||
      peopleQuery.isPending)

  const isFetching =
    !isRefetching &&
    (tripDetailsQuery.isFetching ||
      collectionPhotosIsFetching ||
      scoutingNotePhotosIsFetching ||
      speciesQuery.isFetching ||
      peopleQuery.isFetching)

  const isError =
    tripDetailsQuery.isError || speciesQuery.isError || peopleQuery.isError

  const { isOnline } = useNetwork()

  const refetch = useCallback(async () => {
    if (!isOnline) return
    setIsRefetching(true)
    await tripDetailsQuery.refetch()
    await speciesQuery.refetch()
    await peopleQuery.refetch()
    await collectionPhotosRefetch()
    await scoutingNotePhotosRefetch()
    setIsRefetching(false)
  }, [
    tripDetailsQuery,
    speciesQuery,
    peopleQuery,
    collectionPhotosRefetch,
    scoutingNotePhotosRefetch,
  ])

  const resultData = useMemo(
    () => ({
      data: {
        trip: tripDetailsData,
        species: speciesQuery.data?.data,
        people: peopleQuery.data?.data,
      },
      isFetching,
      isPending,
      isError,
      refetch,
      isRefetching,
    }),
    [
      tripDetailsQuery,
      speciesQuery,
      peopleQuery,
      isFetching,
      isPending,
      isError,
      refetch,
      isRefetching,
      tripDetailsQuery.dataUpdatedAt,
    ],
  )
  return resultData
}
