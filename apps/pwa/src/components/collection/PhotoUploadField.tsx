import { Button } from "@nasti/ui/button"
import { Label } from "@nasti/ui/label"
import { useEffect, useRef, useState } from "react"
import { cn } from "@nasti/ui/utils"

type PhotoUploadFieldProps = {
  label?: string
  onPhotosChange?: (files: File[]) => void
  className?: string
}

export function PhotoUploadField({
  label = "Photos",
  onPhotosChange,
  className,
}: PhotoUploadFieldProps) {
  const [photoMap, setPhotoMap] = useState<Record<string, File>>({})
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newEntries: Record<string, File> = {}
      Array.from(e.target.files).forEach((file) => {
        const url = URL.createObjectURL(file)
        newEntries[url] = file
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
      <div className="grid grid-cols-4 gap-2">
        {Object.entries(photoMap).map(([url]) => (
          <div key={url} className="relative">
            <img
              src={url}
              alt="preview"
              className="aspect-square w-full object-cover"
            />
            <Button
              variant={"ghost"}
              onClick={() => removePhoto(url)}
              className="absolute -right-1 -top-1 h-5 rounded-full border border-white bg-gray-600/90 p-1 text-white"
            >
              &times;
            </Button>
          </div>
        ))}
      </div>
    </div>
  )
}
