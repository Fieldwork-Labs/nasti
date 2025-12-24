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
  getSpeciesPhotoMap,
  parsePendingLocation,
} from "./helpers"
import { TripDetails } from "./types"
import { useSpeciesForTrip } from "../useSpeciesForTrip"

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
      mutationKey: getMutationKey("collection", tripId),
      status: "pending",
    },
    select: (mutation) => mutation.state.variables as Collection,
  }).map((coll) => ({
    ...coll,
    isPending: true,
  }))
}

export const useSpeciesPhotosMap = ({ tripId }: { tripId: string }) => {
  const {
    data,
    refetch: speciesPhotosRefetch,
    error: speciesPhotosError,
    isFetching: speciesPhotosIsFetching,
  } = useSpeciesPhotosForTrip({ tripId })

  const speciesPhotosMap = useMemo(
    () => getSpeciesPhotoMap(data, speciesPhotosError),
    [data, speciesPhotosError],
  )

  return {
    speciesPhotosMap,
    speciesPhotosRefetch,
    speciesPhotosError,
    speciesPhotosIsFetching,
  }
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

  const { speciesPhotosMap, speciesPhotosRefetch, speciesPhotosIsFetching } =
    useSpeciesPhotosMap({ tripId: id })

  const pendingCollections = usePendingCollections({ tripId: id })
  const tripSpeciesQuery = useSpeciesForTrip(id)

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
      ...(collections?.filter(
        ({ id }) => !pendingCollectionsWithCoord.find((c) => c.id === id),
      ) ?? []),
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
      tripSpeciesQuery.isPending ||
      peopleQuery.isPending)

  const isFetching =
    !isRefetching &&
    (tripDetailsQuery.isFetching ||
      collectionPhotosIsFetching ||
      scoutingNotePhotosIsFetching ||
      speciesPhotosIsFetching ||
      tripSpeciesQuery.isFetching ||
      peopleQuery.isFetching)

  const isError =
    tripDetailsQuery.isError || peopleQuery.isError || tripSpeciesQuery.isError

  const { isOnline } = useNetwork()

  const refetch = useCallback(async () => {
    if (!isOnline) return
    setIsRefetching(true)
    await tripDetailsQuery.refetch()
    await peopleQuery.refetch()
    await tripSpeciesQuery.refetch()
    await collectionPhotosRefetch()
    await scoutingNotePhotosRefetch()
    await speciesPhotosRefetch()
    setIsRefetching(false)
  }, [
    tripDetailsQuery,

    peopleQuery,

    tripSpeciesQuery,
    collectionPhotosRefetch,
    scoutingNotePhotosRefetch,
    ,
    speciesPhotosRefetch,
  ])

  const resultData = useMemo(() => {
    return {
      data: {
        trip: tripDetailsData,
        species: tripSpeciesQuery.data,
        people: peopleQuery.data?.data,
        speciesPhotosMap,
      },
      isFetching,
      isPending,
      isError,
      refetch,
      isRefetching,
    }
  }, [
    tripDetailsQuery,
    peopleQuery,
    tripSpeciesQuery,
    speciesPhotosMap,
    isFetching,
    isPending,
    isError,
    refetch,
    isRefetching,
    tripDetailsQuery.dataUpdatedAt,
  ])
  return resultData
}
