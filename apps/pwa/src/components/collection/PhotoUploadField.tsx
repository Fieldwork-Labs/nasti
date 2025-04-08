import { Button } from "@nasti/ui/button"
import { Label } from "@nasti/ui/label"
import { useCallback, useEffect, useRef, useState } from "react"
import { cn } from "@nasti/ui/utils"
import { UploadPhotoVariables } from "@/hooks/useCollectionPhotosMutate"
import { PencilIcon } from "lucide-react"
import { Input } from "@nasti/ui/input"
import { useForm } from "react-hook-form"

type Photos = Record<string, UploadPhotoVariables>

// New PhotoThumbnail component
type PhotoThumbnailProps = {
  url: string
  caption?: string
  onRemove: (url: string) => void
  onUpdateCaption?: (url: string, caption: string) => void
}

function PhotoThumbnail({
  url,
  caption,
  onRemove,
  onUpdateCaption,
}: PhotoThumbnailProps) {
  const [isUpdatingCaption, setIsUpdatingCaption] = useState(false)

  const { register, handleSubmit } = useForm<{ caption: string }>({
    defaultValues: { caption },
    mode: "onChange",
  })

  const submit = useCallback(
    ({ caption }: { caption: string }) => {
      if (!onUpdateCaption) return
      onUpdateCaption(url, caption ?? "")
      setIsUpdatingCaption(false)
    },
    [onUpdateCaption, url],
  )
  return (
    <div className="relative">
      <img
        src={url}
        alt="preview"
        className="aspect-square w-full object-cover"
      />
      <Button
        variant="ghost"
        onClick={() => onRemove(url)}
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
          />
          <div className="flex justify-between">
            <Button
              className="text-xs"
              size={"sm"}
              variant="secondary"
              onClick={() => setIsUpdatingCaption(false)}
            >
              Cancel
            </Button>
            <Button
              size={"sm"}
              className="text-xs"
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
            {!caption && (
              <span className="text-muted-foreground">Add caption</span>
            )}
            {caption && <span>{caption}</span>}
            <PencilIcon height={16} width={16} />
          </Button>
        </>
      )}
    </div>
  )
}

type PhotoUploadFieldProps = {
  label?: string
  onPhotosChange?: (files: UploadPhotoVariables[]) => void
  className?: string
}

export function PhotoUploadField({
  label = "Photos",
  onPhotosChange,
  className,
}: PhotoUploadFieldProps) {
  const [photoMap, setPhotoMap] = useState<Photos>({})
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newEntries: Photos = {}
      Array.from(e.target.files).forEach((file) => {
        const url = URL.createObjectURL(file)
        newEntries[url] = { file }
      })
      setPhotoMap((prev) => ({ ...prev, ...newEntries }))
    }
  }

  const removePhoto = (url: string) => {
    setPhotoMap((prev) => {
      const newMap = { ...prev }
      delete newMap[url]
      URL.revokeObjectURL(url)
      return newMap
    })
  }

  useEffect(() => {
    onPhotosChange?.(Object.values(photoMap))
  }, [photoMap])

  useEffect(() => {
    return () => {
      Object.keys(photoMap).forEach((url) => URL.revokeObjectURL(url))
    }
  }, [photoMap])

  const handleUpdateCaption = useCallback((url: string, caption: string) => {
    setPhotoMap((prev) => ({ ...prev, [url]: { ...prev[url], caption } }))
  }, [])

  const openFilePicker = () => {
    fileInputRef.current?.click()
  }

  return (
    <div className={cn(className)}>
      <div className="mb-1 flex justify-between">
        <Label className="block text-lg">{label}</Label>

        {/* Hidden file input */}
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={handleUpload}
          ref={fileInputRef}
          style={{ display: "none" }}
        />

        {/* Custom trigger button */}
        <Button
          type="button"
          variant="outline"
          onClick={openFilePicker}
          className="mb-2"
        >
          Select Photos
        </Button>
      </div>

      {/* Thumbnails */}
      <div className="grid grid-cols-2 gap-2">
        {Object.entries(photoMap).map(([url, { caption }]) => (
          <div key={url} className="relative">
            <PhotoThumbnail
              url={url}
              caption={caption}
              onRemove={removePhoto}
              onUpdateCaption={handleUpdateCaption}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
