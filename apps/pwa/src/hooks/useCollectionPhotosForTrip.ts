import { supabase } from "@nasti/common/supabase"
import { CollectionPhotoSignedUrl } from "@nasti/common/types"

import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useCallback, useMemo } from "react"
import { PendingCollectionPhoto } from "./useCollectionPhotosMutate"

export type TripCollectionPhotos = Array<
  CollectionPhotoSignedUrl | PendingCollectionPhoto
>

export const getSignedUrl = async (url: string) => {
  const { data, error } = await supabase.storage
    .from("collection-photos")
    .createSignedUrl(url, 60 * 60)
  if (error) console.log("Error getting 1 signed url", error)
  return data?.signedUrl
}

export const getCollectionPhotosByTripQueryKey = (tripId?: string) =>
  tripId ? ["collectionPhotos", "byTrip", tripId] : []

export const useCollectionPhotosForTrip = ({ tripId }: { tripId?: string }) => {
  const queryClient = useQueryClient()
  const collectionPhotosQuery = useQuery({
    queryKey: getCollectionPhotosByTripQueryKey(tripId),
    enabled: Boolean(tripId),
    queryFn: async () => {
      if (!tripId) return []
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
        .eq("collection.trip_id", tripId)
      if (collectionPhotos.error)
        throw new Error(collectionPhotos.error.message)

      // Get public URL
      const photoPaths = collectionPhotos?.data.map(({ url }) => url)
      let signedPhotos: CollectionPhotoSignedUrl[] | undefined = undefined
      // request to supabase storage for an empty array throws an error
      if (photoPaths && photoPaths.length > 0) {
        const { data, error } = await supabase.storage
          .from("collection-photos")
          .createSignedUrls(photoPaths, 60 * 60)

        signedPhotos = (data?.map(({ signedUrl }, i) => ({
          ...collectionPhotos?.data?.[i],
          signedUrl,
        })) ?? []) as CollectionPhotoSignedUrl[]

        if (error) console.log("Error when gettings signed photos", { error })
      }
      const result: TripCollectionPhotos = signedPhotos ?? []

      return result
    },
    refetchInterval: 1000 * 60 * 59, // every 59 minutes
  })

  const refreshSignedUrl = useCallback(async (url: string) => {
    const signedUrl = await getSignedUrl(url)
    queryClient.setQueriesData(
      {
        queryKey: ["collectionPhotos"],
      },
      async (oldData: TripCollectionPhotos) => {
        if (!oldData || oldData.length === 0) {
          // since we are here, we know that the trip does have photos
          await collectionPhotosQuery.refetch()
          return []
        }

        return oldData.map((item) => {
          if ("url" in item && item.url === url) {
            if (signedUrl) {
              return { ...item, signedUrl }
            }
          }
          return item
        })
      },
    )
  }, [])

  const resultData = useMemo(
    () => ({
      ...collectionPhotosQuery,
      refreshSignedUrl,
    }),
    [collectionPhotosQuery],
  )
  return resultData
}
