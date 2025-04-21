import { supabase } from "@nasti/common/supabase"
import { CollectionPhotoSignedUrl } from "@nasti/common/types"

import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useCallback, useMemo } from "react"
import { PendingCollectionPhoto } from "./useCollectionPhotosMutate"

export type TripCollectionPhotos = Array<
  CollectionPhotoSignedUrl | PendingCollectionPhoto
>

export const getSignedUrl = async (url: string) => {
  const { data } = await supabase.storage
    .from("collection-photos")
    .createSignedUrl(url, 60 * 60)

  return data?.signedUrl
}

export const getCollectionPhotosByTripQueryKey = (tripId?: string) =>
  tripId ? ["collectionPhotos", "byTrip", tripId] : []

export const useCollectionPhotos = ({ id }: { id?: string }) => {
  const queryClient = useQueryClient()
  const collectionPhotosQuery = useQuery({
    queryKey: getCollectionPhotosByTripQueryKey(id),
    enabled: Boolean(id),
    queryFn: async () => {
      if (!id) return []
      const collectionPhotos = await supabase
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
        .eq("collection.trip_id", id)
      if (collectionPhotos.error)
        throw new Error(collectionPhotos.error.message)

      // Get public URL
      const photoPaths = collectionPhotos?.data.map(({ url }) => url)
      let signedPhotos: CollectionPhotoSignedUrl[] | undefined = undefined
      // request to supabase storage for an empty array throws an error
      if (photoPaths && photoPaths.length > 0) {
        const { data } = await supabase.storage
          .from("collection-photos")
          .createSignedUrls(photoPaths, 60 * 60)

        signedPhotos = (data?.map(({ signedUrl }, i) => ({
          ...collectionPhotos?.data?.[i],
          signedUrl,
        })) ?? []) as CollectionPhotoSignedUrl[]
      }
      const result: TripCollectionPhotos = signedPhotos ?? []

      return result
    },
  })

  const refreshSignedUrl = useCallback(
    async (url: string) => {
      const signedUrl = await getSignedUrl(url)

      if (signedUrl) {
        queryClient.setQueryData(
          ["collectionPhotos", "byTrip", id],
          (oldData: TripCollectionPhotos) => {
            if (!oldData || oldData.length === 0) return []
            return oldData.map((item) => {
              if ("url" in item && item.url === url)
                return { ...item, signedUrl }
              return item
            })
          },
        )
      }
    },
    [collectionPhotosQuery],
  )

  const resultData = useMemo(
    () => ({
      ...collectionPhotosQuery,
      refreshSignedUrl,
    }),
    [collectionPhotosQuery],
  )
  return resultData
}
