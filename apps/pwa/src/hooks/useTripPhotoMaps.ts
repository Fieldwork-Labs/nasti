import { useMemo } from "react"
import { CollectionPhoto, ScoutingNotePhoto, SpeciesPhoto } from "@nasti/common/types"

import {
  PendingCollectionPhoto,
  PendingScoutingNotePhoto,
} from "@/hooks/usePhotosMutate"
import { usePhotosForTrip } from "@/hooks/usePhotosForTrip"
import { useSpeciesPhotosForTrip } from "@/hooks/useSpeciesPhotosForTrip"

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

type ScoutingNotePhotoArray = Array<
  ScoutingNotePhoto | PendingScoutingNotePhoto
>

export function getScoutingNotePhotoMap(
  photos: ScoutingNotePhotoArray | undefined,
  error: unknown,
): Record<string, ScoutingNotePhotoArray> {
  if (!photos || error) return {}
  return photos.reduce<Record<string, ScoutingNotePhotoArray>>((acc, photo) => {
    if (!acc[photo.scouting_notes_id]) acc[photo.scouting_notes_id] = []
    acc[photo.scouting_notes_id].push(photo)
    return acc
  }, {})
}

export function getSpeciesPhotoMap(
  photos: Array<SpeciesPhoto> | undefined,
  error: unknown,
): Record<string, Array<SpeciesPhoto>> {
  if (!photos || error) return {}
  return photos.reduce(
    (acc, photo) => {
      if (!acc[photo.species_id]) acc[photo.species_id] = []
      acc[photo.species_id].push(photo)
      return acc
    },
    {} as Record<string, Array<SpeciesPhoto>>,
  )
}

export const useTripPhotoMaps = ({
  tripId,
  enabled = true,
}: {
  tripId: string
  enabled?: boolean
}) => {
  const {
    data: collectionPhotosData,
    refetch: collectionPhotosRefetch,
    error: collectionPhotosError,
    isFetching: collectionPhotosIsFetching,
  } = usePhotosForTrip({ tripId, entityType: "collection", enabled })

  const collectionPhotosMap = useMemo(
    () =>
      getCollectionPhotoMap(
        collectionPhotosData as CollectionPhoto[],
        collectionPhotosError,
      ),
    [collectionPhotosData, collectionPhotosError],
  )

  const {
    data: scoutingNotePhotosData,
    refetch: scoutingNotePhotosRefetch,
    error: scoutingNotePhotosError,
    isFetching: scoutingNotePhotosIsFetching,
  } = usePhotosForTrip({ tripId, entityType: "scoutingNote", enabled })

  const scoutingNotePhotosMap = useMemo(
    () =>
      getScoutingNotePhotoMap(
        scoutingNotePhotosData as ScoutingNotePhoto[],
        scoutingNotePhotosError,
      ),
    [scoutingNotePhotosData, scoutingNotePhotosError],
  )

  return {
    collectionPhotosMap,
    collectionPhotosRefetch,
    collectionPhotosError,
    collectionPhotosIsFetching,
    scoutingNotePhotosMap,
    scoutingNotePhotosRefetch,
    scoutingNotePhotosError,
    scoutingNotePhotosIsFetching,
  }
}

export const useSpeciesPhotosMap = ({ tripId }: { tripId?: string }) => {
  const {
    data,
    refetch: speciesPhotosRefetch,
    error: speciesPhotosError,
    isFetching: speciesPhotosIsFetching,
  } = useSpeciesPhotosForTrip({ tripId })

  const speciesPhotosMap = useMemo(
    () => getSpeciesPhotoMap(data, speciesPhotosError),
    [data, speciesPhotosError],
  )

  return {
    speciesPhotosMap,
    speciesPhotosRefetch,
    speciesPhotosError,
    speciesPhotosIsFetching,
  }
}
