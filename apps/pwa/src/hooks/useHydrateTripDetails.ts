import { supabase } from "@nasti/common/supabase"
import { useQuery } from "@tanstack/react-query"

export const useHydrateTripDetails = ({ id }: { id: string }) => {
  const tripDetailsQuery = useQuery({
    queryKey: ["trip", "details", id],
    queryFn: async () => {
      const trip = await supabase.from("trip").select("*").eq("id", id).single()
      if (trip.error) throw new Error(trip.error.message)

      const tripSpecies = await supabase
        .from("trip_species")
        .select("*")
        .eq("trip_id", id)
      if (tripSpecies.error) throw new Error(tripSpecies.error.message)

      const tripMembers = await supabase
        .from("trip_member")
        .select("*")
        .eq("trip_id", id)
      if (tripMembers.error) throw new Error(tripMembers.error.message)

      const collections = await supabase
        .from("collection")
        .select("*")
        .eq("trip_id", id)
      if (collections.error) throw new Error(collections.error.message)

      const collectionPhotos = await supabase
        .from("collection_photo")
        .select("*")
        .in(
          "collection_id",
          collections.data.map((c) => c.id),
        )
      if (collectionPhotos.error)
        throw new Error(collectionPhotos.error.message)

      return {
        ...trip.data,
        collections: collections.data,
        collectionPhotos: collectionPhotos.data,
        species: tripSpecies.data,
        members: tripMembers.data,
      }
    },
  })

  const peopleQuery = useQuery({
    queryKey: ["people", "list"],
    queryFn: () => supabase.rpc("get_organisation_users"),
  })

  const tripSpecies = tripDetailsQuery.data?.species.map((s) => s.species_id)
  const speciesQuery = useQuery({
    queryKey: ["species", "forTrip", id],
    queryFn: () =>
      supabase
        .from("species")
        .select("*")
        .in("id", tripSpecies ?? []),
    enabled: Boolean(tripSpecies),
  })

  const isPending =
    tripDetailsQuery.isPending ||
    speciesQuery.isPending ||
    peopleQuery.isPending
  const isError =
    tripDetailsQuery.isError || speciesQuery.isError || peopleQuery.isError
  return {
    data: {
      trip: tripDetailsQuery.data,
      species: speciesQuery.data,
      people: peopleQuery.data,
    },
    isPending,
    isError,
  }
}
