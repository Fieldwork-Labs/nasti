import { useMutation } from "@tanstack/react-query"
import { supabase } from "@nasti/common/supabase"

import { useAuth } from "./useAuth"
import { TripDetails } from "./useHydrateTripDetails"
import { queryClient } from "@/lib/queryClient"

// Upload photo mutation
export type UploadPhotoVariables = {
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

export const useCollectionPhotosMutate = ({
  collectionId,
  tripId,
}: {
  collectionId: string
  tripId?: string
}) => {
  const { org } = useAuth()
  const createPhotoMutation = useMutation<
    CollectionPhoto,
    Error,
    UploadPhotoVariables
  >({
    mutationKey: ["collectionPhotos", "create", collectionId],
    mutationFn: async ({ file, caption }) => {
      if (!collectionId) throw new Error("No collection id specified")
      const photoId = crypto.randomUUID()
      const fileExt = file.name.split(".").pop()
      if (!fileExt)
        throw new Error(`No file extension available for ${file.name}`)

      const filePath = `${org?.organisation_id}/collections/${collectionId}/${photoId}.${fileExt}`

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

      if (error) throw error
      return data as CollectionPhoto
    },
    onMutate: (variable) => {
      // Get the trip details data blob
      const queryKey = ["trip", "details", tripId]
      const tripQuery = queryClient.getQueryData<TripDetails>(queryKey)
      if (!tripQuery) throw new Error("Unknown trip")

      queryClient.setQueryData(queryKey, {
        ...tripQuery,
        collectionPhotos: [...tripQuery.collectionPhotos, variable],
      })
    },
    onSettled: (createdItem) => {
      if (!createdItem) return
      // Get and set the trip details data blob
      const queryKey = ["trip", "details", tripId]
      const tripQuery = queryClient.getQueryData<TripDetails>(queryKey)
      if (!tripQuery) throw new Error("Unknown trip")

      queryClient.setQueryData(queryKey, {
        ...tripQuery,
        collectionPhotos: [
          ...tripQuery.collectionPhotos.filter((c) => c.id !== createdItem.id),
          createdItem,
        ],
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
    createPhotoMutation,
    deletePhotoMutation,
    updateCaptionMutation,
  }
}
