import { useMutation } from "@tanstack/react-query"
import { psInsert } from "@/lib/powersync/crud"

// Entity configuration type
export interface EntityConfig {
  tableName: "collection" | "scouting_notes"
  entityName: "collection" | "scoutingNote"
}

// Base type constraint for entities with location
interface BaseEntity {
  id: string
  location: string | null
  species_id?: string | null
  trip_id: string | null
}
interface NewEntity extends BaseEntity {}

// Generic create function
const createEntity = async <
  TEntity extends BaseEntity,
  TNewEntity extends NewEntity,
>(
  createdItem: TNewEntity,
  tableName: "collection" | "scouting_notes",
): Promise<TEntity> => {
  await psInsert(tableName, createdItem as unknown as Record<string, unknown>)
  return createdItem as unknown as TEntity
}

export const getMutationKey = (tableName: string, tripId?: string) => [
  `create_${tableName}`,
  tripId,
]

// Generic hook factory
export function useEntityCreate<
  TEntity extends BaseEntity,
  TNewEntity extends NewEntity,
>(tripId: string, config: EntityConfig) {
  const { tableName } = config

  return useMutation<TEntity, unknown, TNewEntity>({
    mutationKey: getMutationKey(tableName, tripId),
    mutationFn: (createdItem) =>
      createEntity<TEntity, TNewEntity>(createdItem, tableName),
  })
}
