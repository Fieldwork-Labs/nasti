import {
  Collection,
  CollectionPhoto,
  CollectionWithCoord,
} from "@nasti/common/types"

import { PendingCollectionPhoto } from "@/hooks/useCollectionPhotosMutate"
import { CollectionWithCoordAndPhotos } from "./types"
import { useQuery } from "@tanstack/react-query"
import { supabase } from "@nasti/common/supabase"

export function getPhotoMap(
  photos: Array<CollectionPhoto | PendingCollectionPhoto> | undefined,
  error: unknown,
): Record<string, Array<CollectionPhoto | PendingCollectionPhoto>> {
  if (!photos || error) return {}
  return photos.reduce(
    (acc, photo) => {
      if (!acc[photo.collection_id]) acc[photo.collection_id] = []
      acc[photo.collection_id].push(photo)
      return acc
    },
    {} as Record<string, Array<CollectionPhoto | PendingCollectionPhoto>>,
  )
}

export function parsePendingLocation(
  coll: Collection & { isPending: boolean },
): CollectionWithCoord {
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
}

export function attachPhotos(
  coll: CollectionWithCoord,
  photosMap: Record<string, Array<CollectionPhoto | PendingCollectionPhoto>>,
): CollectionWithCoordAndPhotos {
  return {
    ...coll,
    photos: photosMap[coll.id] ?? [],
  }
}

export const useOrgMembers = () =>
  useQuery({
    queryKey: ["people", "list"],
    queryFn: async () => await supabase.rpc("get_organisation_users"),
  })

export const useTripFullSpecies = (tripId: string, speciesIds: string[] = []) =>
  useQuery({
    queryKey: ["species", "forTrip", tripId],
    queryFn: async () =>
      await supabase
        .from("species")
        .select("*")
        .in("id", speciesIds ?? []),
    enabled: Boolean(speciesIds) && speciesIds.length > 0,
  })
