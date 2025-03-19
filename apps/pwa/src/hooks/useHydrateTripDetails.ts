import { supabase } from "@nasti/common/supabase"
import { Collection, CollectionPhotoSignedUrl } from "@nasti/common/types"
import { useQuery } from "@tanstack/react-query"
import { useCallback, useMemo, useState } from "react"

export const useHydrateTripDetails = ({ id }: { id: string }) => {
  const [isRefetching, setIsRefetching] = useState(false)

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

      const collections = await supabase
        .from("collection")
        .select("*")
        .eq("trip_id", id)
      if (collections.error) throw new Error(collections.error.message)

      const collectionPhotos = await supabase
        .from("collection_photo")
        .select(
          `
          *,
          collection!inner (
            id,
            trip_id
          )
        `,
        )
        .eq("collection.trip_id", id)
      if (collectionPhotos.error)
        throw new Error(collectionPhotos.error.message)

      // Get public URL
      const { data } = await supabase.storage
        .from("collection-photos")
        .createSignedUrls(
          collectionPhotos?.data.map(({ url }) => url) ?? [],
          60 * 60,
        )

      const signedPhotos = (data?.map(({ signedUrl }, i) => ({
        ...collectionPhotos?.data?.[i],
        signedUrl,
      })) ?? []) as CollectionPhotoSignedUrl[]

      return {
        ...trip.data,
        collections: collections.data as Collection[],
        collectionPhotos: signedPhotos,
        species: tripSpecies.data,
        members: tripMembers.data,
      }
    },
  })

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
      speciesQuery.isFetching ||
      peopleQuery.isFetching)

  const isError =
    tripDetailsQuery.isError || speciesQuery.isError || peopleQuery.isError

  const refetch = useCallback(async () => {
    setIsRefetching(true)
    await tripDetailsQuery.refetch()
    await speciesQuery.refetch()
    await peopleQuery.refetch()
    setIsRefetching(false)
  }, [tripDetailsQuery, speciesQuery, peopleQuery])

  const resultData = useMemo(
    () => ({
      data: {
        trip: tripDetailsQuery.data,
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
    ],
  )
  return resultData
}
