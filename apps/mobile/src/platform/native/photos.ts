import { ActionSheet, ActionSheetButtonStyle } from "@capacitor/action-sheet"
import { Camera, MediaTypeSelection } from "@capacitor/camera"
import { Capacitor } from "@capacitor/core"
import type { GalleryPhoto, MediaResult } from "@capacitor/camera"
import type { PhotoService } from "../types"

type PickedPhoto = Pick<MediaResult, "webPath" | "uri"> &
  Partial<Pick<GalleryPhoto, "path" | "format">>

function getFileExtension(blob: Blob, photo: PickedPhoto) {
  const mimeExtension = blob.type.split("/")[1]
  if (mimeExtension) return mimeExtension.replace("jpeg", "jpg")

  if (photo.format) return photo.format.replace("jpeg", "jpg")

  const path = photo.webPath ?? photo.uri ?? photo.path
  const pathExtension = path?.split(".").pop()?.split("?")[0]
  return pathExtension || "jpg"
}

async function pickedPhotoToFile(photo: PickedPhoto) {
  const photoUrl = photo.webPath ?? photo.uri ?? photo.path
  if (!photoUrl) return null

  const response = await fetch(photoUrl)
  const blob = await response.blob()
  const extension = getFileExtension(blob, photo)
  const filename = `nasti-photo-${Date.now()}-${crypto.randomUUID()}.${extension}`

  return new File([blob], filename, {
    type: blob.type || `image/${extension}`,
  })
}

export const photos: PhotoService = {
  async addPhotos() {
    try {
      const { index, canceled } = await ActionSheet.showActions({
        title: "Add Photo",
        options: [
          { title: "Take Photo" },
          { title: "Choose from Library" },
          { title: "Cancel", style: ActionSheetButtonStyle.Cancel },
        ],
      })

      if (canceled || index === 2 || index === -1) return []

      const selectedPhotos =
        index === 0
          ? [
              await Camera.takePhoto({
                quality: 90,
                includeMetadata: false,
              }),
            ]
          : Capacitor.getPlatform() === "android"
            ? (
                await Camera.pickImages({
                  quality: 90,
                  limit: 0,
                })
              ).photos
            : (
                await Camera.chooseFromGallery({
                  mediaType: MediaTypeSelection.Photo,
                  allowMultipleSelection: true,
                  quality: 90,
                  includeMetadata: false,
                })
              ).results

      const files = await Promise.all(selectedPhotos.map(pickedPhotoToFile))
      return files.filter((file): file is File => file !== null)
    } catch (error) {
      console.warn("Photo selection cancelled or failed", error)
      return []
    }
  },
}
