import { beforeEach, describe, expect, it, vi } from "vitest"

const { uploadConstructor, removeObjectMock, clientForTokenMock } = vi.hoisted(() => ({
  uploadConstructor: vi.fn(),
  removeObjectMock: vi.fn(),
  clientForTokenMock: vi.fn(),
}))

vi.mock("tus-js-client", () => ({
  Upload: uploadConstructor,
}))
vi.mock("@nasti/common/supabase", () => ({
  createNastiSupabaseClientForToken: clientForTokenMock,
}))

import { deleteFromStorage, uploadToStorage } from "../storageUpload"
import { sanitizeUploadError } from "../powersync/attachmentErrors"

describe("storageUpload", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clientForTokenMock.mockReturnValue({
      storage: { from: vi.fn(() => ({ remove: removeObjectMock })) },
    })
    removeObjectMock.mockResolvedValue({ error: null })
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
})
