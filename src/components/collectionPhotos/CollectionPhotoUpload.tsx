import { useCallback, useState } from "react"
import { useDropzone } from "react-dropzone"
import { Camera, Edit2, Trash2 } from "lucide-react"
import { useCollectionPhotos } from "@/hooks/useCollectionPhotos"
import { CollectionPhotoSignedUrl } from "@/types"
import { Button } from "../ui/button"
import { Input } from "../ui/input"
import { Spinner } from "../ui/spinner"

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
    updateCaption,
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
    updateCaption({ photoId, caption: newCaption })
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
            : "border-gray-300 hover:border-secondary hover:bg-primary-foreground/20"
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
                <PhotoCard
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

type PhotoCardProps = {
  photo: CollectionPhotoSignedUrl
  onDelete: (id: string) => Promise<string>
  onUpdateCaption: (id: string, caption: string) => void
}
const PhotoCard = ({ photo, onDelete, onUpdateCaption }: PhotoCardProps) => {
  const [isEditing, setIsEditing] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [caption, setCaption] = useState(photo.caption || "")

  const handleSaveCaption = () => {
    onUpdateCaption(photo.id, caption)
    setIsEditing(false)
  }

  const handleDelete = useCallback(async () => {
    setIsDeleting(true)
    await onDelete(photo.id)
    setIsDeleting(false)
  }, [photo.id, onDelete])

  return (
    <div className="overflow-hidden rounded-lg border bg-white shadow-sm transition-shadow hover:shadow-md">
      <div className="relative aspect-square overflow-hidden bg-gray-100">
        <img
          src={photo.signedUrl}
          alt={photo.caption || "Collection photo"}
          className="h-full w-full object-cover"
        />
        <button
          onClick={handleDelete}
          className="absolute right-2 top-2 rounded-full bg-red-500 p-1 text-white hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-50"
          title="Delete photo"
          disabled={isDeleting}
        >
          {!isDeleting && <Trash2 className="h-4 w-4" />}
          {isDeleting && <Spinner className="h-4 w-4 text-white" />}
        </button>
      </div>
      <div className="p-3">
        {isEditing ? (
          <div className="flex flex-col gap-1">
            <Input
              type="text"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              className="flex-1 rounded px-2 py-1 text-xs"
              placeholder="Add a caption..."
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  handleSaveCaption()
                }
              }}
            />
            <div className="flex justify-between">
              <Button
                onClick={() => setIsEditing(false)}
                className="h-min w-min rounded-sm p-1 text-xs"
                variant={"secondary"}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveCaption}
                className="h-min w-min rounded-sm p-1 text-xs"
              >
                Save
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex justify-between align-middle">
              <p className="flex-1 text-xs text-secondary">
                {photo.caption || (
                  <span className="italic text-muted">No caption</span>
                )}
              </p>
              <button
                className="text-primary"
                onClick={() => setIsEditing(true)}
              >
                <Edit2 className="h-3 w-3" />
              </button>
            </div>
            {photo.uploaded_at && (
              <p className="mt-1 text-xs text-gray-500">
                {new Date(photo.uploaded_at).toLocaleDateString()}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
