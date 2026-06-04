import { act, renderHook } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { usePhotosMutate } from "../usePhotosMutate"

const {
  getOptionalMock,
  psDeleteMock,
  psInsertMock,
  psUpdateMock,
  removeMock,
  getSessionMock,
} = vi.hoisted(() => ({
  getOptionalMock: vi.fn(),
  psDeleteMock: vi.fn(),
  psInsertMock: vi.fn(),
  psUpdateMock: vi.fn(),
  removeMock: vi.fn(),
  getSessionMock: vi.fn(),
}))

vi.mock("../useAuth", () => ({
  useAuth: vi.fn(() => ({
    org: { organisation_id: "org-1" },
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
      options.onProgress?.(1, 2)
      options.onProgress?.(2, 2)
      options.onSuccess?.()
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
      data: { session: { access_token: "token" } },
      error: null,
    })
    psInsertMock.mockResolvedValue(undefined)
    psUpdateMock.mockResolvedValue(undefined)
    psDeleteMock.mockResolvedValue(undefined)
    removeMock.mockResolvedValue({ error: null })
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
