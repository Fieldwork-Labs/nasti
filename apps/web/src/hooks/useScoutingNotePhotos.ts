import { useEffect, useState } from "react"
import { useQuery, useMutation } from "@tanstack/react-query"
import { supabase } from "@nasti/common/supabase"
import useUserStore from "@/store/userStore"
import { queryClient } from "@nasti/common/utils"
import { ScoutingNotePhoto } from "@nasti/common"

export type ScoutingNotePhotoSignedUrl = ScoutingNotePhoto & {
  signedUrl: string
}

export const useScoutingNotePhotos = (scoutingNoteId?: string) => {
  const [isUploading, setIsUploading] = useState(false)
  // TODO: use this to show progress - use TUS
  const [uploadProgress] = useState<Record<string, number>>({})
  const { organisation } = useUserStore()

  // Fetch photos for a specific scouting note
  const {
    data: photos,
    isLoading: photosIsLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["scoutingNotePhotos", "byScoutingNote", scoutingNoteId],
    queryFn: async () => {
      if (!scoutingNoteId) return null
      const { data, error } = await supabase
        .from("scouting_notes_photos")
        .select("*")
        .eq("scouting_note_id", scoutingNoteId)
        .order("uploaded_at", { ascending: false })

      if (error) throw error
      return data
    },
    enabled: Boolean(scoutingNoteId),
  })

  useEffect(() => {
    queryClient.invalidateQueries({
      queryKey: [
        "scoutingNotePhotos",
        "signedUrl",
        "byScoutingNote",
        scoutingNoteId,
      ],
    })
  }, [photos, scoutingNoteId])

  // get signed urls for each photo
  const { data: photosWithSignedUrls, isLoading: signedUrlsIsLoading } =
    useQuery({
      queryKey: [
        "scoutingNotePhotos",
        "signedUrl",
        "byScoutingNote",
        scoutingNoteId,
      ],
      queryFn: async () => {
        // Get public URL
        const { data } = await supabase.storage
          .from("collection-photos")
          .createSignedUrls(photos?.map(({ url }) => url) ?? [], 60 * 60)

        return (data?.map(({ signedUrl }, i) => ({
          ...photos?.[i],
          signedUrl,
        })) ?? []) as ScoutingNotePhotoSignedUrl[]
      },
      enabled: Boolean(scoutingNoteId) && Boolean(photos?.length),
      // goes stale 1 min before signed url expires
      refetchInterval: 60 * 59 * 1000,
    })

  const isLoading = photosIsLoading || signedUrlsIsLoading

  // Upload photo mutation
  interface UploadPhotoVariables {
    file: File
    caption?: string
  }

  const uploadPhotoMutation = useMutation<
    ScoutingNotePhoto,
    Error,
    UploadPhotoVariables
  >({
    mutationFn: async ({ file, caption }) => {
      if (!scoutingNoteId) throw new Error("No scouting note id specified")
      if (!organisation?.id) throw new Error("No organisation id")
      const photoId = crypto.randomUUID()
      const fileExt = file.name.split(".").pop()
      if (!fileExt)
        throw new Error(`No file extension available for ${file.name}`)
      setIsUploading(true)

      const filePath = `${organisation.id}/scouting-notes/${scoutingNoteId}/${photoId}.${fileExt}`

      // Upload file to Supabase Storage
      const { error: storageError } = await supabase.storage
        .from("collection-photos")
        .upload(filePath, file, {
          cacheControl: "3600",
          upsert: false,
          metadata: { scoutingNoteId, photoId },
        })

      if (storageError) throw storageError

      // Create database record
      const { data, error } = await supabase
        .from("scouting_notes_photos")
        .insert([
          {
            id: photoId,
            scouting_notes_id: scoutingNoteId,
            url: filePath,
            caption: caption || null,
          },
        ])
        .select()
        .single()

      setIsUploading(false)
      if (error) throw error
      return data as ScoutingNotePhoto
    },
    onSuccess: (newPhoto) => {
      const queries = queryClient.getQueriesData({
        queryKey: ["scoutingNotePhotos", "byScoutingNote", scoutingNoteId],
      })
      // update query data
      queries.forEach(([queryKey]) => {
        queryClient.setQueryData<ScoutingNotePhoto[]>(queryKey, (oldData) => {
          if (!oldData || oldData.length === 0) return [newPhoto]
          return [...oldData, newPhoto]
        })
      })
    },
  })

  // Delete photo mutation
  const deletePhotoMutation = useMutation({
    mutationFn: async (photoId: string) => {
      // Get the photo first to get the URL
      const { data: photo, error: fetchError } = await supabase
        .from("scouting_notes_photos")
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
        .from("scouting_notes_photos")
        .delete()
        .eq("id", photoId)

      if (dbError) throw dbError
      return photoId
    },
    onSuccess: (photoId) => {
      // just delete that guy from the query cache
      const queries = queryClient.getQueriesData({
        queryKey: ["scoutingNotePhotos", "byScoutingNote", scoutingNoteId],
      })
      // update query data
      queries.forEach(([queryKey]) => {
        queryClient.setQueryData<ScoutingNotePhoto[]>(queryKey, (oldData) => {
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
    ScoutingNotePhoto,
    Error,
    UpdateCaptionPayload
  >({
    mutationFn: async ({ photoId, caption }) => {
      const { data, error } = await supabase
        .from("scouting_notes_photos")
        .update({ caption })
        .eq("id", photoId)
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: (updatedPhoto) => {
      const queries = queryClient.getQueriesData({
        queryKey: ["scoutingNotePhotos", "byScoutingNote", scoutingNoteId],
      })
      // update query data
      queries.forEach(([queryKey]) => {
        queryClient.setQueryData<ScoutingNotePhoto[]>(queryKey, (oldData) => {
          if (!oldData || oldData.length === 0) return [updatedPhoto]

          return oldData.map((item) =>
            item.id === updatedPhoto.id ? updatedPhoto : item,
          )
        })
      })
    },
  })

  return {
    photos: photosWithSignedUrls,
    isLoading,
    isError,
    error,
    isUploading,
    uploadProgress,
    signedUrlsIsLoading,
    isDeleting: deletePhotoMutation.isPending,
    uploadPhoto: uploadPhotoMutation.mutate,
    uploadPhotoAsync: uploadPhotoMutation.mutateAsync,
    deletePhoto: deletePhotoMutation.mutate,
    deletePhotoAsync: deletePhotoMutation.mutateAsync,
    updateCaption: updateCaptionMutation.mutate,
    updateCaptionAsync: updateCaptionMutation.mutateAsync,
  }
}
