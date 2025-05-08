import { useMutation, useMutationState } from "@tanstack/react-query"
import { supabase } from "@nasti/common/supabase"

import { useAuth } from "./useAuth"
import { queryClient } from "@/lib/queryClient"
import { CollectionPhoto } from "@nasti/common/types"
import { useCallback } from "react"
import { deleteImage, fileToBase64, putImage } from "@/lib/persistFiles"
import {
  getCollectionPhotosByTripQueryKey,
  TripCollectionPhotos,
} from "./useCollectionPhotosForTrip"

// Upload photo mutation
export type UploadPhotoVariables = {
  id: string
  file: File
  caption?: string
}

export type PendingCollectionPhoto = Omit<UploadPhotoVariables, "file"> & {
  collection_id: string
  url: string
}

export const useCollectionPhotosMutate = ({
  collectionId,
  tripId,
}: {
  collectionId: string
  tripId: string
}) => {
  const { org } = useAuth()

  const getFilePath = useCallback(
    (file: File, photoId: string) => {
      const fileExt = file.name.split(".").pop()

      if (!fileExt)
        throw new Error(`No file extension available for ${file.name}`)

      return `${org?.organisation_id}/collections/${collectionId}/${photoId}.${fileExt}`
    },
    [org, tripId, collectionId],
  )

  const createPhotoMutation = useMutation<
    CollectionPhoto,
    Error,
    UploadPhotoVariables
  >({
    mutationKey: ["collectionPhotos", "create", collectionId],
    mutationFn: async ({ id: photoId, caption, file }) => {
      if (!collectionId) throw new Error("No collection id specified")

      if (!file) throw new Error(`No file found for ${photoId}`)

      const filePath = getFilePath(file, photoId)

      const [{ error: storageError }, { data, error }] = await Promise.all([
        // Upload file to Supabase Storage
        supabase.storage.from("collection-photos").upload(filePath, file, {
          cacheControl: "3600",
          upsert: true,
          metadata: { collectionId, photoId },
        }),
        // upload to supabase database table
        supabase
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
          .single(),
      ])
      if (storageError) throw storageError
      if (error) throw error
      return data as CollectionPhoto
    },
    onMutate: async ({ file, ...variables }) => {
      // store locally in indexedDB
      await putImage(variables.id, await fileToBase64(file))

      // Get the trip details data blob
      const pendingItem: PendingCollectionPhoto = {
        ...variables,
        collection_id: collectionId,
        url: getFilePath(file, variables.id),
      }
      queryClient.setQueriesData<TripCollectionPhotos>(
        { queryKey: getCollectionPhotosByTripQueryKey(tripId) },
        (oldData) => {
          return [...(oldData || []), pendingItem]
        },
      )
    },
    onSettled: async (createdItem, _, { id }) => {
      if (!createdItem) return

      queryClient.setQueriesData<TripCollectionPhotos>(
        { queryKey: ["collectionPhotos"] },
        (oldData) => {
          if (!oldData) return []
          return [...oldData?.filter((c) => c.id !== id), createdItem]
        },
      )
    },
  })

  // Delete photo mutation
  const deletePhotoMutation = useMutation({
    mutationFn: async (photoId: string) => {
      // Get the photo first to get the URL
      // TODO this is going to fail/throw error if the photo is pending
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

      // delete record from supabase
      const { error: deleteError } = await supabase
        .from("collection_photo")
        .delete()
        .eq("id", photoId)

      if (deleteError) throw deleteError

      return photoId
    },
    onError: (error) => {
      console.log("error deleting photo", error)
    },
    onMutate: (photoId) => {
      queryClient.setQueriesData<CollectionPhoto[]>(
        { queryKey: ["collectionPhotos"] },
        (oldData) => {
          if (!oldData || oldData.length === 0) return []
          return oldData.filter((item) => item.id !== photoId)
        },
      )
    },
    onSettled: async (id) => {
      if (!id) return
      await deleteImage(id)
    },
  })

  type UpdateCaptionPayload = {
    caption?: string | null
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
    onMutate: (variables) => {
      // update query data
      queryClient.setQueriesData<CollectionPhoto[]>(
        { queryKey: ["collectionPhotos"] },
        (oldData) => {
          if (!oldData || oldData.length === 0) return []

          return oldData.map((item) =>
            item.id === variables.photoId
              ? { ...item, caption: variables.caption || null }
              : item,
          )
        },
      )
    },
    async onSettled(data, error, variables) {
      if (error) throw error
      if (!data)
        throw new Error("No data returned from collection photo update")

      queryClient.setQueriesData<CollectionPhoto[]>(
        { queryKey: ["collectionPhotos"] },

        (oldData) => {
          if (!oldData || oldData.length === 0) return []
          return oldData.map((item) =>
            item.id === variables.photoId ? { ...data } : item,
          )
        },
      )
    },
  })

  const isMutating = useMutationState({
    filters: {
      mutationKey: ["collectionPhotos", "create", collectionId],
      status: "pending",
    },
  })

  /*
   * function getIsMutating
   * Returns a function that returns whether a photo is currently being mutated (ie, in process of uploading to server)
   * @param id - The id of the photo to check
   */
  const getIsMutating = useCallback(
    ({ id }: { id: string }) =>
      isMutating.find(
        ({ variables, isPaused }) =>
          !isPaused && (variables as CollectionPhoto).id === id,
      ),
    [isMutating],
  )
  /*
   * function getIsPending
   * Returns a function that returns whether a collection is pending update (ie, will upload to server on network availability)
   * @param id - The id of the collection to check
   */
  const getIsPending = useCallback(
    ({ id }: { id: string }) =>
      isMutating.find(
        ({ variables }) => (variables as CollectionPhoto).id === id,
      ),
    [isMutating],
  )

  return {
    createPhotoMutation,
    deletePhotoMutation,
    updateCaptionMutation,
    getIsPending,
    getIsMutating,
  }
}
