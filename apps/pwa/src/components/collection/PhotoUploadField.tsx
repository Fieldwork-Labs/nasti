import { Button } from "@nasti/ui/button"
import { Label } from "@nasti/ui/label"
import { useCallback, useEffect, useRef, useState } from "react"
import { cn } from "@nasti/ui/utils"
import { UploadPhotoVariables } from "@/hooks/useCollectionPhotosMutate"
import { PencilIcon } from "lucide-react"
import { Input } from "@nasti/ui/input"
import { useForm } from "react-hook-form"
import { fileDB } from "@/lib/persistFiles"

type NewPhoto = { file: File; caption?: string; id: string }
type Photos = Record<string, NewPhoto>

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
  onPhotosChange?: (photos: UploadPhotoVariables[]) => void
  className?: string
}

export function PhotoUploadField({
  label = "Photos",
  onPhotosChange,
  className,
}: PhotoUploadFieldProps) {
  const [photoMap, setPhotoMap] = useState<Photos>({})
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newEntries: Photos = {}
      await Promise.all(
        Array.from(e.target.files).map(async (file) => {
          const url = URL.createObjectURL(file)
          const id = crypto.randomUUID()
          newEntries[url] = { file, id }
          const db = await fileDB
          await db.put("files", file, id)
        }),
      )
      setPhotoMap((prev) => ({ ...prev, ...newEntries }))
    }
  }

  const removePhoto = async (url: string) => {
    const db = await fileDB
    setPhotoMap((prev) => {
      const { [url]: file, ...newMap } = prev
      db.delete("files", file.id)
      URL.revokeObjectURL(url)
      return newMap
    })
  }

  useEffect(() => {
    const photos = Object.values(photoMap).map((photo) => {
      return { caption: photo.caption, id: photo.id }
    })
    onPhotosChange?.(photos)
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
      <div className="mb-1 flex flex-col gap-1">
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
