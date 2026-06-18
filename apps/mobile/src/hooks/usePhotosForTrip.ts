import { supabase } from "@nasti/common/supabase"
import { CollectionPhoto, ScoutingNotePhoto } from "@nasti/common/types"

import { useQuery } from "@/lib/powersync/query"
import {
  PendingCollectionPhoto,
  PendingScoutingNotePhoto,
} from "./usePhotosMutate"
import { getImage, putImage } from "@/lib/persistFiles"
import { useEffect, useMemo } from "react"
import type {
  PowerSyncCollectionPhotoRow,
  PowerSyncScoutingNotePhotoRow,
} from "@/lib/powersync/schema"

export type TripCollectionPhotos = Array<
  CollectionPhoto | PendingCollectionPhoto
>

export type TripScoutingNotePhotos = Array<
  ScoutingNotePhoto | PendingScoutingNotePhoto
>

const imageUrlToBase64 = async (url: string): Promise<string> => {
  const response = await fetch(url)
  const blob = await response.blob()
  return new Promise((resolve, reject) => {
    try {
      const reader = new FileReader()
      reader.onload = function () {
        resolve(this.result as string)
      }
      reader.readAsDataURL(blob)
    } catch (e) {
      reject(e)
    }
  })
}

type EntityType = "collection" | "scoutingNote"
export const getPhotosByTripQueryKey = (
  entityType: EntityType,
  tripId?: string,
) => (tripId ? ["photos", entityType, "byTrip", tripId] : [])

const collectionPhotosTypeGuard = (
  photos: TripCollectionPhotos | TripScoutingNotePhotos | undefined,
): photos is TripCollectionPhotos => {
  return (
    photos !== undefined &&
    photos.every(
      (photo) => "collection_id" in photo && photo.collection_id !== undefined,
    )
  )
}

const scoutingNotePhotosTypeGuard = (
  photos: TripCollectionPhotos | TripScoutingNotePhotos | undefined,
): photos is TripScoutingNotePhotos => {
  return (
    photos !== undefined &&
    photos.every(
      (photo) =>
        "scouting_notes_id" in photo && photo.scouting_notes_id !== undefined,
    )
  )
}

export const usePhotosForTrip = ({
  tripId,
  entityType,
  enabled = true,
}: {
  entityType: EntityType
  tripId?: string
  enabled?: boolean
}) => {
  type PhotoRow = PowerSyncCollectionPhotoRow | PowerSyncScoutingNotePhotoRow
  const query =
    entityType === "collection"
      ? `SELECT cp.* FROM collection_photo cp
         INNER JOIN collection c ON c.id = cp.collection_id
         WHERE c.trip_id = ?
         ORDER BY cp.collection_id DESC, cp.uploaded_at DESC`
      : `SELECT snp.* FROM scouting_notes_photos snp
         INNER JOIN scouting_notes sn ON sn.id = snp.scouting_notes_id
         WHERE sn.trip_id = ?
         ORDER BY snp.scouting_notes_id DESC, snp.uploaded_at DESC`

  const photosQuery = useQuery<PhotoRow>({
    queryKey: getPhotosByTripQueryKey(entityType, tripId),
    query,
    parameters: [tripId ?? ""],
    enabled: Boolean(tripId) && enabled,
  })

  const result = useMemo(() => {
    if (entityType === "collection") {
      const rows = (photosQuery.data ?? []) as TripCollectionPhotos
      return collectionPhotosTypeGuard(rows) ? rows : undefined
    }

    const rows = (photosQuery.data ?? []) as TripScoutingNotePhotos
    return scoutingNotePhotosTypeGuard(rows) ? rows : undefined
  }, [entityType, photosQuery.data])

  useEffect(() => {
    let cancelled = false

    async function cacheMissingPhotos() {
      const photos = result ?? []
      type MissingPhotos = { id: string; url: string }
      const missingPhotos = (
        await Promise.all(
          photos.map(({ id, url }) =>
            getImage(id).then((file) => (file ? null : { id, url })),
          ),
        )
      ).filter(Boolean) as MissingPhotos[]

      if (cancelled || missingPhotos.length === 0) return

      const { data, error } = await supabase.storage
        .from("collection-photos")
        .createSignedUrls(
          missingPhotos.map(({ url }) => url),
          60 * 10,
        )

      if (error) {
        console.log("Error when getting signed photos", { error })
        return
      }

      await Promise.all(
        data
          ?.filter((item) => item.signedUrl)
          .map(async ({ signedUrl }, index) => {
            const base64 = await imageUrlToBase64(signedUrl)
            await putImage(missingPhotos[index].id, base64)
          }) ?? [],
      )
    }

    cacheMissingPhotos()

    return () => {
      cancelled = true
    }
  }, [result])

  return { ...photosQuery, data: result }
}
