import {
  CollectionWithCoordAndPhotos,
  useHydrateTripDetails,
} from "./useHydrateTripDetails"
import {
  Collection,
  CollectionWithCoord,
  Species,
} from "@nasti/common/types"
import { useSpeciesList } from "./useSpeciesList"
import { useQuery } from "@powersync/tanstack-react-query"
import { parseLocation } from "./useTripDetails/helpers"
import { TripCollectionPhotos, usePhotosForTrip } from "./usePhotosForTrip"
import type { PowerSyncCollectionRow } from "@/lib/powersync/schema"
import { rowToCollection } from "@/lib/powersync/rows"

export type FullCollection = CollectionWithCoordAndPhotos & {
  species?: Species
}

export const getCollection = async (id?: string) => {
  if (!id) return null
  const data = await import("@/lib/powersync/db").then(({ powerSyncDb }) =>
    powerSyncDb.getOptional<PowerSyncCollectionRow>(
      "SELECT * FROM collection WHERE id = ?",
      [id],
    ),
  )

  return data ? rowToCollection(data) : null
}

const useCollectionQuery = (
  id: string,
  placeholder: Collection | null = null,
  enabled: boolean = true,
) => {
  const query = useQuery<PowerSyncCollectionRow>({
    queryKey: ["collections", "detail", id],
    query: "SELECT * FROM collection WHERE id = ?",
    parameters: [id],
    enabled,
  })
  const row = query.data?.[0]
  const data: CollectionWithCoord | null = row
    ? parseLocation(rowToCollection(row))
    : placeholder
      ? parseLocation(placeholder)
      : null

  return { ...query, data }
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

  const result: FullCollection | undefined = collectionData
    ? { ...collectionData, photos: photos ?? [], species }
    : undefined
  return result
}
