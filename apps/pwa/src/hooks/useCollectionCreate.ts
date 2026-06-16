import { Collection, NewCollection } from "@nasti/common/types"
import { EntityConfig, useEntityCreate } from "./useEntityCreate"

// Configs for each entity type
const collectionConfig = {
  tableName: "collection",
  entityName: "collection",
} satisfies EntityConfig

export const useCollectionCreate = ({ tripId }: { tripId: string }) =>
  useEntityCreate<Collection, NewCollection>(tripId, collectionConfig)
