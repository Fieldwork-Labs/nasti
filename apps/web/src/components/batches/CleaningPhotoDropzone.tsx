import { useCallback } from "react"
import { useDropzone } from "react-dropzone"
import { Camera, X } from "lucide-react"
import { cn } from "@nasti/ui/utils"

import type {
  BatchCleaningPhotoSignedUrl,
  CleaningPhotoStage,
  StagedCleaningPhoto,
} from "@/hooks/useBatchCleaningPhotos"

type CleaningPhotoDropzoneProps = {
  label: string
  stage: CleaningPhotoStage
  existingPhotos?: BatchCleaningPhotoSignedUrl[]
  photos: StagedCleaningPhoto[]
  onAdd: (photos: StagedCleaningPhoto[]) => void
  onRemove: (photoId: string) => void
  onRemoveExisting?: (photo: BatchCleaningPhotoSignedUrl) => void
  disabled?: boolean
}

/**
 * Stages photos locally — they're uploaded once the cleaning record exists.
 */
export const CleaningPhotoDropzone = ({
  label,
  stage,
  existingPhotos = [],
  photos,
  onAdd,
  onRemove,
  onRemoveExisting,
  disabled,
}: CleaningPhotoDropzoneProps) => {
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      onAdd(
        acceptedFiles.map((file) => ({
          id: crypto.randomUUID(),
          file,
          stage,
          previewUrl: URL.createObjectURL(file),
        })),
      )
    },
    [onAdd, stage],
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    disabled,
    accept: {
      "image/*": [".jpeg", ".jpg", ".png", ".webp"],
    },
    maxSize: 52428800, // 50MB
  })

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{label}</p>
      <div
        {...getRootProps()}
        className={cn(
          "cursor-pointer rounded-lg border-2 border-dashed p-4 text-center transition-colors",
          isDragActive
            ? "border-primary bg-foreground/10"
            : "hover:border-secondary hover:bg-primary-foreground/20 border-gray-300",
          disabled && "cursor-not-allowed opacity-50",
        )}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center justify-center space-y-1">
          <Camera className="h-8 w-8 text-gray-400" />
          <p className="text-sm">
            {isDragActive
              ? "Drop the images here"
              : "Drag & drop images here, or click to select"}
          </p>
          <p className="text-xs text-gray-400">JPEG, PNG, WEBP (max 50MB)</p>
        </div>
      </div>

      {(existingPhotos.length > 0 || photos.length > 0) && (
        <div className="grid grid-cols-3 gap-2 lg:grid-cols-4">
          {existingPhotos.map((photo) => (
            <div
              key={photo.id}
              className="group relative aspect-square overflow-hidden rounded-md border"
            >
              <img
                src={photo.signedUrl}
                alt={photo.caption ?? `${stage} cleaning photo`}
                className="h-full w-full object-cover"
              />
              {onRemoveExisting && (
                <button
                  type="button"
                  aria-label={`Remove ${stage} cleaning photo`}
                  disabled={disabled}
                  onClick={() => onRemoveExisting(photo)}
                  className="bg-background/80 absolute right-1 top-1 cursor-pointer rounded-full p-1 opacity-0 transition-opacity focus:opacity-100 disabled:cursor-not-allowed group-hover:opacity-100"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
          {photos.map((photo) => (
            <div
              key={photo.id}
              className="group relative aspect-square overflow-hidden rounded-md border"
            >
              <img
                src={photo.previewUrl}
                alt={photo.file.name}
                className="h-full w-full object-cover"
              />
              <button
                type="button"
                aria-label={`Remove ${photo.file.name}`}
                onClick={() => onRemove(photo.id)}
                className="bg-background/80 absolute right-1 top-1 cursor-pointer rounded-full p-1 opacity-0 transition-opacity focus:opacity-100 group-hover:opacity-100"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
