import { supabase } from "@nasti/common/supabase"
import { CollectionPhotoSignedUrl } from "@nasti/common/types"

import { useQuery } from "@tanstack/react-query"
import { useCallback, useMemo } from "react"
import { PendingCollectionPhoto } from "./useCollectionPhotosMutate"
import debounce from "lodash/debounce"

export type TripCollectionPhotos = Array<
  CollectionPhotoSignedUrl | PendingCollectionPhoto
>

export const useCollectionPhotos = ({ id }: { id?: string }) => {
  const collectionPhotosQuery = useQuery({
    queryKey: ["collectionPhotos", "byTrip", id],
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

  const refetch = useCallback(() => {
    return debounce(() => collectionPhotosQuery.refetch(), 1000)
  }, [collectionPhotosQuery])

  const resultData = useMemo(
    () => ({
      ...collectionPhotosQuery,
      refetch,
    }),
    [collectionPhotosQuery],
  )
  return resultData
}
