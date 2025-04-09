import { openDB } from "idb"

// Initialize the DB
export const fileDB = openDB("file-store", 1, {
  upgrade(db) {
    db.createObjectStore("files")
  },
})

export const getFile = async (id: string) => {
  const db = await fileDB
  return db.get("files", id)
}

export const deleteFile = async (id: string) => {
  const db = await fileDB
  db.delete("files", id)
}
