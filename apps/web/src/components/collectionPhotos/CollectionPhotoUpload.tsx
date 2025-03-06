import { useCallback } from "react"
import { useDropzone } from "react-dropzone"
import { Camera } from "lucide-react"
import { useCollectionPhotos } from "@/hooks/useCollectionPhotos"
import { Spinner } from "../ui/spinner"
import { CollectionPhotoCard } from "./CollectionPhotoCard"

type CollectionPhotoUploadProps = { collectionId?: string }

export const CollectionPhotoUpload = ({
  collectionId,
}: CollectionPhotoUploadProps) => {
  const {
    photos,
    isLoading,
    isError,
    error,
    isUploading,
    uploadProgress,
    uploadPhoto,
    updateCaptionAsync,
    deletePhotoAsync,
  } = useCollectionPhotos(collectionId)

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (!collectionId) return

      // Process each file
      acceptedFiles.forEach((file) => {
        uploadPhoto({ file })
      })
    },
    [collectionId, uploadPhoto],
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "image/*": [".jpeg", ".jpg", ".png", ".gif"],
    },
    maxSize: 20971520, // 20MB
  })

  const handleUpdateCaption = (photoId: string, newCaption: string) => {
    return updateCaptionAsync({ photoId, caption: newCaption })
  }

  if (isError) {
    return <div className="text-red-600">Error: {(error as Error).message}</div>
  }

  return (
    <div className="space-y-4">
      <div
        {...getRootProps()}
        className={`cursor-pointer rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
          isDragActive
            ? "border-primary bg-foreground/10"
            : "hover:border-secondary hover:bg-primary-foreground/20 border-gray-300"
        }`}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center justify-center space-y-2">
          <Camera className="h-12 w-12 text-gray-400" />
          <p className="text-lg font-medium">
            {isDragActive
              ? "Drop the images here"
              : "Drag & drop images here, or click to select"}
          </p>
          <p className="text-sm text-gray-400">
            Supported formats: JPEG, PNG, GIF (max 20MB)
          </p>
        </div>
      </div>

      {isUploading && Object.keys(uploadProgress).length > 0 && (
        <div className="mt-4 space-y-2">
          <h3 className="font-medium">
            <Spinner />
          </h3>
          {Object.entries(uploadProgress).map(([id, progress]) => (
            <div key={id} className="flex items-center space-x-2">
              <div className="h-2.5 w-full rounded-full bg-gray-200">
                <div
                  className="h-2.5 rounded-full bg-blue-600"
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
              <span className="text-sm text-gray-600">{progress}%</span>
            </div>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-4">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-green-700"></div>
        </div>
      ) : (
        <div className="mt-6">
          <h3 className="mb-3 text-lg font-medium">Collection Photos</h3>
          {photos && photos.length > 0 ? (
            <div className="grid max-h-96 grid-cols-2 gap-4 overflow-scroll lg:grid-cols-3">
              {photos.map((photo) => (
                <CollectionPhotoCard
                  key={photo.id}
                  photo={photo}
                  onDelete={deletePhotoAsync}
                  onUpdateCaption={handleUpdateCaption}
                />
              ))}
            </div>
          ) : (
            <p className="py-4 text-center text-gray-500">
              No photos added yet. Upload some photos to get started.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
