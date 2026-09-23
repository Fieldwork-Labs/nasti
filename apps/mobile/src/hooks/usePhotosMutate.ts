import { useMutation, useMutationState } from "@tanstack/react-query"

import { useAuth } from "./useAuth"
import { queryClient } from "@/lib/queryClient"
import { CollectionPhoto, ScoutingNotePhoto } from "@nasti/common/types"
import { useCallback } from "react"
import { deleteImage } from "@/lib/persistFiles"
import { fileToBase64, putImage } from "@/lib/persistFiles"
import { powerSyncDb } from "@/lib/powersync/db"
import { psUpdate } from "@/lib/powersync/crud"
import { validateMediaUploadIds } from "@/lib/powersync/attachments"
import { createQueuedMediaRecord, deleteQueuedMediaRecord } from "@/lib/powersync/mediaMutations"
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
      validateMediaUploadIds(photoId, entityId, organisation?.id)

      const filePath = getFilePath(file, photoId)
      await putImage(photoId, (await fileToBase64(file)) as Base64URLString)
      const photoBase = {
        id: photoId,
        url: filePath,
        caption: caption || null,
        uploaded_at: null,
      }
      const photo =
        entityType === "collection"
          ? ({
              ...photoBase,
              collection_id: entityId,
            } satisfies CollectionPhoto)
          : ({
              ...photoBase,
              scouting_notes_id: entityId,
            } satisfies ScoutingNotePhoto)

      const table = entityType === "collection" ? "collection_photo" : "scouting_notes_photos"
      await createQueuedMediaRecord({
        id: photoId,
        kind: "photo",
        table,
        bucket: "collection-photos",
        path: filePath,
        mimeType: file.type || "image/jpeg",
        record: photo,
      })
      return photo
    },
  })

  const deletePhotoMutation = useMutation({
    mutationFn: async (photoId: string) => deleteQueuedMediaRecord({
      id: photoId,
      kind: "photo",
      table: entityType === "collection" ? "collection_photo" : "scouting_notes_photos",
      bucket: "collection-photos",
      entityLabel: entityType === "collection" ? "Collection photo" : "Scouting note photo",
      fallbackMimeType: "image/jpeg",
    }),
    onError: (error) => {
      console.log("error deleting photo", error)
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
