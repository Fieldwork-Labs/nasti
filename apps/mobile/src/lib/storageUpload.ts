import { Upload, type HttpStack } from "tus-js-client"
import { createNastiSupabaseClientForToken } from "@nasti/common/supabase"
import type { RequestCredentials } from "./auth/liveSession"
import { sanitizeUploadError } from "./powersync/attachmentErrors"

export type StorageUploadInput = {
  bucket: string
  path: string
  file: File | Blob
  mimeType: string
  credentials: RequestCredentials
  metadata?: Record<string, string>
  onProgress?: (percentage: number) => void
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
}: StorageUploadInput, options: StorageUploadOptions = {}): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const upload = new Upload(file, {
      endpoint: `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/upload/resumable`,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: {
        authorization: `Bearer ${credentials.accessToken}`,
        "x-upsert": "true",
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
      onError: (error: unknown) => reject(sanitizeUploadError(error)),
      onProgress: (uploaded: number, total: number) => {
        if (total > 0) onProgress?.((uploaded / total) * 100)
      },
      onSuccess: () => resolve(),
    })

    upload
      .findPreviousUploads()
      .then((previousUploads) => {
        if (previousUploads.length) {
          upload.resumeFromPreviousUpload(previousUploads[0])
        }
        upload.start()
      })
      .catch((error: unknown) => reject(sanitizeUploadError(error)))
  })
}

export async function deleteFromStorage(
  bucket: string,
  path: string,
  credentials: RequestCredentials,
): Promise<void> {
  const client = createNastiSupabaseClientForToken(credentials.accessToken)
  const { error } = await client.storage.from(bucket).remove([path])
  if (!error || sanitizeUploadError(error).statusCode === 404) return
  throw sanitizeUploadError(error)
}
