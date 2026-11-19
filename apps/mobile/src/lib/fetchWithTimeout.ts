const REQUEST_IDLE_TIMEOUT_MS = 30_000
const STORAGE_IDLE_TIMEOUT_MS = 60_000
// Fetch exposes download progress but not upload progress, so a known request
// body earns a size-based allowance before the response starts. 1 KiB/s keeps a
// large PowerSync batch uploadable on a very weak link, with no fixed cap.
const MIN_UPLOAD_BYTES_PER_SECOND = 1024
// The Response constructor rejects any body, even an empty one, for these.
// WebView fetch still exposes an empty stream for them (PostgREST's 204s).
const NULL_BODY_STATUSES = new Set([204, 205, 304])

export type FetchTimeoutOptions = {
  requestIdleTimeoutMs?: number
  storageIdleTimeoutMs?: number
  minUploadBytesPerSecond?: number
}

function requestBodyBytes(input: RequestInfo | URL, init?: RequestInit): number {
  const body = init?.body
  if (typeof body === "string") return new TextEncoder().encode(body).byteLength
  if (body instanceof Blob) return body.size
  if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) return body.byteLength
  if (body instanceof URLSearchParams) {
    return new TextEncoder().encode(body.toString()).byteLength
  }
  const headers = new Headers(
    init?.headers ?? (input instanceof Request ? input.headers : undefined),
  )
  const contentLength = Number(headers.get("content-length"))
  return Number.isFinite(contentLength) && contentLength > 0 ? contentLength : 0
}

function requestPathname(input: RequestInfo | URL): string {
  const url = input instanceof Request ? input.url : String(input)
  try {
    return new URL(url, import.meta.env.VITE_SUPABASE_URL ?? "http://localhost").pathname
  } catch {
    return ""
  }
}

/**
 * Same shape as a browser's own network failure: no `code` (so the connector
 * never mistakes it for a Postgres error code) and a TypeError, which
 * postgrest-js, storage-js and auth-js all treat as a retryable fetch failure.
 * A DOMException TimeoutError would carry `code: 23`, which the connector would
 * classify as a permanent integrity violation.
 */
export const networkTimeoutError = () =>
  new TypeError("Failed to fetch: network request timed out")

function concatChunks(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0)
  const body = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return body
}

/**
 * Mobile Supabase requests run inside serial locks (PowerSync's CRUD upload,
 * auth refresh), so a silent link must fail rather than hang. The deadline is
 * an inactivity timer: it resets whenever response bytes arrive, so a slow but
 * progressing response completes. Storage gets a longer idle deadline, and
 * REST requests get extra pre-response time proportional to their body size.
 *
 * The body is buffered before returning so a stall mid-body rejects fetch
 * itself, keeping it on the same retryable path as a connection stall instead
 * of surfacing as a body-parsing error.
 */
export function createFetchWithTimeout(
  fetcher: typeof fetch,
  {
    requestIdleTimeoutMs = REQUEST_IDLE_TIMEOUT_MS,
    storageIdleTimeoutMs = STORAGE_IDLE_TIMEOUT_MS,
    minUploadBytesPerSecond = MIN_UPLOAD_BYTES_PER_SECOND,
  }: FetchTimeoutOptions = {},
): typeof fetch {
  return async (input, init) => {
    const pathname = requestPathname(input)
    const idleTimeoutMs = pathname.startsWith("/storage/v1/")
      ? storageIdleTimeoutMs
      : requestIdleTimeoutMs
    const uploadAllowanceMs = pathname.startsWith("/rest/v1/")
      ? Math.ceil((requestBodyBytes(input, init) / minUploadBytesPerSecond) * 1000)
      : 0

    const deadline = new AbortController()
    const callerSignal =
      init?.signal ?? (input instanceof Request ? input.signal : undefined)
    const signals = callerSignal ? [callerSignal, deadline.signal] : [deadline.signal]
    // Older WebViews lack AbortSignal.any.
    const fallback = new AbortController()
    const forwardAbort = () => {
      const aborted = signals.find((candidate) => candidate.aborted)
      if (aborted) fallback.abort(aborted.reason)
    }
    const signal =
      typeof AbortSignal.any === "function" ? AbortSignal.any(signals) : fallback.signal
    if (signal === fallback.signal) {
      for (const source of signals) {
        source.addEventListener("abort", forwardAbort, { once: true })
      }
      forwardAbort()
    }

    let timer: ReturnType<typeof setTimeout> | undefined
    const resetDeadline = (delayMs = idleTimeoutMs) => {
      clearTimeout(timer)
      timer = setTimeout(() => deadline.abort(networkTimeoutError()), delayMs)
    }
    let rejectOnAbort: () => void = () => {}
    // Race every await against this: a native fetch or stream that ignores the
    // abort signal must still release the caller.
    const aborted = new Promise<never>((_resolve, reject) => {
      rejectOnAbort = () => reject(signal.reason)
      signal.addEventListener("abort", rejectOnAbort, { once: true })
      if (signal.aborted) rejectOnAbort()
    })
    aborted.catch(() => {})

    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
    resetDeadline(idleTimeoutMs + uploadAllowanceMs)
    try {
      const response = await Promise.race([fetcher(input, { ...init, signal }), aborted])
      if (!response.body) return response
      resetDeadline()
      reader = response.body.getReader()
      const chunks: Uint8Array[] = []
      while (true) {
        const { done, value } = await Promise.race([reader.read(), aborted])
        if (done) break
        chunks.push(value)
        if (value.byteLength > 0) resetDeadline()
      }
      const body = NULL_BODY_STATUSES.has(response.status) ? null : concatChunks(chunks)
      const buffered = new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      })
      Object.defineProperties(buffered, {
        url: { value: response.url },
        redirected: { value: response.redirected },
        type: { value: response.type },
      })
      return buffered
    } catch (error) {
      // Do not wait for a broken native stream's cancellation to release us.
      void reader?.cancel(error).catch(() => {})
      throw error
    } finally {
      clearTimeout(timer)
      signal.removeEventListener("abort", rejectOnAbort)
      for (const source of signals) source.removeEventListener("abort", forwardAbort)
      try {
        reader?.releaseLock()
      } catch {
        // Cleanup on older WebViews must not replace the network result/error.
      }
    }
  }
}

/** Resolves global fetch per call so tests and polyfills can replace it. */
export const fetchWithTimeout: typeof fetch = (input, init) =>
  createFetchWithTimeout(fetch)(input, init)
