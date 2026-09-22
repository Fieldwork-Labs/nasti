import { Upload } from "tus-js-client"
import type { RequestCredentials } from "./auth/liveSession"

export type SanitizedUploadError = Error & {
  statusCode: number | null
  retryable: boolean
  safeMessage: string
}

export type StorageUploadInput = {
  bucket: string
  path: string
  file: File | Blob
  mimeType: string
  credentials: RequestCredentials
  metadata?: Record<string, string>
  onProgress?: (percentage: number) => void
}

function responseStatus(error: unknown): number | null {
  if (!error || typeof error !== "object") return null
  const originalResponse = (error as { originalResponse?: unknown })
    .originalResponse
  if (
    originalResponse &&
    typeof originalResponse === "object" &&
    "getStatus" in originalResponse &&
    typeof originalResponse.getStatus === "function"
  ) {
    const status = originalResponse.getStatus()
    return typeof status === "number" ? status : null
  }
  const status = (error as { status?: unknown }).status
  return typeof status === "number" ? status : null
}

function safeErrorMessage(statusCode: number | null): string {
  if (statusCode === 413) return "Storage rejected the file as too large"
  if (statusCode === 415) return "Storage rejected the media type"
  if (statusCode === 422) return "Storage rejected the upload metadata"
  if (statusCode !== null && statusCode >= 400 && statusCode < 500) {
    return `Storage rejected the upload (HTTP ${statusCode})`
  }
  if (statusCode !== null && statusCode >= 500) {
    return `Storage temporarily unavailable (HTTP ${statusCode})`
  }
  return "Storage upload failed; it will be retried"
}

export function sanitizeUploadError(error: unknown): SanitizedUploadError {
  const statusCode = responseStatus(error)
  const retryable =
    statusCode === null ||
    statusCode === 401 ||
    statusCode === 403 ||
    statusCode === 408 ||
    statusCode === 429 ||
    statusCode >= 500
  const safeMessage = safeErrorMessage(statusCode)
  return Object.assign(new Error(safeMessage), {
    statusCode,
    retryable,
    safeMessage,
  })
}

export async function uploadToStorage({
  bucket,
  path,
  file,
  mimeType,
  credentials,
  metadata = {},
  onProgress,
}: StorageUploadInput): Promise<void> {
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
