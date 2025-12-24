import { UploadPhotoVariables } from "@/hooks/usePhotosMutate"
import { Label } from "@nasti/ui/label"
import { cn } from "@nasti/ui/utils"
import {
  CollectionPhotosEditField,
  ExistingPhoto,
} from "./CollectionPhotosEditField"
import { CollectionPhotosUploadField } from "./CollectionPhotosUploadField"
import { useCallback, useEffect, useState } from "react"

export type PhotoChanges = {
  add: Array<UploadPhotoVariables>
  keep: Array<ExistingPhoto>
}

type CollectionPhotosFormProps = {
  initialPhotos?: Array<ExistingPhoto>
  onPhotosChange?: (photos: PhotoChanges) => void
  className?: string
}

export const CollectionPhotosForm = ({
  initialPhotos = [],
  onPhotosChange,
  className,
}: CollectionPhotosFormProps) => {
  const [changes, setChanges] = useState<PhotoChanges>({
    add: [],
    keep: initialPhotos,
  })

  useEffect(() => {
    onPhotosChange?.(changes)
  }, [changes])

  const handleNewPhotos = useCallback(
    (newPhotos: Array<UploadPhotoVariables>) => {
      setChanges((prev) => {
        const newChanges = {
          ...prev,
          add: newPhotos,
        }
        return newChanges
      })
    },
    [],
  )

  const handleUpdateExisting = useCallback((updated: ExistingPhoto[]) => {
    setChanges((prev) => ({
      ...prev,
      keep: updated,
    }))
  }, [])

  return (
    <div className={cn(className)}>
      <Label className="block text-lg">Photos</Label>
      <CollectionPhotosEditField
        existingPhotos={changes.keep}
        onPhotosChange={handleUpdateExisting}
      />

      <CollectionPhotosUploadField onPhotosChange={handleNewPhotos} />
    </div>
  )
}
