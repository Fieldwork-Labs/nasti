import { openDB, DBSchema } from "idb"

type ImageRecord = {
  id: string
  image: Base64URLString
  timestamp: number
}

type ImageChangeListener = () => void

const imageChangeListeners = new Map<string, Set<ImageChangeListener>>()

export const subscribeToImage = (
  id: string,
  listener: ImageChangeListener,
) => {
  const listeners = imageChangeListeners.get(id) ?? new Set()
  listeners.add(listener)
  imageChangeListeners.set(id, listeners)

  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) imageChangeListeners.delete(id)
  }
}

function notifyImageChanged(id: string) {
  imageChangeListeners.get(id)?.forEach((listener) => listener())
}

interface PhotosDB extends DBSchema {
  images: {
    key: string
    value: ImageRecord
    indexes: {
      timestamp: number
    }
  }
}

// Initialize the DB
export const imageDB = openDB<PhotosDB>("image-store", 1, {
  upgrade(db) {
    const imageStore = db.createObjectStore("images", { keyPath: "id" })
    imageStore.createIndex("timestamp", "timestamp")
  },
})
export const getImage = (id: string) => {
  return new Promise<ImageRecord | undefined>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error("IndexedDB operation timed out"))
    }, 2000)

    imageDB
      .then((db) => db.get("images", id))
      .then((image) => {
        clearTimeout(timeoutId)
        resolve(image)
      })
      .catch((error) => {
        clearTimeout(timeoutId)
        reject(error)
      })
  })
}

export const getImages = async (ids: string[]) => {
  const db = await imageDB
  const tx = db.transaction("images", "readonly")
  const store = tx.objectStore("images")

  const promises = ids.map((id) => store.get(id))
  const results = await Promise.all(promises)

  await tx.done

  return results.filter((image) => image !== undefined)
}

export const putImage = async (id: string, image: Base64URLString) => {
  const db = await imageDB
  await db.put("images", { image, id, timestamp: Date.now() })
  notifyImageChanged(id)
}

export const deleteImage = async (id: string) => {
  const db = await imageDB
  await db.delete("images", id)
  notifyImageChanged(id)
}

export const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = (error) => reject(error)
  })
