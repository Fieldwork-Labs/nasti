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

export const useHydrateTripDetails = ({ id }: { id: string }) => {
  const [isRefetching, setIsRefetching] = useState(false)
  const {
    data: collectionPhotos,
    refetch: collectionPhotosRefetch,
    error: collectionPhotosError,
    isFetching: collectionPhotosIsFetching,
  } = useCollectionPhotosForTrip({ tripId: id })

  const collectionPhotosMap = useMemo(() => {
    if (!collectionPhotos || collectionPhotosError) return {}
    return collectionPhotos.reduce(
      (acc, photo) => {
        if (!acc[photo.collection_id]) acc[photo.collection_id] = []
        acc[photo.collection_id].push(photo)
        return acc
      },
      {} as Record<string, Array<CollectionPhoto | PendingCollectionPhoto>>,
    )
  }, [collectionPhotos])

  const pendingCollections = useMutationState<Collection>({
    filters: {
      mutationKey: getMutationKey(id),
      status: "pending",
    },
    select: (mutation) => mutation.state.variables as Collection,
  }).map((coll) => ({
    ...coll,
    isPending: true,
  }))

  const tripDetailsQuery = useQuery({
    queryKey: ["trip", "details", id],
    queryFn: async () => {
      const tripPromise = supabase
        .from("trip")
        .select("*")
        .eq("id", id)
        .single()

      const tripSpeciesPromise = supabase
        .from("trip_species")
        .select("*")
        .eq("trip_id", id)

      const tripMembersPromise = supabase
        .from("trip_member")
        .select("*")
        .eq("trip_id", id)

      const [trip, tripSpecies, tripMembers] = await Promise.all([
        tripPromise,
        tripSpeciesPromise,
        tripMembersPromise,
      ])

      if (!trip.data) return null

      const collections = await supabase
        .from("collection")
        .select("*")
        .eq("trip_id", id)
        .order("created_at", { ascending: false })
      if (collections.error) throw new Error(collections.error.message)

      const collectionsWithCoord = (collections.data as Collection[]).map(
        (coll) => {
          if (!coll.location) return coll
          return {
            ...coll,
            locationCoord: parsePostGISPoint(coll.location),
          }
        },
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

  const tripDetailsData = useMemo(() => {
    if (!tripDetailsQuery.data) return null
    const { collections, ...rest } = tripDetailsQuery.data

    const pendingCollectionsWithCoord = pendingCollections.map((coll) => {
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
    })

    // Add the pending collections to the collections array
    // filter out the pending collections from the collections array to prevent duplicates
    // pending collections have more recently updated data so should override
    const newCollections = [
      ...collections.filter(
        ({ id }) => !pendingCollections.find((c) => c.id === id),
      ),
      ...pendingCollectionsWithCoord,
    ]

    const result: TripDetails = {
      ...rest,
      collections: newCollections.map((coll) => {
        return {
          ...coll,
          photos: collectionPhotosMap[coll.id] ?? [],
        }
      }),
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

  const refetch = useCallback(async () => {
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
