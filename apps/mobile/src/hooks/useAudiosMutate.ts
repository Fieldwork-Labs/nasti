import { useMutation, useMutationState } from "@tanstack/react-query"
import { supabase } from "@nasti/common/supabase"

import { useAuth } from "./useAuth"
import { queryClient } from "@/lib/queryClient"
import { CollectionAudio, ScoutingNoteAudio } from "@nasti/common/types"
import { useCallback } from "react"
import { deleteAudio, putAudio } from "@/lib/persistAudio"
import { mimeToExtension } from "@/lib/audio"

import { powerSyncDb } from "@/lib/powersync/db"
import { psDelete, psInsert, psUpdate } from "@/lib/powersync/crud"
import { mediaAttachmentQueue } from "@/lib/powersync/attachments"
import { powerSyncQueryClient } from "@/lib/powersync/query"
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
        uploaded_at: null,
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

      const table = entityType === "collection" ? "collection_audio" : "scouting_notes_audio"
      await powerSyncDb.writeTransaction(async (transaction) => {
        await mediaAttachmentQueue.enqueue(
          {
            id: audioId,
            kind: "audio",
            table,
            bucket: "collection-audio",
            path: filePath,
            mimeType: mime_type,
          },
          transaction,
        )
        await psInsert(table, audio, transaction)
      })

      await powerSyncQueryClient.invalidateQueries()
      mediaAttachmentQueue.wake()
      return audio
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
