import { PendingCollectionPhoto } from "@/hooks/usePhotosMutate"
import { CollectionPhoto } from "@nasti/common/types"
import { Button } from "@nasti/ui/button"
import { Input } from "@nasti/ui/input"
import { cn } from "@nasti/ui/utils"
import { PencilIcon } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { usePhotoUrl } from "@/hooks/usePhotoUrl"

export type ExistingPhoto = CollectionPhoto | PendingCollectionPhoto

type PhotoThumbnailProps = {
  photo: ExistingPhoto
  onRemove: (id: string) => void
  onUpdateCaption?: (id: string, caption: string) => void
}

function PhotoThumbnail({
  photo,
  onRemove,
  onUpdateCaption,
}: PhotoThumbnailProps) {
  const [isUpdatingCaption, setIsUpdatingCaption] = useState(false)

  const { register, handleSubmit } = useForm<{ caption: string }>({
    defaultValues: { caption: photo.caption ?? "" },
    mode: "onChange",
  })

  const submit = useCallback(
    ({ caption }: { caption: string }) => {
      if (!onUpdateCaption) return
      onUpdateCaption(photo.id, caption ?? "")
      setIsUpdatingCaption(false)
    },
    [onUpdateCaption, photo.id],
  )

  const { data: url } = usePhotoUrl({ photoId: photo.id })
  if (!url) return null
  return (
    <div className="relative">
      <img
        src={url}
        alt="preview"
        className="aspect-square w-full object-cover"
      />
      <Button
        variant="ghost"
        onClick={() => onRemove(photo.id)}
        className="absolute -right-1 -top-1 h-5 rounded-full border border-white bg-gray-600/90 p-1 text-white"
      >
        &times;
      </Button>
      {isUpdatingCaption && (
        <div className="mt-1 space-y-1">
          <Input
            {...register("caption")}
            placeholder="Enter caption"
            className="h-6 text-xs"
            autoFocus
            autoComplete="off"
          />
          <div className="flex justify-between">
            <Button
              className="h-6 text-xs"
              size={"sm"}
              variant="secondary"
              onClick={() => setIsUpdatingCaption(false)}
            >
              Cancel
            </Button>
            <Button
              size={"sm"}
              className="h-6 text-xs"
              variant="default"
              onClick={handleSubmit(submit)}
            >
              Save
            </Button>
          </div>
        </div>
      )}
      {!isUpdatingCaption && (
        <>
          <Button
            variant="ghost"
            className="flex w-full justify-between px-1"
            onClick={() => setIsUpdatingCaption(true)}
          >
            {!photo.caption && (
              <span className="text-muted-foreground">Add caption</span>
            )}
            {photo.caption && <span>{photo.caption}</span>}
            <PencilIcon height={16} width={16} />
          </Button>
        </>
      )}
    </div>
  )
}

type CollectionPhotosEditFieldProps = {
  label?: string
  existingPhotos: Array<ExistingPhoto>
  onPhotosChange: (photos: Array<ExistingPhoto>) => void
  className?: string
}

export const CollectionPhotosEditField = ({
  existingPhotos,
  onPhotosChange,
  className,
}: CollectionPhotosEditFieldProps) => {
  const [newPhotos, setNewPhotos] =
    useState<Array<ExistingPhoto>>(existingPhotos)

  useEffect(() => {
    onPhotosChange?.(newPhotos)
  }, [newPhotos])

  const removeExistingPhoto = useCallback((id: string) => {
    setNewPhotos((prev) => prev.filter((p) => p.id !== id))
  }, [])

  const handleUpdateCaption = useCallback((id: string, caption: string) => {
    setNewPhotos((prev) =>
      prev.map((p) => (p.id === id ? { ...p, caption } : p)),
    )
  }, [])

  return (
    <div className={cn(className)}>
      {/* Thumbnails */}
      <div className="grid grid-cols-2 gap-2">
        {newPhotos?.map((photo) => (
          <div key={photo.id} className="relative">
            <PhotoThumbnail
              photo={photo}
              onRemove={() => removeExistingPhoto(photo.id)}
              onUpdateCaption={handleUpdateCaption}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
