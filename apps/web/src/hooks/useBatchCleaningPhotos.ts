import { useMutation } from "@tanstack/react-query"
import { supabase } from "@nasti/common/supabase"
import { queryClient } from "@nasti/common/utils"
import type { BatchCleaningPhoto } from "@nasti/common/types"
import useUserStore from "@/store/userStore"

export const CLEANING_PHOTOS_BUCKET = "batch-cleaning-photos"

export type CleaningPhotoStage = "before" | "after"

/** A photo chosen in the form but not yet attached to a cleaning record. */
export type StagedCleaningPhoto = {
  /** Local id, used as the React key and as the storage object name. */
  id: string
  file: File
  stage: CleaningPhotoStage
  /** Object URL for the thumbnail — revoke when the photo is removed. */
  previewUrl: string
}

type UploadCleaningPhotosVariables = {
  cleaningId: string
  photos: StagedCleaningPhoto[]
}

/**
 * Uploads the before/after photos staged in the cleaning form. A cleaning
 * record only exists once fn_clean_batch has run, so the files are held in the
 * form until it returns an id and are attached here.
 */
export const useUploadBatchCleaningPhotos = () => {
  const { organisation } = useUserStore()

  const uploadMutation = useMutation<
    BatchCleaningPhoto[],
    Error,
    UploadCleaningPhotosVariables
  >({
    mutationFn: async ({ cleaningId, photos }) => {
      if (photos.length === 0) return []
      if (!organisation?.id) throw new Error("No organisation id")

      const uploaded: { id: string; stage: CleaningPhotoStage; url: string }[] =
        []

      for (const photo of photos) {
        const fileExt = photo.file.name.split(".").pop()
        if (!fileExt)
          throw new Error(`No file extension available for ${photo.file.name}`)

        const filePath = `${organisation.id}/cleaning/${cleaningId}/${photo.id}.${fileExt}`

        const { error: storageError } = await supabase.storage
          .from(CLEANING_PHOTOS_BUCKET)
          .upload(filePath, photo.file, {
            cacheControl: "3600",
            upsert: false,
            metadata: { cleaningId, photoId: photo.id, stage: photo.stage },
          })

        if (storageError) throw storageError

        uploaded.push({ id: photo.id, stage: photo.stage, url: filePath })
      }

      const { data, error } = await supabase
        .from("batch_cleaning_photo")
        .insert(
          uploaded.map(({ id, stage, url }) => ({
            id,
            cleaning_id: cleaningId,
            stage,
            url,
            organisation_id: organisation.id,
          })),
        )
        .select()

      if (error) throw error
      return data as BatchCleaningPhoto[]
    },
    onSuccess: (_photos, { cleaningId }) => {
      queryClient.invalidateQueries({
        queryKey: ["batchCleaningPhotos", cleaningId],
      })
    },
  })

  return {
    uploadPhotos: uploadMutation.mutate,
    uploadPhotosAsync: uploadMutation.mutateAsync,
    isUploading: uploadMutation.isPending,
  }
}
