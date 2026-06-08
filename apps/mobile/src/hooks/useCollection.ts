import { CollectionWithCoord, Species } from "@nasti/common/types"
import { useQuery } from "@powersync/tanstack-react-query"
import { parseLocation } from "./useTripDetails/helpers"
import { TripCollectionPhotos } from "./usePhotosForTrip"
import type {
  PowerSyncCollectionPhotoRow,
  PowerSyncCollectionRow,
} from "@/lib/powersync/schema"
import { rowToCollection } from "@/lib/powersync/rows"
import type { CollectionWithCoordAndPhotos } from "./useTripDetails/types"
import { useSpecies } from "./useSpecies"

export type FullCollection = CollectionWithCoordAndPhotos & {
  species?: Species | null
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

const useCollectionQuery = (id: string) => {
  const query = useQuery<PowerSyncCollectionRow>({
    queryKey: ["collections", "detail", id],
    query: "SELECT * FROM collection WHERE id = ?",
    parameters: [id],
    enabled: Boolean(id),
  })
  const row = query.data?.[0]
  const data: CollectionWithCoord | null = row
    ? parseLocation(rowToCollection(row))
    : null

  return { ...query, data }
}

const useCollectionPhotosQuery = (collectionId: string) => {
  const query = useQuery<PowerSyncCollectionPhotoRow>({
    queryKey: ["photos", "collection", "byCollection", collectionId],
    query:
      "SELECT * FROM collection_photo WHERE collection_id = ? ORDER BY uploaded_at DESC",
    parameters: [collectionId],
    enabled: Boolean(collectionId),
  })

  return { ...query, data: query.data as TripCollectionPhotos | undefined }
}

export const useCollection = ({
  collectionId,
}: {
  collectionId: string
  tripId: string
}) => {
  const { data: collectionData } = useCollectionQuery(collectionId)
  const { data: photos } = useCollectionPhotosQuery(collectionId)
  const { data: species } = useSpecies(collectionData?.species_id)

  const result: FullCollection | undefined = collectionData
    ? { ...collectionData, photos: photos ?? [], species }
    : undefined
  return result
}
