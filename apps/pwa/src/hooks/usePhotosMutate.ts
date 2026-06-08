import { useMutation, useMutationState } from "@tanstack/react-query"
import { supabase } from "@nasti/common/supabase"

import { useAuth } from "./useAuth"
import { queryClient } from "@/lib/queryClient"
import { CollectionPhoto, ScoutingNotePhoto } from "@nasti/common/types"
import { useCallback } from "react"
import { deleteImage } from "@/lib/persistFiles"

import { Upload } from "tus-js-client"
import { Session } from "@supabase/supabase-js"
import { powerSyncDb } from "@/lib/powersync/db"
import { psDelete, psInsert, psUpdate } from "@/lib/powersync/crud"
import type {
  PowerSyncCollectionPhotoRow,
  PowerSyncScoutingNotePhotoRow,
} from "@/lib/powersync/schema"

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

export type PendingScoutingNotePhoto = Omit<UploadPhotoVariables, "file"> & {
  scouting_notes_id: string
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

export const usePhotosMutate = ({
  entityId,
  entityType,
}: {
  entityId: string
  entityType: "collection" | "scoutingNote"
  tripId: string
}) => {
  const { organisation } = useAuth()

  const getFilePath = useCallback(
    (file: File, photoId: string) => {
      const fileExt = file.name.split(".").pop()

      if (!fileExt)
        throw new Error(`No file extension available for ${file.name}`)

      return `${organisation?.id}/${entityType}s/${entityId}/${photoId}.${fileExt}`
    },
    [organisation, entityId, entityType],
  )

  const updateUploadProgress = (photoId: string, percentage: number) => {
    const queryKey = getUploadProgressQueryKey(photoId)
    if (percentage !== 100)
      queryClient.setQueryData<number>(queryKey, percentage)
    else
      queryClient.removeQueries({
        queryKey,
      })
  }

  const createPhotoMutation = useMutation<
    CollectionPhoto | ScoutingNotePhoto,
    Error,
    UploadPhotoVariables
  >({
    mutationKey: ["photos", "create", entityType, entityId],
    mutationFn: async ({ id: photoId, caption, file }) => {
      if (!entityType || !entityId)
        throw new Error("No entityId or entityType specified")

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
            entityType,
            entityId,
            photoId,
          },
          session,
          (percentage) => updateUploadProgress(photoId, percentage),
        )
        const photoBase = {
          id: photoId,
          url: filePath,
          caption: caption || null,
          uploaded_at: new Date().toISOString(),
        }

        if (entityType === "collection") {
          const photo = {
            ...photoBase,
            collection_id: entityId,
          } satisfies CollectionPhoto

          await psInsert("collection_photo", photo)
          return photo
        }

        const photo = {
          ...photoBase,
          scouting_notes_id: entityId,
        } satisfies ScoutingNotePhoto

        await psInsert("scouting_notes_photos", photo)
        return photo
      } catch (error) {
        console.error("Error creating collection photo:", error)
        throw error
      }
    },
  })

  // Delete photo mutation
  const deletePhotoMutationCollectionPhoto = useMutation({
    mutationFn: async (photoId: string) => {
      const photo = await powerSyncDb.getOptional<PowerSyncCollectionPhotoRow>(
        "SELECT * FROM collection_photo WHERE id = ?",
        [photoId],
      )
      if (!photo) throw new Error(`Collection photo ${photoId} not found`)
      if (!photo.url) throw new Error(`Collection photo ${photoId} has no URL`)

      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from("collection-photos")
        .remove([photo.url])

      if (storageError) throw storageError

      await psDelete("collection_photo", photoId)

      return photoId
    },
    onError: (error) => {
      console.log("error deleting photo", error)
    },
    onSettled: async (id) => {
      if (!id) return
      queryClient.removeQueries({ queryKey: ["photo", "url", id] })
      await deleteImage(id)
    },
  })

  const deletePhotoMutationScoutingNotesPhoto = useMutation({
    mutationFn: async (photoId: string) => {
      const photo =
        await powerSyncDb.getOptional<PowerSyncScoutingNotePhotoRow>(
          "SELECT * FROM scouting_notes_photos WHERE id = ?",
          [photoId],
        )
      if (!photo) throw new Error(`Scouting note photo ${photoId} not found`)
      if (!photo.url)
        throw new Error(`Scouting note photo ${photoId} has no URL`)

      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from("collection-photos")
        .remove([photo.url])

      if (storageError) throw storageError

      await psDelete("scouting_notes_photos", photoId)

      return photoId
    },
    onError: (error) => {
      console.log("error deleting photo", error)
    },
    onSettled: async (id) => {
      if (!id) return
      queryClient.removeQueries({ queryKey: ["photo", "url", id] })
      await deleteImage(id)
    },
  })

  const deletePhotoMutation =
    entityType === "collection"
      ? deletePhotoMutationCollectionPhoto
      : deletePhotoMutationScoutingNotesPhoto

  type UpdateCaptionPayload = {
    caption?: string | null
    photoId: string
  }
  // Update photo caption
  const updateCaptionMutationCollectionPhoto = useMutation<
    CollectionPhoto,
    Error,
    UpdateCaptionPayload
  >({
    mutationFn: async ({ photoId, caption }) => {
      const row = await powerSyncDb.getOptional<PowerSyncCollectionPhotoRow>(
        "SELECT * FROM collection_photo WHERE id = ?",
        [photoId],
      )
      if (!row) throw new Error(`Collection photo ${photoId} not found`)
      const nextCaption = caption || null
      await psUpdate("collection_photo", photoId, { caption: nextCaption })
      return { ...row, caption: nextCaption } as CollectionPhoto
    },
  })

  const updateCaptionMutationScoutingNotesPhoto = useMutation<
    ScoutingNotePhoto,
    Error,
    UpdateCaptionPayload
  >({
    mutationFn: async ({ photoId, caption }) => {
      const row = await powerSyncDb.getOptional<PowerSyncScoutingNotePhotoRow>(
        "SELECT * FROM scouting_notes_photos WHERE id = ?",
        [photoId],
      )
      if (!row) throw new Error(`Scouting note photo ${photoId} not found`)
      const nextCaption = caption || null
      await psUpdate("scouting_notes_photos", photoId, { caption: nextCaption })
      return { ...row, caption: nextCaption } as ScoutingNotePhoto
    },
  })

  const isMutating = useMutationState({
    filters: {
      mutationKey: ["photos", "create", entityType, entityId],
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
          !isPaused &&
          (variables as CollectionPhoto | ScoutingNotePhoto).id === id,
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
        ({ variables }) =>
          (variables as CollectionPhoto | ScoutingNotePhoto).id === id,
      ),
    [isMutating],
  )

  const updateCaptionMutation =
    entityType === "collection"
      ? updateCaptionMutationCollectionPhoto
      : updateCaptionMutationScoutingNotesPhoto

  return {
    createPhotoMutation,
    deletePhotoMutation,
    updateCaptionMutation,
    getIsPending,
    getIsMutating,
  }
}

export const usePhotoUploadProgress = (photoId?: string) => {
  return queryClient.getQueryData<number>(
    getUploadProgressQueryKey(photoId ?? ""),
  )
}
