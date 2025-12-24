import {
  Collection,
  CollectionWithCoord,
  NewCollection,
} from "@nasti/common/types"
import { EntityConfig, useEntityCreate } from "./useEntityCreate"

// Configs for each entity type
const collectionConfig = {
  tableName: "collection",
  queryKeyPrefix: "collections",
  mutationKeyPrefix: "createCollection",
  photoMutationKeySegment: "collection",
} satisfies EntityConfig

export const useCollectionCreate = ({ tripId }: { tripId: string }) =>
  useEntityCreate<Collection, NewCollection, CollectionWithCoord>(
    tripId,
    collectionConfig,
  )
