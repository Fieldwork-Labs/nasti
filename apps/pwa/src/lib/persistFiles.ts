import { openDB, DBSchema } from "idb"

interface PhotosDB extends DBSchema {
  images: {
    key: string
    value: { id: string; image: Base64URLString; timestamp: number }
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

export const getImage = async (id: string) => {
  const db = await imageDB
  return db.get("images", id)
}

export const putImage = async (id: string, image: Base64URLString) => {
  const db = await imageDB
  await db.put("images", { image, id, timestamp: Date.now() }, id)
}

export const deleteImage = async (id: string) => {
  const db = await imageDB
  db.delete("images", id)
}

export const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = (error) => reject(error)
  })
