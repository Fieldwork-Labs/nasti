import {
  MutationState,
  useMutation,
  useMutationState,
} from "@tanstack/react-query"
import { useCallback } from "react"
import { supabase } from "@nasti/common/supabase"
import { queryClient } from "@/lib/queryClient"
import { parsePostGISPoint } from "@nasti/common/utils"

// Entity configuration type
export interface EntityConfig {
  tableName: "collection" | "scouting_notes"
  queryKeyPrefix: "collections" | "scoutingNotes"
  mutationKeyPrefix: "createCollection" | "createScoutingNote"
  photoMutationKeySegment: "collection" | "scoutingNote"
}

// Base type constraint for entities with location
interface BaseEntity {
  id: string
  location: string | null
  species_id?: string | null
  trip_id: string | null
}
interface NewEntity extends BaseEntity {} //Omit<BaseEntity, "id"> {
//   id: string | undefined
// }

interface EntityWithCoord extends BaseEntity {
  locationCoord?: { latitude: number; longitude: number }
}

// Generic create function
const createEntity = async <
  TEntity extends BaseEntity,
  TNewEntity extends NewEntity,
>(
  createdItem: TNewEntity,
  tableName: "collection" | "scouting_notes",
): Promise<TEntity> => {
  const query = supabase.from(tableName).insert(createdItem)

  const { data, error } = await query
    .select("*")
    .single()
    .overrideTypes<TEntity>()

  if (error) throw new Error(error.message)
  if (!data) throw new Error(`No data returned from ${tableName} insert`)

  return data as TEntity
}

// Helper to parse location from PostGIS POINT string
const parseLocationCoord = (location: string) => {
  const innerString = location.substring(7, location.length - 1)
  const [lng, lat] = innerString.split(" ")
  return {
    latitude: parseFloat(lat),
    longitude: parseFloat(lng),
  }
}

export const getMutationKey = (prefix: string, tripId?: string) => [
  prefix,
  tripId,
]

// Generic hook factory
export function useEntityCreate<
  TEntity extends BaseEntity,
  TNewEntity extends NewEntity,
  TEntityWithCoord extends TEntity & EntityWithCoord,
>(tripId: string, config: EntityConfig) {
  const {
    tableName,
    queryKeyPrefix,
    mutationKeyPrefix,
    photoMutationKeySegment,
  } = config

  const mutation = useMutation<TEntity, unknown, TNewEntity>({
    mutationKey: getMutationKey(mutationKeyPrefix, tripId),
    mutationFn: (createdItem) =>
      createEntity<TEntity, TNewEntity>(createdItem, tableName),
    onMutate: (variable) => {
      const queryKey = [queryKeyPrefix, "byTrip", tripId]
      const entitiesData = queryClient.getQueryData<TEntity[]>(queryKey) ?? []

      const pendingEntity: TNewEntity & EntityWithCoord = { ...variable }

      if (variable.location) {
        pendingEntity.locationCoord = parseLocationCoord(variable.location)
      }

      queryClient.setQueryData(queryKey, [...entitiesData, pendingEntity])

      queryClient.setQueryData(
        [queryKeyPrefix, "detail", variable.id],
        pendingEntity,
      )

      if (variable.species_id) {
        queryClient.setQueryData<Array<TEntity | TNewEntity>>(
          [queryKeyPrefix, "bySpecies", variable.species_id],
          (oldData) => {
            if (!oldData) return [pendingEntity]
            return [...oldData, pendingEntity]
          },
        )
      }
    },
    onSettled(data, error) {
      if (error) throw error
      if (!data) throw new Error(`No data returned from ${tableName} insert`)

      const queryKey = [queryKeyPrefix, "byTrip", tripId]
      const entitiesData = queryClient.getQueryData<TEntity[]>(queryKey)
      if (!entitiesData) {
        throw new Error(`No ${queryKeyPrefix} in querycache for trip`)
      }

      const newEntity = {
        ...data,
        locationCoord: data.location ? parsePostGISPoint(data.location) : null,
      } as unknown as TEntityWithCoord

      queryClient.setQueryData(queryKey, [
        ...entitiesData.filter((c) => c.id !== newEntity.id),
        newEntity,
      ])

      if (data.species_id) {
        queryClient.setQueryData<TEntity[]>(
          [queryKeyPrefix, "bySpecies", data.species_id],
          (oldData) => {
            if (!oldData) return [newEntity]
            return [...oldData.filter((c) => c.id !== newEntity.id), newEntity]
          },
        )
      }
    },
  })

  const isMutating = useMutationState<
    MutationState<TEntity, Error, TNewEntity>
  >({
    filters: {
      mutationKey: getMutationKey(mutationKeyPrefix, tripId),
      status: "pending",
      predicate: ({ state }) => !state.isPaused,
    },
  })

  const getIsMutating = useCallback(
    ({ id, includeChildren }: { id: string; includeChildren?: boolean }) => {
      const isItemMutating = isMutating.find(
        ({ variables }) => variables?.id === id,
      )
      if (includeChildren) {
        const photos = queryClient.getMutationCache().findAll({
          mutationKey: ["photos", "create", photoMutationKeySegment, id],
          status: "pending",
          predicate: ({ state }) => !state.isPaused,
        })
        return Boolean(isItemMutating) || (photos && photos.length > 0)
      }
      return Boolean(isItemMutating)
    },
    [isMutating, photoMutationKeySegment],
  )

  const getIsPending = useCallback(
    ({ id }: { id: string }) =>
      isMutating.find(({ variables }) => variables?.id === id),
    [isMutating],
  )

  return { ...mutation, getIsMutating, getIsPending }
}
