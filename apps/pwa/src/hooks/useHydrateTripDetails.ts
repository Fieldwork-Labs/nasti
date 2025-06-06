import { supabase } from "@nasti/common/supabase"
import {
  Collection,
  CollectionPhoto,
  CollectionWithCoord,
  Trip,
} from "@nasti/common/types"

import { useMutationState, useQuery } from "@tanstack/react-query"
import { useCallback, useMemo, useState } from "react"
import { getMutationKey } from "./useCollectionCreate"
import { parsePostGISPoint } from "@nasti/common/utils"
import {
  TripCollectionPhotos,
  useCollectionPhotosForTrip,
} from "./useCollectionPhotosForTrip"
import { PendingCollectionPhoto } from "./useCollectionPhotosMutate"
import { useNetwork } from "./useNetwork"

export type CollectionWithCoordAndPhotos = CollectionWithCoord & {
  photos: TripCollectionPhotos
}

export type TripDetails = Trip & {
  collections: Array<CollectionWithCoordAndPhotos>
  species:
    | {
        id: string
        species_id: string
        trip_id: string
      }[]
    | null
  members:
    | {
        id: string
        joined_at: string | null
        role: string | null
        trip_id: string
        user_id: string
      }[]
    | null
}

function getPhotoMap(
  photos: Array<CollectionPhoto | PendingCollectionPhoto> | undefined,
  error: unknown,
): Record<string, Array<CollectionPhoto | PendingCollectionPhoto>> {
  if (!photos || error) return {}
  return photos.reduce(
    (acc, photo) => {
      if (!acc[photo.collection_id]) acc[photo.collection_id] = []
      acc[photo.collection_id].push(photo)
      return acc
    },
    {} as Record<string, Array<CollectionPhoto | PendingCollectionPhoto>>,
  )
}

export function parseLocation(coll: Collection): CollectionWithCoord {
  if (!coll.location) return coll
  return {
    ...coll,
    locationCoord: parsePostGISPoint(coll.location),
  }
}

export function parsePendingLocation(
  coll: Collection & { isPending: boolean },
): CollectionWithCoord {
  if (!coll.location) return coll
  // coll.location is a string with the format `POINT(lng lat)`
  const innerString = coll.location.substring(6, coll.location.length - 1)
  const [lng, lat] = innerString.split(" ")
  return {
    ...coll,
    locationCoord: {
      latitude: parseFloat(lat),
      longitude: parseFloat(lng),
    },
  }
}

function attachPhotos(
  coll: CollectionWithCoord,
  photosMap: Record<string, Array<CollectionPhoto | PendingCollectionPhoto>>,
): CollectionWithCoordAndPhotos {
  return {
    ...coll,
    photos: photosMap[coll.id] ?? [],
  }
}

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

export const getTrip = (tripId: string) =>
  supabase.from("trip").select("*").eq("id", tripId).single()

export const getTripSpecies = (tripId: string) =>
  supabase.from("trip_species").select("*").eq("trip_id", tripId)

export const getTripMembers = (tripId: string) =>
  supabase.from("trip_member").select("*").eq("trip_id", tripId)

export const getTripCollections = (tripId: string) =>
  supabase
    .from("collection")
    .select("*")
    .eq("trip_id", tripId)
    .order("created_at", { ascending: false })

export const useTripDetailsQuery = ({ tripId }: { tripId: string }) =>
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

export const useHydrateTripDetails = ({ id }: { id: string }) => {
  const [isRefetching, setIsRefetching] = useState(false)
  const {
    collectionPhotosMap,
    collectionPhotosRefetch,
    collectionPhotosIsFetching,
  } = useCollectionPhotosMap({ tripId: id })

  const pendingCollections = usePendingCollections({ tripId: id })

  const tripDetailsQuery = useTripDetailsQuery({ tripId: id })

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

  const peopleQuery = useQuery({
    queryKey: ["people", "list"],
    queryFn: async () => await supabase.rpc("get_organisation_users"),
  })

  const tripSpecies = tripDetailsQuery.data?.species?.map((s) => s.species_id)
  const speciesQuery = useQuery({
    queryKey: ["species", "forTrip", id],
    queryFn: async () =>
      await supabase
        .from("species")
        .select("*")
        .in("id", tripSpecies ?? []),
    enabled: Boolean(tripSpecies),
  })

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
