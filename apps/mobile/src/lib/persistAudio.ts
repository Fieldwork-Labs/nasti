import { openDB, DBSchema } from "idb"

/**
 * Opt-in local cache for audio recordings, stored as Blobs (not base64).
 *
 * Unlike the photo `image-store`, this is NOT an eager mirror of remote audio.
 * It is written only when a recording is captured on THIS device, so the
 * originating device can play back immediately, offline, and before the upload
 * completes. Audio synced down from other devices is streamed on demand via a
 * signed Storage URL (see `useAudioUrl`) and is never written here.
 */

type AudioRecord = {
  id: string
  blob: Blob
  mime_type: string
  timestamp: number
}

type AudioChangeListener = () => void

const audioChangeListeners = new Map<string, Set<AudioChangeListener>>()

export const subscribeToAudio = (id: string, listener: AudioChangeListener) => {
  const listeners = audioChangeListeners.get(id) ?? new Set()
  listeners.add(listener)
  audioChangeListeners.set(id, listeners)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) audioChangeListeners.delete(id)
  }
}

function notifyAudioChanged(id: string) {
  audioChangeListeners.get(id)?.forEach((listener) => listener())
}

interface AudioDB extends DBSchema {
  audios: {
    key: string
    value: AudioRecord
    indexes: {
      timestamp: number
    }
  }
}

export const audioDB = openDB<AudioDB>("audio-store", 1, {
  upgrade(db) {
    const store = db.createObjectStore("audios", { keyPath: "id" })
    store.createIndex("timestamp", "timestamp")
  },
})

export const getAudio = (id: string) => {
  return new Promise<AudioRecord | undefined>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error("IndexedDB operation timed out"))
    }, 2000)

    audioDB
      .then((db) => db.get("audios", id))
      .then((audio) => {
        clearTimeout(timeoutId)
        resolve(audio)
      })
      .catch((error) => {
        clearTimeout(timeoutId)
        reject(error)
      })
  })
}

export const putAudio = async (
  id: string,
  blob: Blob,
  mime_type: string,
) => {
  const db = await audioDB
  await db.put("audios", { id, blob, mime_type, timestamp: Date.now() })
  notifyAudioChanged(id)
}

export const deleteAudio = async (id: string) => {
  const db = await audioDB
  await db.delete("audios", id)
  notifyAudioChanged(id)
}
