import { Upload, type HttpStack } from "tus-js-client"
import { createNastiSupabaseClientForToken } from "@nasti/common/supabase"
import type { RequestCredentials } from "./auth/liveSession"
import { sanitizeUploadError } from "./powersync/attachmentErrors"
import { TIMED_OUT, withTimeout } from "./withTimeout"

const UPLOAD_STALL_TIMEOUT_MS = 60_000
const STORAGE_LOOKUP_TIMEOUT_MS = 15_000
const STORAGE_DELETE_TIMEOUT_MS = 30_000

export type StorageUploadInput = {
  bucket: string
  path: string
  file: File | Blob
  mimeType: string
  credentials: RequestCredentials
  metadata?: Record<string, string>
  onProgress?: (percentage: number) => void
  upsert?: boolean
}

/** Injectable HTTP transport used by adapter-level tests. */
export type StorageUploadOptions = {
  httpStack?: HttpStack
  urlStorage?: {
    findUploadsByFingerprint: (fingerprint: string) => Promise<unknown[]>
    addUpload: (fingerprint: string, upload: unknown) => Promise<string>
    removeUpload: (key: string) => Promise<void>
  }
}

export async function uploadToStorage({
  bucket,
  path,
  file,
  mimeType,
  credentials,
  metadata = {},
  onProgress,
  upsert = true,
}: StorageUploadInput, options: StorageUploadOptions = {}): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let settled = false
    let watchdog: ReturnType<typeof setTimeout> | undefined
    const finish = (error?: unknown) => {
      if (settled) return
      settled = true
      clearTimeout(watchdog)
      if (error) reject(sanitizeUploadError(error))
      else resolve()
    }
    const upload = new Upload(file, {
      endpoint: `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/upload/resumable`,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: {
        authorization: `Bearer ${credentials.accessToken}`,
        "x-upsert": String(upsert),
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      metadata: {
        bucketName: bucket,
        objectName: path,
        contentType: mimeType,
        cacheControl: "3600",
        ...metadata,
      },
      chunkSize: 6 * 1024 * 1024,
      ...(options.httpStack ? { httpStack: options.httpStack } : {}),
      ...(options.urlStorage ? { urlStorage: options.urlStorage as never } : {}),
      onError: (error: unknown) => finish(error),
      onProgress: (uploaded: number, total: number) => {
        armWatchdog()
        if (total > 0) onProgress?.((uploaded / total) * 100)
      },
      onSuccess: () => finish(),
    })

    const armWatchdog = () => {
      if (settled) return
      clearTimeout(watchdog)
      watchdog = setTimeout(() => {
        // An upload with no progress must release the queue's lease. Abort the
        // XHR as well as rejecting, so a late response cannot keep it alive.
        void upload.abort().catch(() => undefined)
        finish(new Error("Storage upload stalled"))
      }, UPLOAD_STALL_TIMEOUT_MS)
    }
    armWatchdog()

    upload
      .findPreviousUploads()
      .then((previousUploads) => {
        if (settled) return
        if (previousUploads.length) {
          upload.resumeFromPreviousUpload(previousUploads[0])
        }
        upload.start()
      })
      .catch((error: unknown) => finish(error))
  })
}

function storageErrorStatus(error: unknown): number | null {
  if (!error || typeof error !== "object") return null
  const candidate = error as { status?: unknown; statusCode?: unknown; originalError?: { status?: unknown } }
  const raw = candidate.status ?? candidate.statusCode ?? candidate.originalError?.status
  if (typeof raw === "number") return raw
  if (typeof raw === "string" && /^\d{3}$/.test(raw)) return Number(raw)
  return null
}

/** A failed authorization or stalled lookup must never be mistaken for absence. */
export async function storageObjectExists(
  bucket: string,
  path: string,
  credentials: RequestCredentials,
): Promise<boolean> {
  const client = createNastiSupabaseClientForToken(credentials.accessToken)
  const result = await withTimeout(client.storage.from(bucket).exists(path), STORAGE_LOOKUP_TIMEOUT_MS)
  if (result === TIMED_OUT) throw new Error("Storage lookup timed out")
  if (!result.error) return result.data
  if (storageErrorStatus(result.error) === 404) return false
  throw sanitizeUploadError(result.error)
}

export async function deleteFromStorage(
  bucket: string,
  path: string,
  credentials: RequestCredentials,
): Promise<void> {
  const client = createNastiSupabaseClientForToken(credentials.accessToken)
  const result = await withTimeout(client.storage.from(bucket).remove([path]), STORAGE_DELETE_TIMEOUT_MS)
  if (result === TIMED_OUT) throw new Error("Storage deletion timed out")
  const { error } = result
  if (!error || sanitizeUploadError(error).statusCode === 404) return
  throw sanitizeUploadError(error)
}
