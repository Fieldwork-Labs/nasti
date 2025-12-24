import { supabase } from "@nasti/common/supabase"
import { CollectionPhoto, ScoutingNotePhoto } from "@nasti/common/types"

import { useQuery } from "@tanstack/react-query"
import {
  PendingCollectionPhoto,
  PendingScoutingNotePhoto,
} from "./usePhotosMutate"
import { getImage, putImage } from "@/lib/persistFiles"

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

const getTripCollectionPhotos = (tripId: string) =>
  supabase
    .from("collection_photo")
    .select(
      `
          *,
          collection!inner (
            id,
            trip_id
          )
        `,
    )
    .eq("collection.trip_id", tripId)
    .order("collection_id", { ascending: false })
    .order("uploaded_at", { ascending: false })
    .overrideTypes<CollectionPhoto[]>()

const getTripScoutingNotesPhotos = (tripId: string) =>
  supabase
    .from("scouting_notes_photos")
    .select(
      `
          *,
          scouting_notes!inner (
            id,
            trip_id
          )
        `,
    )
    .eq("scouting_notes.trip_id", tripId)
    .order("collection_id", { ascending: false })
    .order("uploaded_at", { ascending: false })
    .overrideTypes<ScoutingNotePhoto[]>()

type EntityType = "collection" | "scoutingNote"
export const getPhotosByTripQueryKey = (
  entityType: EntityType,
  tripId?: string,
) => (tripId ? ["photos", entityType, "byTrip", tripId] : [])

export const usePhotosForTrip = ({
  tripId,
  entityType,
}: {
  entityType: EntityType
  tripId?: string
}) => {
  const photosQuery = useQuery({
    queryKey: getPhotosByTripQueryKey(entityType, tripId),
    enabled: Boolean(tripId),
    queryFn: async () => {
      if (!tripId) return []
      const photos =
        entityType === "collection"
          ? await getTripCollectionPhotos(tripId)
          : await getTripScoutingNotesPhotos(tripId)

      if (photos.error) throw new Error(photos.error.message)

      // Get photos that we need to fetch
      type MissingPhotos = { id: string; url: string }
      const missingPhotos = (
        await Promise.all(
          photos?.data.map(({ id, url }) =>
            getImage(id).then((file) => (Boolean(file) ? null : { id, url })),
          ),
        )
      ).filter(Boolean) as MissingPhotos[]

      // request to supabase storage for an empty array throws an error
      if (missingPhotos && missingPhotos.length > 0) {
        const { data, error } = await supabase.storage
          .from("collection-photos")
          .createSignedUrls(
            missingPhotos.map(({ url }) => url),
            60 * 10,
          )

        await Promise.all(
          data
            ?.filter((d) => d.signedUrl)
            .map(async ({ signedUrl }, i) => {
              const base64 = await imageUrlToBase64(signedUrl)
              await putImage(missingPhotos[i].id, base64)
            }) ?? [],
        )

        if (error) console.log("Error when getting signed photos", { error })
      }
      const result = photos?.data ?? []
      return result
    },
    refetchInterval: 1000 * 60 * 60, // every 1 hour
  })

  return photosQuery
}
