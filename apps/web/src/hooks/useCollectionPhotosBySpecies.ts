import { supabase } from "@nasti/common/supabase"
import { queryClient } from "@nasti/common/utils"
import { useQuery } from "@tanstack/react-query"
import { useEffect } from "react"

interface CollectionPhoto {
  id: string
  collection_id: string
  url: string
  caption: string | null
  uploaded_at: string | null
}

export type CollectionPhotoSignedUrl = CollectionPhoto & {
  signedUrl: string
}

export const useCollectionPhotosBySpecies = (speciesId?: string) => {
  const {
    data: photos,
    isLoading: photosIsLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["collectionPhotos", "bySpecies", speciesId],
    queryFn: async () => {
      if (!speciesId) return null
      const { data, error } = await supabase
        .from("collection_photo")
        .select("*, collection:collection!inner(species_id)")
        .eq("collection.species_id", speciesId)
        .order("uploaded_at", { ascending: false })

      if (error) throw error
      return data
    },
    enabled: Boolean(speciesId),
  })

  useEffect(() => {
    queryClient.invalidateQueries({
      queryKey: ["collectionPhotos", "signedUrl", "bySpecies", speciesId],
    })
  }, [photos, speciesId])

  // get signed urls for each photo
  const { data: photosWithSignedUrls, isLoading: signedUrlsIsLoading } =
    useQuery({
      queryKey: ["collectionPhotos", "signedUrl", "bySpecies", speciesId],
      queryFn: async () => {
        // Get public URL
        const { data } = await supabase.storage
          .from("collection-photos")
          .createSignedUrls(photos?.map(({ url }) => url) ?? [], 60 * 60)

        return (data?.map(({ signedUrl }, i) => ({
          ...photos?.[i],
          signedUrl,
        })) ?? []) as CollectionPhotoSignedUrl[]
      },
      enabled: Boolean(speciesId) && Boolean(photos?.length),
      // goes stale 1 min before signed url expires
      refetchInterval: 60 * 59 * 1000,
    })

  const isLoading = photosIsLoading || signedUrlsIsLoading
  return { photos: photosWithSignedUrls, isLoading, isError, error }
}
