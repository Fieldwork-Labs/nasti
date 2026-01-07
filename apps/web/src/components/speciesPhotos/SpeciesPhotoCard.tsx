import { useCallback, useState } from "react"
import { Edit2, Trash2, GripVertical } from "lucide-react"
import { Button } from "@nasti/ui/button"
import { Input } from "@nasti/ui/input"
import { Spinner } from "@nasti/ui/spinner"
import { Badge } from "@nasti/ui/badge"
import { type SpeciesPhotoSignedUrl } from "@/hooks/useSpeciesPhotos"

type PhotoCardProps = {
  photo: SpeciesPhotoSignedUrl
  onDelete?: (id: string) => Promise<string>
  onUpdateCaption?: (
    id: string,
    caption: string,
  ) => Promise<SpeciesPhotoSignedUrl>
  onClickPhoto?: (photo: SpeciesPhotoSignedUrl) => void
  isDraggable?: boolean
}

export const SpeciesPhotoCard = ({
  photo,
  onDelete,
  onUpdateCaption,
  onClickPhoto,
  isDraggable = false,
}: PhotoCardProps) => {
  const [isEditing, setIsEditing] = useState(false)
  const [isUpdating, setisUpdating] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [caption, setCaption] = useState(photo.caption || "")

  const handleSaveCaption = useCallback(async () => {
    setisUpdating(true)
    if (onUpdateCaption) await onUpdateCaption(photo.id, caption)
    setisUpdating(false)
    setIsEditing(false)
  }, [caption, onUpdateCaption, photo.id])

  const handleDelete = useCallback(async () => {
    setIsDeleting(true)
    if (onDelete) await onDelete(photo.id)
    setIsDeleting(false)
  }, [photo.id, onDelete])

  const getSourceBadge = () => {
    switch (photo.source_type) {
      case "ala":
        return (
          <Badge variant="secondary" className="text-xs">
            ALA
          </Badge>
        )
      case "collection_photo":
        return (
          <Badge variant="secondary" className="text-xs">
            Collection
          </Badge>
        )
      case "upload":
        return (
          <Badge variant="secondary" className="text-xs">
            Upload
          </Badge>
        )
      default:
        return null
    }
  }

  return (
    <div className="shadow-xs group overflow-hidden rounded-lg border bg-white transition-shadow hover:shadow-md">
      <div className="relative aspect-square overflow-hidden bg-gray-100">
        {isDraggable && (
          <div className="absolute left-2 top-2 z-10 cursor-grab rounded-full bg-gray-800/70 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100">
            <GripVertical className="h-4 w-4" />
          </div>
        )}
        <img
          src={photo.signedUrl}
          alt={photo.caption || "Species photo"}
          className={
            onClickPhoto && !onDelete
              ? "h-full w-full cursor-pointer object-cover"
              : "h-full w-full object-cover"
          }
          onClick={() => onClickPhoto && onClickPhoto(photo)}
        />
        {onDelete && (
          <button
            onClick={handleDelete}
            className="focus:outline-hidden absolute right-2 top-2 rounded-full bg-red-500 p-1 text-white hover:bg-red-600 focus:ring-2 focus:ring-red-500/50"
            title="Delete photo"
            disabled={isDeleting}
          >
            {!isDeleting && <Trash2 className="h-4 w-4" />}
            {isDeleting && <Spinner className="h-4 w-4 text-white" />}
          </button>
        )}
        <div className="absolute bottom-2 left-2">{getSourceBadge()}</div>
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
                if (isUpdating) return
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
                disabled={isUpdating}
                onClick={handleSaveCaption}
                className="h-min w-min rounded-sm p-1 text-xs"
              >
                {!isUpdating && "Save"}
                {isUpdating && "Saving..."}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex justify-between align-middle">
              <p className="text-secondary flex-1 text-xs">
                {photo.caption || (
                  <span className="text-muted italic">No caption</span>
                )}
              </p>
              {onUpdateCaption && (
                <button
                  className="text-primary"
                  onClick={() => setIsEditing(true)}
                >
                  <Edit2 className="h-3 w-3" />
                </button>
              )}
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
