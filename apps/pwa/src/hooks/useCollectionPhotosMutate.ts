import { useMutation, useMutationState } from "@tanstack/react-query"
import { supabase } from "@nasti/common/supabase"

import { useAuth } from "./useAuth"
import { queryClient } from "@/lib/queryClient"
import { CollectionPhotoSignedUrl } from "@nasti/common/types"
import { useCallback } from "react"
import { deleteFile, fileDB } from "@/lib/persistFiles"
import {
  getCollectionPhotosByTripQueryKey,
  getSignedUrl,
  TripCollectionPhotos,
} from "./useCollectionPhotos"

// Upload photo mutation
export type UploadPhotoVariables = {
  id: string
  caption?: string
}

export type PendingCollectionPhoto = UploadPhotoVariables & {
  collection_id: string
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
    mutationFn: async ({ id: photoId, caption }) => {
      if (!collectionId) throw new Error("No collection id specified")
      const db = await fileDB
      const file = await db.get("files", photoId)
      const fileExt = file.name.split(".").pop()

      if (!fileExt)
        throw new Error(`No file extension available for ${file.name}`)

      const filePath = `${org?.organisation_id}/collections/${collectionId}/${photoId}.${fileExt}`

      // Upload file to Supabase Storage
      const { error: storageError } = await supabase.storage
        .from("collection-photos")
        .upload(filePath, file, {
          cacheControl: "3600",
          upsert: true,
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
      return {
        ...data,
        // have to manually add this here to get the file path into the query cache
        // for use until the file is uploaded and we get a real signedUrl
        signedUrl: URL.createObjectURL(file),
      } as CollectionPhotoSignedUrl
    },
    onMutate: (variable) => {
      // Get the trip details data blob
      const queryKey = ["collectionPhotos", "byTrip", tripId]
      const tripPhotosQuery =
        queryClient.getQueryData<TripCollectionPhotos>(queryKey)
      if (!tripPhotosQuery) throw new Error("Unknown trip")

      queryClient.setQueryData(queryKey, [
        ...tripPhotosQuery,
        { ...variable, collection_id: collectionId },
      ])
    },
    onSettled: async (createdItem, _, { id }) => {
      console.log("settling photo", createdItem)
      if (!createdItem) return
      // Get and set the trip details data blob
      const queryKey = ["collectionPhotos", "byTrip", tripId]
      const photosQuery =
        queryClient.getQueryData<TripCollectionPhotos>(queryKey)
      if (!photosQuery) throw new Error("Unknown trip")

      const signedUrl = await getSignedUrl(createdItem.url)

      queryClient.setQueryData(queryKey, [
        ...photosQuery?.filter((c) => c.id !== id),
        { ...createdItem, signedUrl },
      ])
      // delete from DB
      await deleteFile(id)
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

      // delete record from supabase
      const { error: deleteError } = await supabase
        .from("collection_photo")
        .delete()
        .eq("id", photoId)

      if (deleteError) throw deleteError

      // Delete record from database
      const { error: dbError } = await supabase
        .from("collection_photo")
        .delete()
        .eq("id", photoId)

      if (dbError) throw dbError
      return photoId
    },
    onError: (error) => {
      console.log("error deleting photo", error)
    },
    onMutate: (photoId) => {
      queryClient.setQueryData<CollectionPhoto[]>(
        ["collectionPhotos", "byCollection", collectionId],
        (oldData) => {
          if (!oldData || oldData.length === 0) return []
          return oldData.filter((item) => item.id !== photoId)
        },
      )
      queryClient.setQueryData<CollectionPhoto[]>(
        getCollectionPhotosByTripQueryKey(tripId),
        (oldData) => {
          if (!oldData || oldData.length === 0) return []
          return oldData.filter((item) => item.id !== photoId)
        },
      )
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
      queryClient.setQueryData<CollectionPhoto[]>(
        ["collectionPhotos", "byCollection", collectionId],
        (oldData) => {
          if (!oldData || oldData.length === 0) return []

          return oldData.map((item) =>
            item.id === variables.photoId
              ? { ...item, caption: variables.caption || null }
              : item,
          )
        },
      )
      queryClient.setQueryData<CollectionPhoto[]>(
        getCollectionPhotosByTripQueryKey(tripId),
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
      // Get the trip details data blob
      const signedUrl = await getSignedUrl(data.url)

      queryClient.setQueryData<CollectionPhoto[]>(
        ["collectionPhotos", "byCollection", collectionId],

        (oldData) => {
          if (!oldData || oldData.length === 0) return [data]
          return oldData.map((item) =>
            item.id === variables.photoId ? { ...data, signedUrl } : item,
          )
        },
      )
      queryClient.setQueryData<CollectionPhoto[]>(
        getCollectionPhotosByTripQueryKey(tripId),
        (oldData) => {
          if (!oldData || oldData.length === 0) return []

          return oldData.map((item) => (item.id === data.id ? data : item))
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
