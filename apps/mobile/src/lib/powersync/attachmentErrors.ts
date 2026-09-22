export type SanitizedUploadError = Error & {
  statusCode: number | null
  retryable: boolean
  safeMessage: string
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
  if (typeof status === "number") return status
  const statusCode = (error as { statusCode?: unknown }).statusCode
  if (typeof statusCode === "number") return statusCode
  if (typeof statusCode === "string") {
    const parsed = Number.parseInt(statusCode, 10)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
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
  const terminalValidationStatuses = new Set([400, 413, 415, 422])
  const retryable = statusCode === null || !terminalValidationStatuses.has(statusCode)
  const safeMessage = safeErrorMessage(statusCode)
  return Object.assign(new Error(safeMessage), {
    statusCode,
    retryable,
    safeMessage,
  })
}
