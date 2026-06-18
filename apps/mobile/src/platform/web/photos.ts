import type { PhotoService } from "../types"

export const photos: PhotoService = {
  async addPhotos() {
    return new Promise<Array<File>>((resolve) => {
      const input = document.createElement("input")
      input.type = "file"
      input.accept = "image/*,android/force-camera-workaround"
      input.multiple = true
      input.className = "hidden"

      const cleanup = () => input.remove()

      input.addEventListener("cancel", () => {
        cleanup()
        resolve([])
      })

      input.addEventListener("change", () => {
        const files = input.files ? Array.from(input.files) : []
        cleanup()
        resolve(files)
      })

      document.body.append(input)
      input.click()
    })
  },
}
