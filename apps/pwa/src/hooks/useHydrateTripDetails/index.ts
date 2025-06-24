import { Collection } from "@nasti/common/types"

import { getMutationKey } from "@/hooks/useCollectionCreate"
import { useCollectionPhotosForTrip } from "@/hooks/useCollectionPhotosForTrip"
import { useNetwork } from "@/hooks/useNetwork"
import { useTripDetails } from "@/hooks/useTripDetails"
import { useMutationState } from "@tanstack/react-query"
import { useCallback, useMemo, useState } from "react"
import {
  attachPhotos,
  useOrgMembers,
  getPhotoMap,
  useTripFullSpecies,
  parsePendingLocation,
} from "./helpers"
import { TripDetails } from "./types"

export * from "./types"

export const useCollectionPhotosMap = ({ tripId }: { tripId: string }) => {
  const {
    data,
    refetch: collectionPhotosRefetch,
    error: collectionPhotosError,
    isFetching: collectionPhotosIsFetching,
  } = useCollectionPhotosForTrip({ tripId })

  const collectionPhotosMap = useMemo(
    () => getPhotoMap(data, collectionPhotosError),
    [data],
  )

  return {
    collectionPhotosMap,
    collectionPhotosRefetch,
    collectionPhotosError,
    collectionPhotosIsFetching,
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
  } = useCollectionPhotosMap({ tripId: id })

  const pendingCollections = usePendingCollections({ tripId: id })

  const tripDetailsQuery = useTripDetails({ tripId: id })
  console.log({ tripDetailsQuery: tripDetailsQuery.data })
  const tripDetailsData = useMemo(() => {
    if (!tripDetailsQuery.data) return null
    const { collections, ...rest } = tripDetailsQuery.data

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
      collections: newCollections.map((col) =>
        attachPhotos(col, collectionPhotosMap),
      ),
    }

    return result
  }, [tripDetailsQuery.data, collectionPhotosMap, pendingCollections])

  const peopleQuery = useOrgMembers()

  console.log({ peopleQuery: peopleQuery.data })
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
    setIsRefetching(false)
  }, [tripDetailsQuery, speciesQuery, peopleQuery, collectionPhotosRefetch])

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
