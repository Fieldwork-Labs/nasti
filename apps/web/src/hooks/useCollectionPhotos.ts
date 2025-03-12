// useCollectionPhotos.js
import { useEffect, useState } from "react"
import { useQuery, useMutation } from "@tanstack/react-query"
import { supabase } from "@nasti/common/supabase"
import useUserStore from "@/store/userStore"
import { CollectionPhotoSignedUrl } from "@nasti/common/types"
import { queryClient } from "@/lib/utils"

export const useCollectionPhotos = (collectionId?: string) => {
  const [isUploading, setIsUploading] = useState(false)
  // TODO: use this to show progress - use TUS
  const [uploadProgress] = useState<Record<string, number>>({})
  const { orgId } = useUserStore()

  // Fetch photos for a specific collection
  const {
    data: photos,
    isLoading: photosIsLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["collectionPhotos", "byCollection", collectionId],
    queryFn: async () => {
      if (!collectionId) return null
      const { data, error } = await supabase
        .from("collection_photo")
        .select("*")
        .eq("collection_id", collectionId)
        .order("uploaded_at", { ascending: false })

      if (error) throw error
      return data
    },
    enabled: Boolean(collectionId),
  })

  useEffect(() => {
    queryClient.invalidateQueries({
      queryKey: ["collectionPhotos", "signedUrl", "byCollection", collectionId],
    })
  }, [photos, collectionId])

  // get signed urls for each photo
  const { data: photosWithSignedUrls, isLoading: signedUrlsIsLoading } =
    useQuery({
      queryKey: ["collectionPhotos", "signedUrl", "byCollection", collectionId],
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
      enabled: Boolean(collectionId) && Boolean(photos?.length),
      // goes stale 1 min before signed url expires
      refetchInterval: 60 * 59 * 1000,
    })

  const isLoading = photosIsLoading || signedUrlsIsLoading

  // Upload photo mutation
  interface UploadPhotoVariables {
    file: File
    caption?: string
  }

  interface CollectionPhoto {
    id: string
    collection_id: string
    url: string
    caption: string | null
    uploaded_at: string | null
  }

  const uploadPhotoMutation = useMutation<
    CollectionPhoto,
    Error,
    UploadPhotoVariables
  >({
    mutationFn: async ({ file, caption }) => {
      if (!collectionId) throw new Error("No collection id specified")
      const photoId = crypto.randomUUID()
      const fileExt = file.name.split(".").pop()
      if (!fileExt)
        throw new Error(`No file extension available for ${file.name}`)
      setIsUploading(true)

      const filePath = `${orgId}/collections/${collectionId}/${photoId}.${fileExt}`

      // Upload file to Supabase Storage
      const { error: storageError } = await supabase.storage
        .from("collection-photos")
        .upload(filePath, file, {
          cacheControl: "3600",
          upsert: false,
          metadata: { collectionId, photoId },
        })

      if (storageError) throw storageError

      // Create database record
      const { data, error } = await supabase
        .from("collection_photo")
        .insert([
          {
            id: photoId,
            collection_id: collectionId,
            url: filePath,
            caption: caption || null,
          },
        ])
        .select()
        .single()

      setIsUploading(false)
      if (error) throw error
      return data as CollectionPhoto
    },
    onSuccess: (newPhoto) => {
      const queries = queryClient.getQueriesData({
        queryKey: ["collectionPhotos", "byCollection", collectionId],
      })
      // update query data
      queries.forEach(([queryKey]) => {
        queryClient.setQueryData<CollectionPhoto[]>(queryKey, (oldData) => {
          if (!oldData || oldData.length === 0) return [newPhoto]
          return [...oldData, newPhoto]
        })
      })
    },
  })

  // Delete photo mutation
  const deletePhotoMutation = useMutation({
    mutationFn: async (photoId: string) => {
      // Get the photo first to get the URL
      const { data: photo, error: fetchError } = await supabase
        .from("collection_photo")
        .select("url")
        .eq("id", photoId)
        .single()

      if (fetchError) throw fetchError

      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from("collection-photos")
        .remove([photo.url])

      if (storageError) throw storageError

      // Delete record from database
      const { error: dbError } = await supabase
        .from("collection_photo")
        .delete()
        .eq("id", photoId)

      if (dbError) throw dbError
      return photoId
    },
    onSuccess: (photoId) => {
      // just delete that guy from the query cache
      const queries = queryClient.getQueriesData({
        queryKey: ["collectionPhotos", "byCollection", collectionId],
      })
      // update query data
      queries.forEach(([queryKey]) => {
        queryClient.setQueryData<CollectionPhoto[]>(queryKey, (oldData) => {
          if (!oldData || oldData.length === 0) return []
          return oldData.filter((item) => item.id !== photoId)
        })
      })
    },
  })

  type UpdateCaptionPayload = {
    caption?: string
    photoId: string
  }
  // Update photo caption
  const updateCaptionMutation = useMutation<
    CollectionPhoto,
    Error,
    UpdateCaptionPayload
  >({
    mutationFn: async ({ photoId, caption }) => {
      const { data, error } = await supabase
        .from("collection_photo")
        .update({ caption })
        .eq("id", photoId)
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: (updatedPhoto) => {
      const queries = queryClient.getQueriesData({
        queryKey: ["collectionPhotos", "byCollection", collectionId],
      })
      // update query data
      queries.forEach(([queryKey]) => {
        queryClient.setQueryData<CollectionPhoto[]>(queryKey, (oldData) => {
          if (!oldData || oldData.length === 0) return [updatedPhoto]

          return oldData.map((item) =>
            item.id === updatedPhoto.id ? updatedPhoto : item,
          )
        })
      })
    },
  })

  return {
    photos: photosWithSignedUrls,
    isLoading,
    isError,
    error,
    isUploading,
    uploadProgress,
    signedUrlsIsLoading,
    isDeleting: deletePhotoMutation.isPending,
    uploadPhoto: uploadPhotoMutation.mutate,
    uploadPhotoAsync: uploadPhotoMutation.mutateAsync,
    deletePhoto: deletePhotoMutation.mutate,
    deletePhotoAsync: deletePhotoMutation.mutateAsync,
    updateCaption: updateCaptionMutation.mutate,
    updateCaptionAsync: updateCaptionMutation.mutateAsync,
  }
}
