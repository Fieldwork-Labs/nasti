import { CollectionPhoto, ScoutingNotePhoto } from "@nasti/common/types"

import { usePhotosForTrip } from "@/hooks/usePhotosForTrip"
import { useNetwork } from "@/hooks/useNetwork"
import { useTripDetails } from "@/hooks/useTripDetails"
import { useCallback, useMemo, useState } from "react"
import {
  useOrgMembers,
  getCollectionPhotoMap,
  getScoutingNotePhotoMap,
  getSpeciesPhotoMap,
} from "./helpers"
import { TripDetails } from "./types"
import { useSpeciesForTrip } from "../useSpeciesForTrip"
import { useSpeciesPhotosForTrip } from "../useSpeciesPhotosForTrip"
import { getSpeciesListQueryOptions } from "../useSpeciesList"
import { queryClient } from "@/lib/queryClient"

export * from "./types"

export const usePhotosMap = ({
  tripId,
  enabled = true,
}: {
  tripId: string
  enabled?: boolean
}) => {
  const {
    data: collectionPhotosData,
    refetch: collectionPhotosRefetch,
    error: collectionPhotosError,
    isFetching: collectionPhotosIsFetching,
  } = usePhotosForTrip({ tripId, entityType: "collection", enabled })

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
  } = usePhotosForTrip({ tripId, entityType: "scoutingNote", enabled })

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

  const tripSpeciesQuery = useSpeciesForTrip(id)
  // we don't use this data directly here, but we should ensure it's up to date
  queryClient.ensureQueryData(getSpeciesListQueryOptions())

  const tripDetailsQuery = useTripDetails({ tripId: id })

  const tripDetailsData = useMemo(() => {
    if (!tripDetailsQuery.data) return null
    const { collections, scoutingNotes, ...rest } = tripDetailsQuery.data

    const result: TripDetails = {
      ...rest,
      collections: collections?.map((col) => ({
        ...col,
        photos: collectionPhotosMap[col.id] ?? [],
      })),
      scoutingNotes: scoutingNotes?.map((sn) => ({
        ...sn,
        photos: scoutingNotePhotosMap[sn.id] ?? [],
      })),
    }

    return result
  }, [tripDetailsQuery.data, collectionPhotosMap, scoutingNotePhotosMap])

  const peopleQuery = useOrgMembers()

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
