import { describe, expect, it, vi } from "vitest"
import { createFetchWithTimeout } from "../fetchWithTimeout"

const REST_URL = "https://project.supabase.co/rest/v1/species"
const STORAGE_URL = "https://project.supabase.co/storage/v1/object/photos/a.jpg"
const encoder = new TextEncoder()

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** A fetch whose response never arrives, unless the request is aborted. */
const silentFetch = vi.fn<typeof fetch>(
  (_input, init) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason))
    }),
)

/** A fetch that ignores its abort signal entirely, like a wedged native bridge. */
const deafFetch: typeof fetch = () => new Promise<Response>(() => {})

function streamingResponse(
  chunks: string[],
  { intervalMs, stallAfter }: { intervalMs: number; stallAfter?: number },
  status = 200,
) {
  let sent = 0
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (stallAfter !== undefined && sent >= stallAfter) {
        await new Promise(() => {})
      }
      if (sent >= chunks.length) {
        controller.close()
        return
      }
      await delay(intervalMs)
      controller.enqueue(encoder.encode(chunks[sent]))
      sent += 1
    },
  })
  return new Response(body, {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

describe("createFetchWithTimeout", () => {
  it("rejects with a retryable network error when no response arrives", async () => {
    const timedFetch = createFetchWithTimeout(silentFetch, { requestIdleTimeoutMs: 30 })

    const error = await timedFetch(REST_URL).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(TypeError)
    expect((error as TypeError).message).toMatch(/network request timed out/)
    // No `code`: the row connector must not read it as a Postgres error code.
    expect(error).not.toHaveProperty("code")
    const signal = silentFetch.mock.calls[0]?.[1]?.signal
    expect(signal?.aborted).toBe(true)
  })

  it("releases the caller even when the transport ignores the abort", async () => {
    const timedFetch = createFetchWithTimeout(deafFetch, { requestIdleTimeoutMs: 30 })
    await expect(timedFetch(REST_URL)).rejects.toThrow(/timed out/)
  })

  it("times out a response body that stalls after headers", async () => {
    const timedFetch = createFetchWithTimeout(
      async () => streamingResponse(["[1,", "2]"], { intervalMs: 5, stallAfter: 1 }),
      { requestIdleTimeoutMs: 40 },
    )
    await expect(timedFetch(REST_URL)).rejects.toThrow(/timed out/)
  })

  it("does not time out a slow response that keeps making progress", async () => {
    const chunks = ['[{"id":', '"a"},', '{"id":', '"b"},', '{"id":', '"c"}]']
    const timedFetch = createFetchWithTimeout(
      async () => streamingResponse(chunks, { intervalMs: 25 }, 201),
      { requestIdleTimeoutMs: 60 },
    )

    const started = Date.now()
    const response = await timedFetch(REST_URL)

    // Total time well exceeds the idle deadline; each chunk resets it.
    expect(Date.now() - started).toBeGreaterThan(120)
    expect(response.status).toBe(201)
    expect(await response.json()).toEqual([{ id: "a" }, { id: "b" }, { id: "c" }])
  })

  it("gives Storage a longer idle deadline than REST", async () => {
    const respondAfter = (ms: number): typeof fetch => async () => {
      await delay(ms)
      return new Response("{}", { status: 200 })
    }
    const options = { requestIdleTimeoutMs: 20, storageIdleTimeoutMs: 200 }

    await expect(
      createFetchWithTimeout(respondAfter(60), options)(REST_URL),
    ).rejects.toThrow(/timed out/)
    await expect(
      createFetchWithTimeout(respondAfter(60), options)(STORAGE_URL),
    ).resolves.toHaveProperty("status", 200)
  })

  it("extends the pre-response deadline for a large REST request body", async () => {
    const respondAfter: typeof fetch = async () => {
      await delay(80)
      return new Response(null, { status: 204 })
    }
    // 100 bytes at 1000 B/s = 100 ms of extra allowance on a 20 ms deadline.
    const timedFetch = createFetchWithTimeout(respondAfter, {
      requestIdleTimeoutMs: 20,
      minUploadBytesPerSecond: 1000,
    })

    const response = await timedFetch(REST_URL, {
      method: "POST",
      body: "x".repeat(100),
    })
    expect(response.status).toBe(204)
    await expect(
      timedFetch(REST_URL, { method: "POST", body: "x" }),
    ).rejects.toThrow(/timed out/)
  })

  it("preserves error responses with their bodies", async () => {
    const timedFetch = createFetchWithTimeout(
      async () =>
        new Response(JSON.stringify({ code: "42501", message: "denied" }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        }),
      { requestIdleTimeoutMs: 50 },
    )

    const response = await timedFetch(REST_URL)
    expect(response.status).toBe(403)
    expect(response.headers.get("content-type")).toBe("application/json")
    expect(await response.json()).toEqual({ code: "42501", message: "denied" })
  })

  it("propagates a caller's abort", async () => {
    const timedFetch = createFetchWithTimeout(silentFetch, { requestIdleTimeoutMs: 1000 })
    const controller = new AbortController()
    const request = timedFetch(REST_URL, { signal: controller.signal })
    controller.abort(new Error("caller cancelled"))
    await expect(request).rejects.toThrow("caller cancelled")
  })
})
