import { beforeEach, describe, expect, it, vi } from "vitest"

const { uploadConstructor, removeObjectMock, existsObjectMock, clientForTokenMock } = vi.hoisted(() => ({
  uploadConstructor: vi.fn(),
  removeObjectMock: vi.fn(),
  existsObjectMock: vi.fn(),
  clientForTokenMock: vi.fn(),
}))

vi.mock("tus-js-client", () => ({
  Upload: uploadConstructor,
}))
vi.mock("@nasti/common/supabase", () => ({
  createNastiSupabaseClientForToken: clientForTokenMock,
}))

import { deleteFromStorage, storageObjectExists, uploadToStorage } from "../storageUpload"
import { sanitizeUploadError } from "../powersync/attachmentErrors"

describe("storageUpload", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clientForTokenMock.mockReturnValue({
      storage: { from: vi.fn(() => ({ remove: removeObjectMock, exists: existsObjectMock })) },
    })
    removeObjectMock.mockResolvedValue({ error: null })
    existsObjectMock.mockResolvedValue({ data: true, error: null })
    uploadConstructor.mockImplementation((_file, options) => ({
      file: _file,
      findPreviousUploads: vi.fn().mockResolvedValue([]),
      resumeFromPreviousUpload: vi.fn(),
      start: vi.fn(() => options.onSuccess()),
    }))
  })

  it("uses the exact request credential token on the resumable request", async () => {
    await uploadToStorage({
      bucket: "collection-photos",
      path: "org/collections/c/photo.jpg",
      file: new File(["bytes"], "photo.jpg", { type: "image/jpeg" }),
      mimeType: "image/jpeg",
      credentials: { accessToken: "fresh-token" },
    })
    const options = uploadConstructor.mock.calls[0][1]
    expect(options.headers.authorization).toBe("Bearer fresh-token")
    expect(options.headers["x-upsert"]).toBe("true")
    expect(options.chunkSize).toBe(6 * 1024 * 1024)
  })

  it("classifies auth and network failures as retryable and sanitizes details", () => {
    const error = Object.assign(new Error("Bearer secret-token"), {
      originalResponse: { getStatus: () => 403 },
    })
    const safe = sanitizeUploadError(error)
    expect(safe).toMatchObject({
      statusCode: 403,
      retryable: true,
      safeMessage: "Storage rejected the upload (HTTP 403)",
    })
    expect(safe.message).not.toContain("secret-token")
    expect(sanitizeUploadError(new Error("network")).retryable).toBe(true)
    expect(sanitizeUploadError(Object.assign(new Error("exp claim timestamp check failed"), { status: 400 })).retryable).toBe(true)
    expect(sanitizeUploadError(Object.assign(new Error(), { status: 413 })).retryable).toBe(false)
  })

  it("uses the live token for remote deletion and treats a missing object as success", async () => {
    removeObjectMock.mockResolvedValue({
      error: Object.assign(new Error("private response"), { statusCode: "404" }),
    })
    await expect(deleteFromStorage("collection-photos", "a.jpg", { accessToken: "fresh-token" })).resolves.toBeUndefined()
    expect(clientForTokenMock).toHaveBeenCalledWith("fresh-token")
    expect(removeObjectMock).toHaveBeenCalledWith(["a.jpg"])
  })

  it("aborts a tus upload that makes no progress", async () => {
    vi.useFakeTimers()
    try {
      const abort = vi.fn().mockResolvedValue(undefined)
      uploadConstructor.mockImplementation(() => ({
        findPreviousUploads: vi.fn().mockResolvedValue([]),
        start: vi.fn(),
        abort,
      }))
      const pending = uploadToStorage({
        bucket: "collection-photos",
        path: "org/collections/c/stalled.jpg",
        file: new File(["bytes"], "stalled.jpg", { type: "image/jpeg" }),
        mimeType: "image/jpeg",
        credentials: { accessToken: "fresh-token" },
      })
      const rejected = expect(pending).rejects.toMatchObject({ retryable: true })
      await vi.advanceTimersByTimeAsync(61_000)
      expect(abort).toHaveBeenCalledOnce()
      await rejected
    } finally {
      vi.useRealTimers()
    }
  })

  it("only treats a confirmed Storage 404 as a missing object", async () => {
    existsObjectMock.mockResolvedValueOnce({
      data: false,
      error: Object.assign(new Error("Not found"), { originalError: { status: 404 } }),
    })
    await expect(storageObjectExists("collection-photos", "a.jpg", { accessToken: "fresh-token" })).resolves.toBe(false)
    existsObjectMock.mockResolvedValueOnce({
      data: false,
      error: Object.assign(new Error("JWT expired"), { originalError: { status: 400 } }),
    })
    await expect(storageObjectExists("collection-photos", "a.jpg", { accessToken: "fresh-token" })).rejects.toThrow()
  })

  it("releases a Storage delete that never responds", async () => {
    vi.useFakeTimers()
    try {
      removeObjectMock.mockReturnValue(new Promise(() => undefined))
      const pending = deleteFromStorage("collection-photos", "a.jpg", { accessToken: "fresh-token" })
      const rejected = expect(pending).rejects.toThrow("Storage deletion timed out")
      await vi.advanceTimersByTimeAsync(31_000)
      await rejected
    } finally {
      vi.useRealTimers()
    }
  })
})
