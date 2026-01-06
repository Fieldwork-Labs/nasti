import { useEffect, useState } from "react"
import { useQuery, useMutation } from "@tanstack/react-query"
import { supabase } from "@nasti/common/supabase"
import useUserStore from "@/store/userStore"
import { queryClient } from "@nasti/common/utils"
import { SpeciesPhoto } from "@nasti/common/types"

const MAX_PHOTOS_PER_SPECIES = 10

export type SpeciesPhotoSignedUrl = SpeciesPhoto & {
  signedUrl: string
}

export const useSpeciesPhotos = (speciesId?: string) => {
  const [isUploading, setIsUploading] = useState(false)
  const { organisation } = useUserStore()

  // Fetch photos for a specific species
  const {
    data: photos,
    isLoading: photosIsLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["speciesPhotos", "bySpecies", speciesId],
    queryFn: async () => {
      if (!speciesId) return null
      const { data, error } = await supabase
        .from("species_photo")
        .select("*")
        .eq("species_id", speciesId)
        .order("display_order", { ascending: true })
        .order("uploaded_at", { ascending: false })

      if (error) throw error
      return data
    },
    enabled: Boolean(speciesId),
  })

  useEffect(() => {
    queryClient.invalidateQueries({
      queryKey: ["speciesPhotos", "signedUrl", "bySpecies", speciesId],
    })
  }, [photos, speciesId])

  // Get signed urls for each photo
  const { data: photosWithSignedUrls, isLoading: signedUrlsIsLoading } =
    useQuery({
      queryKey: ["speciesPhotos", "signedUrl", "bySpecies", speciesId],
      queryFn: async () => {
        if (!photos?.length) return []

        const { data } = await supabase.storage
          .from("species-profile-photos")
          .createSignedUrls(
            photos.map(({ url }) => url),
            60 * 60,
          )

        return (data?.map(({ signedUrl }, i) => ({
          ...photos[i],
          signedUrl,
        })) ?? []) as SpeciesPhotoSignedUrl[]
      },
      enabled: Boolean(speciesId) && Boolean(photos?.length),
      // Goes stale 1 min before signed url expires
      refetchInterval: 60 * 59 * 1000,
    })

  const isLoading = photosIsLoading || signedUrlsIsLoading

  // Upload photo mutation
  interface UploadPhotoVariables {
    file: File
    caption?: string
    sourceType?: "upload" | "collection_photo" | "ala"
    sourceReference?: string
  }

  const uploadPhotoMutation = useMutation<
    SpeciesPhoto,
    Error,
    UploadPhotoVariables
  >({
    mutationFn: async ({
      file,
      caption,
      sourceType = "upload",
      sourceReference,
    }) => {
      if (!speciesId) throw new Error("No species id specified")
      if (!organisation?.id) throw new Error("No organisation id")

      // Check photo limit
      const currentCount = photos?.length ?? 0
      if (currentCount >= MAX_PHOTOS_PER_SPECIES) {
        throw new Error(
          `Maximum of ${MAX_PHOTOS_PER_SPECIES} photos allowed per species`,
        )
      }

      const photoId = crypto.randomUUID()
      const fileExt = file.name.split(".").pop()
      if (!fileExt)
        throw new Error(`No file extension available for ${file.name}`)

      setIsUploading(true)

      const filePath = `${organisation.id}/species/${speciesId}/${photoId}.${fileExt}`

      // Upload file to Supabase Storage
      const { error: storageError } = await supabase.storage
        .from("species-profile-photos")
        .upload(filePath, file, {
          cacheControl: "3600",
          upsert: false,
          metadata: { speciesId, photoId },
        })

      if (storageError) throw storageError

      // Get next display order
      const nextDisplayOrder = currentCount

      // Create database record
      const { data, error } = await supabase
        .from("species_photo")
        .insert([
          {
            id: photoId,
            species_id: speciesId,
            organisation_id: organisation.id,
            url: filePath,
            caption: caption || null,
            source_type: sourceType,
            source_reference: sourceReference || null,
            display_order: nextDisplayOrder,
          },
        ])
        .select()
        .single()

      setIsUploading(false)
      if (error) throw error
      return data as SpeciesPhoto
    },
    onSuccess: (newPhoto) => {
      const queries = queryClient.getQueriesData({
        queryKey: ["speciesPhotos", "bySpecies", speciesId],
      })
      queries.forEach(([queryKey]) => {
        queryClient.setQueryData<SpeciesPhoto[]>(queryKey, (oldData) => {
          if (!oldData || oldData.length === 0) return [newPhoto]
          return [...oldData, newPhoto]
        })
      })
    },
  })

  // Delete photo mutation
  const deletePhotoMutation = useMutation({
    mutationFn: async (photoId: string) => {
      const { data: photo, error: fetchError } = await supabase
        .from("species_photo")
        .select("url")
        .eq("id", photoId)
        .single()

      if (fetchError) throw fetchError

      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from("species-profile-photos")
        .remove([photo.url])

      if (storageError) throw storageError

      // Delete record from database
      const { error: dbError } = await supabase
        .from("species_photo")
        .delete()
        .eq("id", photoId)

      if (dbError) throw dbError
      return photoId
    },
    onSuccess: (photoId) => {
      const queries = queryClient.getQueriesData({
        queryKey: ["speciesPhotos", "bySpecies", speciesId],
      })
      queries.forEach(([queryKey]) => {
        queryClient.setQueryData<SpeciesPhoto[]>(queryKey, (oldData) => {
          if (!oldData || oldData.length === 0) return []
          return oldData.filter((item) => item.id !== photoId)
        })
      })
    },
  })

  // Update photo caption
  type UpdateCaptionPayload = {
    caption?: string
    photoId: string
  }

  const updateCaptionMutation = useMutation<
    SpeciesPhotoSignedUrl,
    Error,
    UpdateCaptionPayload
  >({
    mutationFn: async ({ photoId, caption }) => {
      const { data, error } = await supabase
        .from("species_photo")
        .update({ caption })
        .eq("id", photoId)
        .select()
        .single()
        .overrideTypes<SpeciesPhoto>()

      if (error) throw error

      const { data: signedUrlData } = await supabase.storage
        .from("species-profile-photos")
        .createSignedUrl(photoId, 60 * 60)

      if (!signedUrlData) throw new Error("Failed to create signed url")
      const { signedUrl } = signedUrlData
      const signedUrlPhoto = { ...data, signedUrl }
      return signedUrlPhoto
    },
    onSuccess: (updatedPhoto) => {
      const queries = queryClient.getQueriesData({
        queryKey: ["speciesPhotos", "bySpecies", speciesId],
      })
      queries.forEach(([queryKey]) => {
        queryClient.setQueryData<SpeciesPhoto[]>(queryKey, (oldData) => {
          if (!oldData || oldData.length === 0) return [updatedPhoto]

          return oldData.map((item) =>
            item.id === updatedPhoto.id ? updatedPhoto : item,
          )
        })
      })
    },
  })

  // Update display order
  type UpdateDisplayOrderPayload = {
    photoId: string
    newDisplayOrder: number
  }

  const updateDisplayOrderMutation = useMutation<
    SpeciesPhoto,
    Error,
    UpdateDisplayOrderPayload
  >({
    mutationFn: async ({ photoId, newDisplayOrder }) => {
      const { data, error } = await supabase
        .from("species_photo")
        .update({ display_order: newDisplayOrder })
        .eq("id", photoId)
        .select()
        .single()
        .overrideTypes<SpeciesPhoto>()

      if (error) throw error
      return data
    },
    onSuccess: (updatedPhoto) => {
      const queries = queryClient.getQueriesData({
        queryKey: ["speciesPhotos", "bySpecies", speciesId],
      })
      queries.forEach(([queryKey]) => {
        queryClient.setQueryData<SpeciesPhoto[]>(queryKey, (oldData) => {
          if (!oldData || oldData.length === 0) return [updatedPhoto]

          return oldData.map((item) =>
            item.id === updatedPhoto.id ? updatedPhoto : item,
          )
        })
      })
    },
  })

  // Batch update display orders (useful for drag-and-drop reordering)
  type BatchUpdateDisplayOrderPayload = {
    updates: Array<{ photoId: string; displayOrder: number }>
  }

  const batchUpdateDisplayOrderMutation = useMutation<
    void,
    Error,
    BatchUpdateDisplayOrderPayload
  >({
    mutationFn: async ({ updates }) => {
      // Update all photos in sequence
      for (const { photoId, displayOrder } of updates) {
        const { error } = await supabase
          .from("species_photo")
          .update({ display_order: displayOrder })
          .eq("id", photoId)

        if (error) throw error
      }
    },
    onSuccess: () => {
      // Refetch to get fresh data with correct ordering
      queryClient.invalidateQueries({
        queryKey: ["speciesPhotos", "bySpecies", speciesId],
      })
    },
  })

  return {
    photos: photosWithSignedUrls,
    isLoading,
    isError,
    error,
    isUploading,
    signedUrlsIsLoading,
    isDeleting: deletePhotoMutation.isPending,
    canAddMore: (photos?.length ?? 0) < MAX_PHOTOS_PER_SPECIES,
    photoCount: photos?.length ?? 0,
    maxPhotos: MAX_PHOTOS_PER_SPECIES,
    uploadPhoto: uploadPhotoMutation.mutate,
    uploadPhotoAsync: uploadPhotoMutation.mutateAsync,
    deletePhoto: deletePhotoMutation.mutate,
    deletePhotoAsync: deletePhotoMutation.mutateAsync,
    updateCaption: updateCaptionMutation.mutate,
    updateCaptionAsync: updateCaptionMutation.mutateAsync,
    updateDisplayOrder: updateDisplayOrderMutation.mutate,
    updateDisplayOrderAsync: updateDisplayOrderMutation.mutateAsync,
    batchUpdateDisplayOrder: batchUpdateDisplayOrderMutation.mutate,
    batchUpdateDisplayOrderAsync: batchUpdateDisplayOrderMutation.mutateAsync,
  }
}
