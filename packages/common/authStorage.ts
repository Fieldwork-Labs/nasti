import type { SupportedStorage } from "@supabase/supabase-js"

const DB_NAME = "nasti-auth"
const STORE_NAME = "kv"
const DB_VERSION = 1

const openDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })

const idbGet = async (key: string): Promise<string | null> => {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly")
    const req = tx.objectStore(STORE_NAME).get(key)
    req.onsuccess = () => resolve((req.result as string | undefined) ?? null)
    req.onerror = () => reject(req.error)
  })
}

const idbSet = async (key: string, value: string): Promise<void> => {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite")
    tx.objectStore(STORE_NAME).put(value, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

const idbRemove = async (key: string): Promise<void> => {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite")
    tx.objectStore(STORE_NAME).delete(key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export const createIdbAuthStorage = (): SupportedStorage => {
  if (
    typeof indexedDB === "undefined" ||
    typeof localStorage === "undefined"
  ) {
    return localStorage as unknown as SupportedStorage
  }

  return {
    isServer: false,
    getItem: async (key) => {
      try {
        const value = await idbGet(key)
        if (value !== null) return value
        const legacy = localStorage.getItem(key)
        if (legacy !== null) {
          await idbSet(key, legacy)
          return legacy
        }
        return null
      } catch {
        return localStorage.getItem(key)
      }
    },
    setItem: async (key, value) => {
      try {
        await idbSet(key, value)
      } catch {
        localStorage.setItem(key, value)
      }
    },
    removeItem: async (key) => {
      try {
        await idbRemove(key)
      } catch {
        // ignore
      }
      try {
        localStorage.removeItem(key)
      } catch {
        // ignore
      }
    },
  }
}
