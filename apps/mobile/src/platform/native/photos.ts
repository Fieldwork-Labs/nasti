import { ActionSheet, ActionSheetButtonStyle } from "@capacitor/action-sheet"
import { Camera, MediaTypeSelection } from "@capacitor/camera"
import type { MediaResult } from "@capacitor/camera"
import type { PhotoService } from "../types"

async function mediaResultToFile(photo: MediaResult) {
  const photoUrl = photo.webPath ?? photo.uri
  if (!photoUrl) return null

  const response = await fetch(photoUrl)
  const blob = await response.blob()
  const extension = photo.metadata?.format ?? "jpeg"
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
                includeMetadata: true,
              }),
            ]
          : (
              await Camera.chooseFromGallery({
                mediaType: MediaTypeSelection.Photo,
                allowMultipleSelection: true,
                quality: 90,
                includeMetadata: true,
              })
            ).results

      const files = await Promise.all(selectedPhotos.map(mediaResultToFile))
      return files.filter((file): file is File => file !== null)
    } catch (error) {
      console.warn("Photo selection cancelled or failed", error)
      return []
    }
  },
}
