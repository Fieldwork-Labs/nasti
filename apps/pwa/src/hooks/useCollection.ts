import {
  CollectionWithCoordAndPhotos,
  useHydrateTripDetails,
} from "./useHydrateTripDetails"
import { Collection, Species } from "@nasti/common/types"
import { useSpeciesList } from "./useSpeciesList"
import { supabase } from "@nasti/common/supabase"
import { useQuery } from "@tanstack/react-query"
import { parseLocation } from "./useTripDetails/helpers"
import { TripCollectionPhotos, usePhotosForTrip } from "./usePhotosForTrip"

export type FullCollection = CollectionWithCoordAndPhotos & {
  species?: Species
}

export const getCollection = async (id?: string) => {
  if (!id) return null
  const { data, error } = await supabase
    .from("collection")
    .select("*")
    .eq("id", id)
    .maybeSingle()
    .overrideTypes<Collection>()

  if (error) throw new Error(error.message)
  if (!data) throw new Error("No data returned from collection upsert")

  return data
}

const useCollectionQuery = (
  id: string,
  placeholder: Collection | null = null,
  enabled: boolean = true,
) => {
  return useQuery({
    queryKey: ["collections", "detail", id],
    queryFn: () => getCollection(id),
    enabled,
    refetchOnMount: true,
    refetchOnReconnect: true,
    select(data) {
      return data ? parseLocation(data) : null
    },
    placeholderData: placeholder,
  })
}

export const useCollection = ({
  collectionId,
  tripId,
}: {
  collectionId: string
  tripId: string
}) => {
  const { data } = useHydrateTripDetails({ id: tripId })
  const collection = data.trip?.collections.find((c) => c.id === collectionId)
  const { data: speciesList } = useSpeciesList()
  const { data: collectionData } = useCollectionQuery(
    collectionId,
    collection,
    !Boolean(collection),
  )

  const { data: newPhotos } = usePhotosForTrip({
    tripId: tripId,
    entityType: "collection",
    enabled: !Boolean(collection),
  })
  const photos =
    collection?.photos ??
    (newPhotos?.find(
      (p) => "collection_id" in p && p.collection_id === collectionId,
    ) as unknown as TripCollectionPhotos)

  const species =
    speciesList?.find((s) => s.id === collectionData?.species_id) ?? undefined

  const result = collectionData
    ? { ...collectionData, photos, species }
    : undefined
  return result
}
