import { useCallback, useState } from "react"
import { useDropzone } from "react-dropzone"
import { Camera, ArrowUp, ArrowDown } from "lucide-react"
import { useSpeciesPhotos } from "@/hooks/useSpeciesPhotos"
import { Spinner } from "@nasti/ui/spinner"
import { SpeciesPhotoCard } from "./SpeciesPhotoCard"
import { Button } from "@nasti/ui/button"

type SpeciesPhotoUploadProps = {
  speciesId?: string
  onAddPhotosClick?: () => void
}

export const SpeciesPhotoUpload = ({
  speciesId,
  onAddPhotosClick,
}: SpeciesPhotoUploadProps) => {
  const {
    photos,
    isLoading,
    isError,
    error,
    isUploading,
    uploadPhoto,
    updateCaptionAsync,
    deletePhotoAsync,
    batchUpdateDisplayOrderAsync,
    canAddMore,
    photoCount,
    maxPhotos,
  } = useSpeciesPhotos(speciesId)

  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null)

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (!speciesId) return
      if (!canAddMore) return

      // Only upload as many as we have room for
      const remainingSlots = maxPhotos - photoCount
      const filesToUpload = acceptedFiles.slice(0, remainingSlots)

      filesToUpload.forEach((file) => {
        uploadPhoto({ file })
      })

      if (acceptedFiles.length > remainingSlots) {
        alert(
          `Only ${remainingSlots} photo(s) uploaded. Maximum of ${maxPhotos} photos allowed.`,
        )
      }
    },
    [speciesId, uploadPhoto, canAddMore, photoCount, maxPhotos],
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "image/*": [".jpeg", ".jpg", ".png", ".webp"],
    },
    maxSize: 52428800, // 50MB
    disabled: !canAddMore,
  })

  const handleUpdateCaption = (photoId: string, newCaption: string) => {
    return updateCaptionAsync({ photoId, caption: newCaption })
  }

  const handleMoveUp = async (index: number) => {
    if (!photos || index === 0) return

    const reorderedPhotos = [...photos]
    const temp = reorderedPhotos[index]
    reorderedPhotos[index] = reorderedPhotos[index - 1]
    reorderedPhotos[index - 1] = temp

    const updates = reorderedPhotos.map((photo, i) => ({
      photoId: photo.id,
      displayOrder: i,
    }))

    await batchUpdateDisplayOrderAsync({ updates })
  }

  const handleMoveDown = async (index: number) => {
    if (!photos || index === photos.length - 1) return

    const reorderedPhotos = [...photos]
    const temp = reorderedPhotos[index]
    reorderedPhotos[index] = reorderedPhotos[index + 1]
    reorderedPhotos[index + 1] = temp

    const updates = reorderedPhotos.map((photo, i) => ({
      photoId: photo.id,
      displayOrder: i,
    }))

    await batchUpdateDisplayOrderAsync({ updates })
  }

  const handleDragStart = (e: React.DragEvent, index: number) => {
    e.dataTransfer.effectAllowed = "move"
    setDraggedIndex(index)
  }

  const handleDragEnd = () => {
    setDraggedIndex(null)
    setDropTargetIndex(null)
  }

  const handleDragOverPhoto = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    e.stopPropagation()
    if (draggedIndex !== null && draggedIndex !== index) {
      setDropTargetIndex(index)
    }
  }

  const handleDragLeave = () => {
    setDropTargetIndex(null)
  }

  const handleDropOnPhoto = async (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault()
    e.stopPropagation()

    if (draggedIndex === null || !photos || draggedIndex === targetIndex) {
      handleDragEnd()
      return
    }

    const reorderedPhotos = [...photos]
    const [draggedPhoto] = reorderedPhotos.splice(draggedIndex, 1)
    reorderedPhotos.splice(targetIndex, 0, draggedPhoto)

    const updates = reorderedPhotos.map((photo, i) => ({
      photoId: photo.id,
      displayOrder: i,
    }))

    await batchUpdateDisplayOrderAsync({ updates })
    handleDragEnd()
  }

  if (isError) {
    return <div className="text-red-600">Error: {(error as Error).message}</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        {onAddPhotosClick && (
          <Button onClick={onAddPhotosClick} disabled={!canAddMore}>
            Add Photos
          </Button>
        )}
      </div>

      {!onAddPhotosClick && (
        <div
          {...getRootProps()}
          className={`cursor-pointer rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
            !canAddMore
              ? "cursor-not-allowed border-gray-200 bg-gray-50 opacity-50"
              : isDragActive
                ? "border-primary bg-foreground/10"
                : "hover:border-secondary hover:bg-primary-foreground/20 border-gray-300"
          }`}
        >
          <input {...getInputProps()} />
          <div className="flex flex-col items-center justify-center space-y-2">
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
          </div>
        </div>
      )}

      {isUploading && (
        <div className="flex items-center justify-center gap-2 py-2">
          <Spinner />
          <span className="text-sm text-gray-600">Uploading...</span>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-4">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-green-700"></div>
        </div>
      ) : (
        <div className="mt-6">
          {photos && photos.length > 0 ? (
            <>
              <p className="mb-4 text-sm text-gray-600">
                Drag photos to reorder, or use the arrow buttons. The first
                photo will be used as the species display image.
              </p>
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 xl:grid-cols-6">
                {photos.map((photo, index) => (
                  <div
                    key={photo.id}
                    className={`relative transition-all duration-200 ${
                      draggedIndex === index
                        ? "scale-95 opacity-40"
                        : dropTargetIndex === index
                          ? "ring-4 ring-blue-400 ring-offset-2"
                          : ""
                    }`}
                  >
                    <div
                      draggable
                      onDragStart={(e) => handleDragStart(e, index)}
                      onDragEnd={handleDragEnd}
                      onDragOver={(e) => handleDragOverPhoto(e, index)}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDropOnPhoto(e, index)}
                      className="cursor-move"
                    >
                      <SpeciesPhotoCard
                        photo={photo}
                        onDelete={deletePhotoAsync}
                        onUpdateCaption={handleUpdateCaption}
                        isDraggable={true}
                      />
                    </div>
                    <div className="absolute left-2 top-2 z-20 flex gap-1">
                      {index > 0 && (
                        <button
                          onClick={() => handleMoveUp(index)}
                          className="focus:outline-hidden rounded-full bg-blue-500 p-1.5 text-white shadow-md hover:bg-blue-600 focus:ring-2 focus:ring-blue-500/50"
                          title="Move up"
                        >
                          <ArrowUp className="h-4 w-4" />
                        </button>
                      )}
                      {index < photos.length - 1 && (
                        <button
                          onClick={() => handleMoveDown(index)}
                          className="focus:outline-hidden rounded-full bg-blue-500 p-1.5 text-white shadow-md hover:bg-blue-600 focus:ring-2 focus:ring-blue-500/50"
                          title="Move down"
                        >
                          <ArrowDown className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="py-4 text-center text-gray-500">
              No photos added yet. Upload photos or select from existing
              sources.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
