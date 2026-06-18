import { useMutation, useMutationState } from "@tanstack/react-query"
import { supabase } from "@nasti/common/supabase"

import { useAuth } from "./useAuth"
import { queryClient } from "@/lib/queryClient"
import { CollectionAudio, ScoutingNoteAudio } from "@nasti/common/types"
import { useCallback } from "react"
import { deleteAudio, putAudio } from "@/lib/persistAudio"
import { mimeToExtension } from "@/lib/audio"

import { Upload } from "tus-js-client"
import { Session } from "@supabase/supabase-js"
import { powerSyncDb } from "@/lib/powersync/db"
import { psDelete, psInsert, psUpdate } from "@/lib/powersync/crud"
import type {
  PowerSyncCollectionAudioRow,
  PowerSyncScoutingNoteAudioRow,
} from "@/lib/powersync/schema"

export type UploadAudioVariables = {
  id: string
  file: File
  duration_ms: number
  mime_type: string
  caption?: string
}

export type PendingCollectionAudio = Omit<UploadAudioVariables, "file"> & {
  collection_id: string
  url: string
}

export type PendingScoutingNoteAudio = Omit<UploadAudioVariables, "file"> & {
  scouting_notes_id: string
  url: string
}

async function uploadAudioFile(
  bucketName: string,
  fileName: string,
  file: File,
  contentType: string,
  metadata: Record<string, string> = {},
  session: Session,
  onProgressUpdate?: (percentageComplete: number) => void,
) {
  return new Promise((resolve, reject) => {
    if (!session) throw new Error("No session")

    const upload = new Upload(file, {
      endpoint: `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/upload/resumable`,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: {
        authorization: `Bearer ${session.access_token}`,
        "x-upsert": "true",
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      metadata: {
        bucketName,
        objectName: fileName,
        contentType,
        cacheControl: "3600",
        ...metadata,
      },
      chunkSize: 6 * 1024 * 1024,
      onError: (error) => reject(error),
      onProgress: (bytesUploaded, bytesTotal) => {
        onProgressUpdate?.((bytesUploaded / bytesTotal) * 100)
      },
      onSuccess: () => resolve(upload.file),
    })

    upload.findPreviousUploads().then((previousUploads) => {
      if (previousUploads.length) {
        upload.resumeFromPreviousUpload(previousUploads[0])
      }
      upload.start()
    })
  })
}

export const getAudioUploadProgressQueryKey = (audioId: string) => [
  "audioUploads",
  audioId,
]

export const useAudiosMutate = ({
  entityId,
  entityType,
}: {
  entityId: string
  entityType: "collection" | "scoutingNote"
  tripId: string
}) => {
  const { organisation } = useAuth()

  const getFilePath = useCallback(
    (mimeType: string, audioId: string) => {
      const ext = mimeToExtension(mimeType)
      return `${organisation?.id}/${entityType}s/${entityId}/${audioId}.${ext}`
    },
    [organisation, entityId, entityType],
  )

  const updateUploadProgress = (audioId: string, percentage: number) => {
    const queryKey = getAudioUploadProgressQueryKey(audioId)
    if (percentage !== 100) queryClient.setQueryData<number>(queryKey, percentage)
    else queryClient.removeQueries({ queryKey })
  }

  const clearUploadProgress = (audioId: string) => {
    queryClient.removeQueries({ queryKey: getAudioUploadProgressQueryKey(audioId) })
  }

  const createAudioMutation = useMutation<
    CollectionAudio | ScoutingNoteAudio,
    Error,
    UploadAudioVariables
  >({
    mutationKey: ["audios", "create", entityType, entityId],
    mutationFn: async ({
      id: audioId,
      caption,
      file,
      duration_ms,
      mime_type,
    }) => {
      if (!entityType || !entityId)
        throw new Error("No entityId or entityType specified")
      if (!file) throw new Error(`No file found for ${audioId}`)

      const filePath = getFilePath(mime_type, audioId)
      const audioBase = {
        id: audioId,
        url: filePath,
        mime_type,
        caption: caption || null,
        duration_ms,
        uploaded_at: new Date().toISOString(),
      }
      const audio =
        entityType === "collection"
          ? ({
              ...audioBase,
              collection_id: entityId,
            } satisfies CollectionAudio)
          : ({
              ...audioBase,
              scouting_notes_id: entityId,
            } satisfies ScoutingNoteAudio)

      // Cache the captured blob so the originating device can play locally,
      // offline, and before the upload completes.
      await putAudio(audioId, file, mime_type)

      if (entityType === "collection") {
        await psInsert("collection_audio", audio)
      } else {
        await psInsert("scouting_notes_audio", audio)
      }

      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession()

      if (sessionError) {
        console.error(
          `[Audio] Saved ${entityType} audio locally, but could not get a session for storage upload:`,
          sessionError,
        )
        return audio
      }

      if (!session) {
        console.error(
          `[Audio] Saved ${entityType} audio locally, but no active session was available for storage upload.`,
        )
        return audio
      }

      try {
        await uploadAudioFile(
          "collection-audio",
          filePath,
          file,
          mime_type,
          { entityType, entityId, audioId },
          session,
          (percentage) => updateUploadProgress(audioId, percentage),
        )
        return audio
      } catch (error) {
        clearUploadProgress(audioId)
        console.error(
          `[Audio] Saved ${entityType} audio locally, but storage upload failed:`,
          error,
        )
        return audio
      }
    },
  })

  const deleteAudioMutationCollectionAudio = useMutation({
    mutationFn: async (audioId: string) => {
      const audio = await powerSyncDb.getOptional<PowerSyncCollectionAudioRow>(
        "SELECT * FROM collection_audio WHERE id = ?",
        [audioId],
      )
      if (!audio) throw new Error(`Collection audio ${audioId} not found`)
      if (!audio.url) throw new Error(`Collection audio ${audioId} has no URL`)

      const { error: storageError } = await supabase.storage
        .from("collection-audio")
        .remove([audio.url])

      if (storageError) throw storageError

      await psDelete("collection_audio", audioId)
      return audioId
    },
    onError: (error) => {
      console.log("error deleting audio", error)
    },
    onSettled: async (id) => {
      if (!id) return
      await deleteAudio(id)
    },
  })

  const deleteAudioMutationScoutingNotesAudio = useMutation({
    mutationFn: async (audioId: string) => {
      const audio =
        await powerSyncDb.getOptional<PowerSyncScoutingNoteAudioRow>(
          "SELECT * FROM scouting_notes_audio WHERE id = ?",
          [audioId],
        )
      if (!audio) throw new Error(`Scouting note audio ${audioId} not found`)
      if (!audio.url) throw new Error(`Scouting note audio ${audioId} has no URL`)

      const { error: storageError } = await supabase.storage
        .from("collection-audio")
        .remove([audio.url])

      if (storageError) throw storageError

      await psDelete("scouting_notes_audio", audioId)
      return audioId
    },
    onError: (error) => {
      console.log("error deleting audio", error)
    },
    onSettled: async (id) => {
      if (!id) return
      await deleteAudio(id)
    },
  })

  const deleteAudioMutation =
    entityType === "collection"
      ? deleteAudioMutationCollectionAudio
      : deleteAudioMutationScoutingNotesAudio

  type UpdateCaptionPayload = {
    caption?: string | null
    audioId: string
  }
  const updateCaptionMutationCollectionAudio = useMutation<
    CollectionAudio,
    Error,
    UpdateCaptionPayload
  >({
    mutationFn: async ({ audioId, caption }) => {
      const row = await powerSyncDb.getOptional<PowerSyncCollectionAudioRow>(
        "SELECT * FROM collection_audio WHERE id = ?",
        [audioId],
      )
      if (!row) throw new Error(`Collection audio ${audioId} not found`)
      const nextCaption = caption || null
      await psUpdate("collection_audio", audioId, { caption: nextCaption })
      return { ...row, caption: nextCaption } as CollectionAudio
    },
  })

  const updateCaptionMutationScoutingNotesAudio = useMutation<
    ScoutingNoteAudio,
    Error,
    UpdateCaptionPayload
  >({
    mutationFn: async ({ audioId, caption }) => {
      const row =
        await powerSyncDb.getOptional<PowerSyncScoutingNoteAudioRow>(
          "SELECT * FROM scouting_notes_audio WHERE id = ?",
          [audioId],
        )
      if (!row) throw new Error(`Scouting note audio ${audioId} not found`)
      const nextCaption = caption || null
      await psUpdate("scouting_notes_audio", audioId, { caption: nextCaption })
      return { ...row, caption: nextCaption } as ScoutingNoteAudio
    },
  })

  const updateCaptionMutation =
    entityType === "collection"
      ? updateCaptionMutationCollectionAudio
      : updateCaptionMutationScoutingNotesAudio

  const isMutating = useMutationState({
    filters: {
      mutationKey: ["audios", "create", entityType, entityId],
      status: "pending",
    },
  })

  const getIsMutating = useCallback(
    ({ id }: { id: string }) =>
      isMutating.find(
        ({ variables, isPaused }) =>
          !isPaused &&
          (variables as CollectionAudio | ScoutingNoteAudio).id === id,
      ),
    [isMutating],
  )

  const getIsPending = useCallback(
    ({ id }: { id: string }) =>
      isMutating.find(
        ({ variables }) =>
          (variables as CollectionAudio | ScoutingNoteAudio).id === id,
      ),
    [isMutating],
  )

  return {
    createAudioMutation,
    deleteAudioMutation,
    updateCaptionMutation,
    getIsPending,
    getIsMutating,
  }
}

export const useAudioUploadProgress = (audioId?: string) => {
  return queryClient.getQueryData<number>(
    getAudioUploadProgressQueryKey(audioId ?? ""),
  )
}
