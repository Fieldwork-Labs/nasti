import { act, renderHook } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ROLE } from "@nasti/common/types"
import { usePhotosMutate } from "../usePhotosMutate"

const {
  getOptionalMock,
  psDeleteMock,
  psInsertMock,
  psUpdateMock,
  removeMock,
  getSessionMock,
  uploadStartMock,
} = vi.hoisted(() => ({
  getOptionalMock: vi.fn(),
  psDeleteMock: vi.fn(),
  psInsertMock: vi.fn(),
  psUpdateMock: vi.fn(),
  removeMock: vi.fn(),
  getSessionMock: vi.fn(),
  uploadStartMock: vi.fn(),
}))

const toBase64Url = (value: unknown) =>
  btoa(JSON.stringify(value))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "")

const createJwt = (payload: Record<string, unknown>) =>
  [
    toBase64Url({ alg: "RS256", kid: "test-key" }),
    toBase64Url(payload),
    "signature",
  ].join(".")

const mockAccessToken = createJwt({
  app_metadata: {
    org_id: "org-1",
    org_name: "Test Organisation",
    role: ROLE.ADMIN,
  },
})

vi.mock("../useAuth", () => ({
  useAuth: vi.fn(() => ({
    organisation: { id: "org-1", name: "Test Organisation" },
    role: ROLE.ADMIN,
  })),
}))

vi.mock("@/lib/powersync/db", () => ({
  powerSyncDb: {
    getOptional: getOptionalMock,
  },
}))

vi.mock("@/lib/powersync/crud", () => ({
  psDelete: psDeleteMock,
  psInsert: psInsertMock,
  psUpdate: psUpdateMock,
}))

vi.mock("@/lib/persistFiles", () => ({
  deleteImage: vi.fn(),
}))

vi.mock("@nasti/common/supabase", () => ({
  supabase: {
    auth: {
      getSession: getSessionMock,
    },
    storage: {
      from: vi.fn(() => ({
        remove: removeMock,
      })),
    },
  },
}))

vi.mock("tus-js-client", () => ({
  Upload: vi.fn().mockImplementation((_file, options) => ({
    file: _file,
    findPreviousUploads: vi.fn(() => Promise.resolve([])),
    start: vi.fn(() => {
      uploadStartMock(options)
    }),
  })),
}))

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false },
    },
  })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe("usePhotosMutate", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getSessionMock.mockResolvedValue({
      data: { session: { access_token: mockAccessToken } },
      error: null,
    })
    psInsertMock.mockResolvedValue(undefined)
    psUpdateMock.mockResolvedValue(undefined)
    psDeleteMock.mockResolvedValue(undefined)
    removeMock.mockResolvedValue({ error: null })
    uploadStartMock.mockImplementation((options) => {
      options.onProgress?.(1, 2)
      options.onProgress?.(2, 2)
      options.onSuccess?.()
    })
  })

  it("creates collection photo metadata through PowerSync after storage upload", async () => {
    const { result } = renderHook(
      () =>
        usePhotosMutate({
          entityId: "collection-1",
          entityType: "collection",
          tripId: "trip-1",
        }),
      { wrapper: createWrapper() },
    )

    await act(async () => {
      await result.current.createPhotoMutation.mutateAsync({
        id: "photo-1",
        caption: "Leaf",
        file: new File(["data"], "leaf.jpg", { type: "image/jpeg" }),
      })
    })

    expect(psInsertMock).toHaveBeenCalledWith(
      "collection_photo",
      expect.objectContaining({
        id: "photo-1",
        collection_id: "collection-1",
        url: "org-1/collections/collection-1/photo-1.jpg",
        caption: "Leaf",
      }),
    )
  })

  it("keeps local collection photo metadata when storage upload fails", async () => {
    const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {})
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {})
    uploadStartMock.mockImplementation((options) => {
      options.onError?.(new Error("storage unavailable"))
    })

    const { result } = renderHook(
      () =>
        usePhotosMutate({
          entityId: "collection-1",
          entityType: "collection",
          tripId: "trip-1",
        }),
      { wrapper: createWrapper() },
    )

    await act(async () => {
      await result.current.createPhotoMutation.mutateAsync({
        id: "photo-1",
        caption: "Leaf",
        file: new File(["data"], "leaf.jpg", { type: "image/jpeg" }),
      })
    })

    expect(psInsertMock).toHaveBeenCalledWith(
      "collection_photo",
      expect.objectContaining({
        id: "photo-1",
        collection_id: "collection-1",
        url: "org-1/collections/collection-1/photo-1.jpg",
        caption: "Leaf",
      }),
    )
    consoleLogSpy.mockRestore()
    consoleErrorSpy.mockRestore()
  })

  it("updates collection photo captions through PowerSync", async () => {
    getOptionalMock.mockResolvedValue({
      id: "photo-1",
      collection_id: "collection-1",
      url: "photo.jpg",
      caption: null,
      uploaded_at: "2026-06-04T00:00:00.000Z",
    })

    const { result } = renderHook(
      () =>
        usePhotosMutate({
          entityId: "collection-1",
          entityType: "collection",
          tripId: "trip-1",
        }),
      { wrapper: createWrapper() },
    )

    await act(async () => {
      await result.current.updateCaptionMutation.mutateAsync({
        photoId: "photo-1",
        caption: "Updated",
      })
    })

    expect(psUpdateMock).toHaveBeenCalledWith("collection_photo", "photo-1", {
      caption: "Updated",
    })
  })

  it("deletes collection photo metadata through PowerSync after storage delete", async () => {
    getOptionalMock.mockResolvedValue({
      id: "photo-1",
      collection_id: "collection-1",
      url: "photo.jpg",
      caption: null,
      uploaded_at: "2026-06-04T00:00:00.000Z",
    })

    const { result } = renderHook(
      () =>
        usePhotosMutate({
          entityId: "collection-1",
          entityType: "collection",
          tripId: "trip-1",
        }),
      { wrapper: createWrapper() },
    )

    await act(async () => {
      await result.current.deletePhotoMutation.mutateAsync("photo-1")
    })

    expect(removeMock).toHaveBeenCalledWith(["photo.jpg"])
    expect(psDeleteMock).toHaveBeenCalledWith("collection_photo", "photo-1")
  })
})
