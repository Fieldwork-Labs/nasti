import { useState, useCallback } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@nasti/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@nasti/ui/tabs"
import { Button } from "@nasti/ui/button"
import { Spinner } from "@nasti/ui/spinner"
import { useDropzone } from "react-dropzone"
import { Camera, Check } from "lucide-react"
import { useSpeciesPhotos } from "@/hooks/useSpeciesPhotos"
import { useCollectionsBySpecies } from "@/hooks/useCollectionsBySpecies"
import { useALAImages } from "@nasti/common/hooks/useALAImages"
import { Badge } from "@nasti/ui/badge"
import { supabase } from "@nasti/common/supabase"
import { queryClient } from "@nasti/common/utils"
import { useCollectionPhotosBySpecies } from "@/hooks/useCollectionPhotosBySpecies"

const AlaImageButton = ({
  imageUrl,
  onClick,
  isSelected,
  isAlreadyAdded,
}: {
  imageUrl: string
  onClick: () => void
  isSelected: boolean
  isAlreadyAdded: boolean
}) => {
  return (
    <button
      onClick={onClick}
      disabled={isAlreadyAdded}
      className={`group relative aspect-square overflow-hidden rounded-lg border-2 transition-all ${
        isAlreadyAdded
          ? "cursor-not-allowed border-gray-300 opacity-60"
          : isSelected
            ? "border-primary ring-primary ring-2"
            : "border-gray-200 hover:border-gray-300"
      }`}
    >
      <img
        src={imageUrl}
        alt={`ALA image ${imageUrl}`}
        className="h-full w-full object-cover"
      />
      {isSelected && (
        <div className="absolute inset-0 flex items-center justify-center bg-green-500/20">
          <div className="rounded-full bg-green-500 p-2">
            <Check className="h-6 w-6 text-white" />
          </div>
        </div>
      )}
      {isAlreadyAdded && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-900/60">
          <Badge variant="secondary" className="bg-white">
            Already Added
          </Badge>
        </div>
      )}
    </button>
  )
}

type AddSpeciesPhotoModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  speciesId: string
  alaGuid?: string | null
}

export const AddSpeciesPhotoModal = ({
  open,
  onOpenChange,
  speciesId,
  alaGuid,
}: AddSpeciesPhotoModalProps) => {
  const [selectedTab, setSelectedTab] = useState("upload")
  const [selectedCollectionPhotoIds, setSelectedCollectionPhotoIds] = useState<
    string[]
  >([])
  const [selectedALAIndices, setSelectedALAIndices] = useState<number[]>([])
  const [isProcessing, setIsProcessing] = useState(false)

  const { uploadPhotoAsync, canAddMore, photoCount, maxPhotos, photos } =
    useSpeciesPhotos(speciesId)

  const { data: collections } = useCollectionsBySpecies(speciesId)
  const collectionIds = collections?.map((c) => c.id) ?? []

  // Get all collection photos for this species
  const { data: alaImages, isLoading: alaLoading } = useALAImages(
    alaGuid,
    "thumbnail",
  )
  const { data: alaOriginals } = useALAImages(alaGuid, "original")

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      if (!canAddMore) {
        alert(`Maximum of ${maxPhotos} photos reached`)
        return
      }

      const remainingSlots = maxPhotos - photoCount
      const filesToUpload = acceptedFiles.slice(0, remainingSlots)

      setIsProcessing(true)
      try {
        for (const file of filesToUpload) {
          await uploadPhotoAsync({ file, sourceType: "upload" })
        }

        if (acceptedFiles.length > remainingSlots) {
          alert(
            `Only ${remainingSlots} photo(s) uploaded. Maximum of ${maxPhotos} photos allowed.`,
          )
        }
        onOpenChange(false)
      } catch (error) {
        console.error("Error uploading photos:", error)
        alert("Error uploading photos. Please try again.")
      } finally {
        setIsProcessing(false)
      }
    },
    [uploadPhotoAsync, canAddMore, photoCount, maxPhotos, onOpenChange],
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "image/*": [".jpeg", ".jpg", ".png", ".webp"],
    },
    maxSize: 52428800, // 50MB
    disabled: !canAddMore || isProcessing,
  })

  const handleAddCollectionPhotos = async () => {
    if (selectedCollectionPhotoIds.length === 0) return

    const remainingSlots = maxPhotos - photoCount
    if (selectedCollectionPhotoIds.length > remainingSlots) {
      alert(`Only ${remainingSlots} photo(s) can be added.`)
      return
    }

    setIsProcessing(true)
    try {
      // Get the Supabase auth token
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session) {
        throw new Error("Not authenticated")
      }

      // Call edge function to copy each photo
      const results = await Promise.allSettled(
        selectedCollectionPhotoIds.map(async (collectionPhotoId) => {
          const response = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/copy_collection_photo_to_species`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${session.access_token}`,
              },
              body: JSON.stringify({
                collectionPhotoId,
                speciesId,
              }),
            },
          )

          if (!response.ok) {
            const errorText = await response.text()
            throw new Error(errorText || "Failed to copy photo")
          }

          return await response.json()
        }),
      )

      // Count successes and failures
      const successCount = results.filter(
        (r) => r.status === "fulfilled",
      ).length
      const failureCount = results.filter((r) => r.status === "rejected").length

      // Invalidate species photos query to refetch the updated list
      if (successCount > 0) {
        await queryClient.invalidateQueries({
          queryKey: ["speciesPhotos", "bySpecies", speciesId],
        })
      }

      if (failureCount > 0) {
        alert(
          `Added ${successCount} photo(s). Failed to add ${failureCount} photo(s).`,
        )
      }

      setSelectedCollectionPhotoIds([])
      onOpenChange(false)
    } catch (error) {
      console.error("Error adding collection photos:", error)
      alert("Error adding photos. Please try again.")
    } finally {
      setIsProcessing(false)
    }
  }

  const handleAddALAImages = async () => {
    if (selectedALAIndices.length === 0) return

    const remainingSlots = maxPhotos - photoCount
    if (selectedALAIndices.length > remainingSlots) {
      alert(`Only ${remainingSlots} photo(s) can be added.`)
      return
    }

    setIsProcessing(true)
    try {
      for (const index of selectedALAIndices) {
        const imageUrl = alaOriginals?.[index]
        if (!imageUrl) continue

        // Download the image
        const response = await fetch(imageUrl)
        const blob = await response.blob()

        // Create a File object
        const filename = `ala-image-${index}-${Date.now()}.jpg`
        const file = new File([blob], filename, { type: blob.type })

        // Upload with ALA attribution
        await uploadPhotoAsync({
          file,
          sourceType: "ala",
          sourceReference: imageUrl,
          caption: "Source: Atlas of Living Australia",
        })
      }

      setSelectedALAIndices([])
      onOpenChange(false)
    } catch (error) {
      console.error("Error adding ALA images:", error)
      alert("Error adding ALA images. Please try again.")
    } finally {
      setIsProcessing(false)
    }
  }

  // Helper to check if a collection photo is already added
  const isCollectionPhotoAlreadyAdded = (collectionPhotoId: string) => {
    return photos?.some(
      (p) =>
        p.source_type === "collection_photo" &&
        p.source_reference === collectionPhotoId,
    )
  }

  // Helper to check if an ALA image is already added
  const isALAImageAlreadyAdded = (imageUrl: string) => {
    return Boolean(
      photos?.some(
        (p) => p.source_type === "ala" && p.source_reference === imageUrl,
      ),
    )
  }

  const toggleCollectionPhoto = (photoId: string) => {
    if (isCollectionPhotoAlreadyAdded(photoId)) return
    setSelectedCollectionPhotoIds((prev) =>
      prev.includes(photoId)
        ? prev.filter((id) => id !== photoId)
        : [...prev, photoId],
    )
  }

  const toggleALAImage = (index: number) => {
    const imageUrl = alaImages?.[index]
    if (!imageUrl || isALAImageAlreadyAdded(imageUrl)) return
    setSelectedALAIndices((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index],
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Species Profile Photos</DialogTitle>
          <DialogDescription>
            Add photos from multiple sources ({photoCount}/{maxPhotos} used)
          </DialogDescription>
        </DialogHeader>

        <Tabs value={selectedTab} onValueChange={setSelectedTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="upload">Upload</TabsTrigger>
            <TabsTrigger value="collection">Collection Photos</TabsTrigger>
            <TabsTrigger value="ala">ALA Images</TabsTrigger>
          </TabsList>

          <TabsContent value="upload" className="space-y-4">
            <div
              {...getRootProps()}
              className={`cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
                !canAddMore || isProcessing
                  ? "cursor-not-allowed border-gray-200 bg-gray-50 opacity-50"
                  : isDragActive
                    ? "border-primary bg-foreground/10"
                    : "hover:border-secondary hover:bg-primary-foreground/20 border-gray-300"
              }`}
            >
              <input {...getInputProps()} />
              <div className="flex flex-col items-center justify-center space-y-2">
                {isProcessing ? (
                  <>
                    <Spinner className="h-12 w-12" />
                    <p className="text-lg font-medium">Uploading...</p>
                  </>
                ) : (
                  <>
                    <Camera className="h-12 w-12 text-gray-400" />
                    <p className="text-lg font-medium">
                      {!canAddMore
                        ? `Maximum of ${maxPhotos} photos reached`
                        : isDragActive
                          ? "Drop the images here"
                          : "Drag & drop images here, or click to select"}
                    </p>
                    {canAddMore && (
                      <p className="text-sm text-gray-400">
                        Supported formats: JPEG, PNG, WebP (max 50MB)
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="collection" className="space-y-4">
            <div className="rounded-lg bg-blue-50 p-4">
              <p className="text-sm text-blue-800">
                Select photos from collections associated with this species.
                {selectedCollectionPhotoIds.length > 0 && (
                  <span className="ml-2 font-medium">
                    {selectedCollectionPhotoIds.length} selected
                  </span>
                )}
              </p>
            </div>

            {collectionIds.length === 0 ? (
              <div className="py-8 text-center text-gray-500">
                No collections found for this species. Create a collection first
                to use photos from collections.
              </div>
            ) : (
              <div className="space-y-4">
                <CollectionPhotoSelector
                  speciesId={speciesId}
                  selectedPhotoIds={selectedCollectionPhotoIds}
                  onTogglePhoto={toggleCollectionPhoto}
                  isPhotoAlreadyAdded={isCollectionPhotoAlreadyAdded}
                />
                {selectedCollectionPhotoIds.length > 0 && (
                  <div className="flex justify-end">
                    <Button
                      onClick={handleAddCollectionPhotos}
                      disabled={isProcessing}
                    >
                      {isProcessing ? (
                        <>
                          <Spinner className="mr-2 h-4 w-4" />
                          Processing...
                        </>
                      ) : (
                        `Add ${selectedCollectionPhotoIds.length} Photo(s)`
                      )}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="ala" className="space-y-4">
            <div className="rounded-lg bg-green-50 p-4">
              <p className="text-sm text-green-800">
                Select images from Atlas of Living Australia. Attribution will
                be added automatically.
                {selectedALAIndices.length > 0 && (
                  <span className="ml-2 font-medium">
                    {selectedALAIndices.length} selected
                  </span>
                )}
              </p>
            </div>

            {alaLoading ? (
              <div className="flex justify-center py-8">
                <Spinner className="h-8 w-8" />
              </div>
            ) : !alaImages || alaImages.length === 0 ? (
              <div className="py-8 text-center text-gray-500">
                No ALA images available for this species.
              </div>
            ) : (
              <div className="h-full space-y-4">
                <div className="grid grid-cols-6 gap-2 overflow-y-scroll">
                  {alaImages.map((imageUrl, index) => {
                    return (
                      <AlaImageButton
                        key={index}
                        imageUrl={imageUrl}
                        onClick={() => toggleALAImage(index)}
                        isSelected={selectedALAIndices.includes(index)}
                        isAlreadyAdded={isALAImageAlreadyAdded(imageUrl)}
                      />
                    )
                  })}
                </div>

                {selectedALAIndices.length > 0 && (
                  <div className="flex justify-end">
                    <Button
                      onClick={handleAddALAImages}
                      disabled={isProcessing}
                    >
                      {isProcessing ? (
                        <>
                          <Spinner className="mr-2 h-4 w-4" />
                          Storing...
                        </>
                      ) : (
                        `Add ${selectedALAIndices.length} Image(s)`
                      )}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

// Helper component for collection photo selection
type CollectionPhotoSelectorProps = {
  speciesId: string
  selectedPhotoIds: string[]
  onTogglePhoto: (photoId: string) => void
  isPhotoAlreadyAdded: (photoId: string) => boolean | undefined
}

const CollectionPhotoSelector = ({
  speciesId,
  selectedPhotoIds,
  onTogglePhoto,
  isPhotoAlreadyAdded,
}: CollectionPhotoSelectorProps) => {
  const { photos, isLoading } = useCollectionPhotosBySpecies(speciesId)

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }

  if (!photos || photos.length === 0) {
    return (
      <div className="py-8 text-center text-gray-500">
        No photos found in collections for this species.
      </div>
    )
  }

  return (
    <div className="grid grid-cols-6 gap-4">
      {photos.map((photo) => {
        const isAlreadyAdded = isPhotoAlreadyAdded(photo.id)
        return (
          <button
            key={photo.id}
            onClick={() => onTogglePhoto(photo.id)}
            disabled={isAlreadyAdded}
            className={`group relative aspect-square overflow-hidden rounded-lg border-2 transition-all ${
              isAlreadyAdded
                ? "cursor-not-allowed border-gray-300 opacity-60"
                : selectedPhotoIds.includes(photo.id)
                  ? "border-primary ring-primary ring-2"
                  : "border-gray-200 hover:border-gray-300"
            }`}
          >
            <img
              src={photo.signedUrl}
              alt={photo.caption || "Collection photo"}
              className="h-full w-full object-cover"
            />
            {selectedPhotoIds.includes(photo.id) && (
              <div className="absolute inset-0 flex items-center justify-center bg-green-500/20">
                <div className="rounded-full bg-green-500 p-2">
                  <Check className="h-6 w-6 text-white" />
                </div>
              </div>
            )}
            {isAlreadyAdded && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-900/60">
                <Badge variant="secondary" className="bg-white p-1">
                  Already Added
                </Badge>
              </div>
            )}
            {photo.caption && !isAlreadyAdded && (
              <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-2 py-1">
                <p className="truncate text-xs text-white">{photo.caption}</p>
              </div>
            )}
          </button>
        )
      })}
    </div>
  )
}
