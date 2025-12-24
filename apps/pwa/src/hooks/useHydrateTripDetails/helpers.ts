import { CollectionPhoto, ScoutingNotePhoto } from "@nasti/common/types"

import {
  PendingCollectionPhoto,
  PendingScoutingNotePhoto,
} from "@/hooks/usePhotosMutate"
import { supabase } from "@nasti/common/supabase"
import { useQuery } from "@tanstack/react-query"

export function getCollectionPhotoMap(
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
export function getScoutingNotePhotoMap(
  photos: Array<ScoutingNotePhoto | PendingScoutingNotePhoto> | undefined,
  error: unknown,
): Record<string, Array<ScoutingNotePhoto | PendingScoutingNotePhoto>> {
  if (!photos || error) return {}
  return photos.reduce(
    (acc, photo) => {
      if (!acc[photo.scouting_notes_id]) acc[photo.scouting_notes_id] = []
      acc[photo.scouting_notes_id].push(photo)
      return acc
    },
    {} as Record<string, Array<ScoutingNotePhoto | PendingScoutingNotePhoto>>,
  )
}

export function parsePendingLocation<T extends { location: string | null }>(
  obj: T,
): T & { locationCoord?: { latitude: number; longitude: number } } {
  if (!obj.location) return obj
  // obj.location is a string with the format `POINT(lng lat)`
  const innerString = obj.location.substring(6, obj.location.length - 1)
  const [lng, lat] = innerString.split(" ")
  return {
    ...obj,
    locationCoord: {
      latitude: parseFloat(lat),
      longitude: parseFloat(lng),
    },
  }
}

export function attachPhotos<T extends { id: string }>(
  coll: T,
  photosMap: Record<
    string,
    Array<
      | CollectionPhoto
      | PendingCollectionPhoto
      | ScoutingNotePhoto
      | PendingScoutingNotePhoto
    >
  >,
): T & {
  photos: Array<
    | CollectionPhoto
    | PendingCollectionPhoto
    | ScoutingNotePhoto
    | PendingScoutingNotePhoto
  >
} {
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
