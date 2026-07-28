import { useMutation, useQuery } from "@tanstack/react-query"
import { supabase } from "@nasti/common/supabase"
import { queryClient } from "@nasti/common/utils"
import type { BatchCleaningPhoto } from "@nasti/common/types"
import useUserStore from "@/store/userStore"

export const CLEANING_PHOTOS_BUCKET = "batch-cleaning-photos"

export type CleaningPhotoStage = "before" | "after"

export type BatchCleaningPhotoSignedUrl = BatchCleaningPhoto & {
  signedUrl: string
}

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
 * Fetches all photos for one cleaning event and resolves their private storage
 * paths to signed URLs suitable for thumbnails and the gallery viewer.
 */
export const useBatchCleaningPhotos = (cleaningId?: string) => {
  return useQuery({
    queryKey: ["batchCleaningPhotos", cleaningId],
    queryFn: async () => {
      if (!cleaningId) return []

      const { data: photos, error: photosError } = await supabase
        .from("batch_cleaning_photo")
        .select("*")
        .eq("cleaning_id", cleaningId)
        .order("uploaded_at", { ascending: true })

      if (photosError) throw photosError
      if (photos.length === 0) return []

      const stageOrder: Record<CleaningPhotoStage, number> = {
        before: 0,
        after: 1,
      }
      const orderedPhotos = [...photos].sort(
        (a, b) =>
          stageOrder[a.stage as CleaningPhotoStage] -
          stageOrder[b.stage as CleaningPhotoStage],
      )

      const { data: signedUrls, error: signedUrlsError } =
        await supabase.storage.from(CLEANING_PHOTOS_BUCKET).createSignedUrls(
          orderedPhotos.map(({ url }) => url),
          60 * 60,
        )

      if (signedUrlsError) throw signedUrlsError

      return orderedPhotos.map((photo, index) => {
        const signedUrl = signedUrls[index]?.signedUrl
        if (!signedUrl) {
          throw new Error(`Could not create a signed URL for photo ${photo.id}`)
        }

        return {
          ...photo,
          stage: photo.stage as CleaningPhotoStage,
          signedUrl,
        }
      }) as BatchCleaningPhotoSignedUrl[]
    },
    enabled: Boolean(cleaningId),
    // Refresh active galleries one minute before their signed URLs expire.
    refetchInterval: 60 * 59 * 1000,
  })
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
