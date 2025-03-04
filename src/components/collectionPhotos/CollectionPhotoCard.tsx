import { useCallback, useState } from "react"
import { Edit2, Trash2 } from "lucide-react"
import { CollectionPhoto, CollectionPhotoSignedUrl } from "@/types"
import { Button } from "../ui/button"
import { Input } from "../ui/input"
import { Spinner } from "../ui/spinner"
import { cn } from "@/lib/utils"

type PhotoCardProps = {
  photo: CollectionPhotoSignedUrl
  onDelete?: (id: string) => Promise<string>
  onUpdateCaption?: (id: string, caption: string) => Promise<CollectionPhoto>
  onClickPhoto?: (photo: CollectionPhotoSignedUrl) => void
}

export const CollectionPhotoCard = ({
  photo,
  onDelete,
  onUpdateCaption,
  onClickPhoto,
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

  return (
    <div className="overflow-hidden rounded-lg border bg-white shadow-sm transition-shadow hover:shadow-md">
      <div className="relative aspect-square overflow-hidden bg-gray-100">
        <img
          src={photo.signedUrl}
          alt={photo.caption || "Collection photo"}
          className={cn(
            "h-full w-full object-cover",
            onClickPhoto && !onDelete && "cursor-pointer",
          )}
          onClick={() => onClickPhoto && onClickPhoto(photo)}
        />
        {onDelete && (
          <button
            onClick={handleDelete}
            className="absolute right-2 top-2 rounded-full bg-red-500 p-1 text-white hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-50"
            title="Delete photo"
            disabled={isDeleting}
          >
            {!isDeleting && <Trash2 className="h-4 w-4" />}
            {isDeleting && <Spinner className="h-4 w-4 text-white" />}
          </button>
        )}
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
              <p className="flex-1 text-xs text-secondary">
                {photo.caption || (
                  <span className="italic text-muted">No caption</span>
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
