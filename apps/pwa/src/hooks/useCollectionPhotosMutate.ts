import { useMutation, useMutationState } from "@tanstack/react-query"
import { supabase } from "@nasti/common/supabase"

import { useAuth } from "./useAuth"
import { queryClient } from "@/lib/queryClient"
import { CollectionPhoto } from "@nasti/common/types"
import { useCallback } from "react"
import { deleteImage } from "@/lib/persistFiles"
import {
  getCollectionPhotosByTripQueryKey,
  TripCollectionPhotos,
} from "./useCollectionPhotosForTrip"
import { Upload } from "tus-js-client"
import { Session } from "@supabase/supabase-js"

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

async function uploadFile(
  bucketName: string,
  fileName: string,
  file: File,
  metadata: Record<string, string> = {},
  session: Session,
  onProgressUpdate?: (percentageComplete: number) => void,
) {
  return new Promise(async (resolve, reject) => {
    if (!session) throw new Error("No session")

    const upload = new Upload(file, {
      endpoint: `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/upload/resumable`,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: {
        authorization: `Bearer ${session.access_token}`,
        "x-upsert": "true", // optionally set upsert to true to overwrite existing files
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true, // Important if you want to allow re-uploading the same file https://github.com/tus/tus-js-client/blob/main/docs/api.md#removefingerprintonsuccess
      metadata: {
        bucketName: bucketName,
        objectName: fileName,
        contentType: "image/png",
        cacheControl: "3600",
        ...metadata,
      },
      chunkSize: 6 * 1024 * 1024, // NOTE: it must be set to 6MB (for now) do not change it
      onError: function (error) {
        console.log("Failed because: " + error)
        reject(error)
      },
      onProgress: function (bytesUploaded, bytesTotal) {
        var percentage = (bytesUploaded / bytesTotal) * 100
        onProgressUpdate?.(percentage)
      },
      onSuccess: function () {
        resolve(upload.file)
      },
    })

    // Check if there are any previous uploads to continue.
    const previousUploads = await upload.findPreviousUploads()
    // Found previous uploads so we select the first one.
    if (previousUploads.length) {
      upload.resumeFromPreviousUpload(previousUploads[0])
    }
    upload.start()
  })
}

export const getUploadProgressQueryKey = (photoId: string) => [
  "photoUploads",
  photoId,
]

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

  const updateUploadProgress = useCallback(
    (photoId: string, percentage: number) => {
      const queryKey = getUploadProgressQueryKey(photoId)
      if (percentage !== 100)
        queryClient.setQueryData<number>(queryKey, percentage)
      else
        queryClient.removeQueries({
          queryKey,
        })
    },
    [collectionId],
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

      // Get a fresh session before starting operations
      // This is critical when resuming from offline mode
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession()

      if (sessionError) {
        throw new Error(`Failed to get session: ${sessionError.message}`)
      }

      if (!session) {
        throw new Error("No active session. Please log in again.")
      }

      try {
        // First, upload file to Supabase Storage
        await uploadFile(
          "collection-photos",
          filePath,
          file,
          {
            collectionId,
            photoId,
          },
          session,
          (percentage) => updateUploadProgress(photoId, percentage),
        )

        // Then, insert record into database
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

        if (error) {
          // Provide better error messages for RLS violations
          if (error.message.includes("row-level security")) {
            throw new Error(
              `Permission denied: Unable to create photo record. This may indicate a session or permissions issue. ${error.message}`,
            )
          }
          throw error
        }

        return data as CollectionPhoto
      } catch (error) {
        console.error("Error creating collection photo:", error)
        throw error
      }
    },
    onMutate: async ({ file, ...variables }) => {
      // IndexedDB Put is not done here because it needs to be awaited regardless of online state

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
      queryClient.removeQueries({ queryKey: ["photo", "url", id] })
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

export const useCollectionPhotoUploadProgress = (photoId?: string) => {
  return queryClient.getQueryData<number>(
    getUploadProgressQueryKey(photoId ?? ""),
  )
}
