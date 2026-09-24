import { act, renderHook } from "@testing-library/react"
import { onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query"
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
  enqueueMock,
  enqueueDeleteMock,
  wakeMock,
  putImageMock,
  writeTransactionMock,
} = vi.hoisted(() => ({
  getOptionalMock: vi.fn(),
  psDeleteMock: vi.fn(),
  psInsertMock: vi.fn(),
  psUpdateMock: vi.fn(),
  removeMock: vi.fn(),
  getSessionMock: vi.fn(),
  enqueueMock: vi.fn(),
  enqueueDeleteMock: vi.fn(),
  wakeMock: vi.fn(),
  putImageMock: vi.fn(),
  writeTransactionMock: vi.fn(),
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
    organisation: { id: "00000000-0000-4000-8000-000000000001", name: "Test Organisation" },
    role: ROLE.ADMIN,
  })),
}))

vi.mock("@/lib/powersync/db", () => ({
  powerSyncDb: {
    getOptional: getOptionalMock,
    writeTransaction: writeTransactionMock,
  },
}))

vi.mock("@/lib/powersync/crud", () => ({
  psDelete: psDeleteMock,
  psInsert: psInsertMock,
  psUpdate: psUpdateMock,
}))

vi.mock("@/lib/persistFiles", () => ({
  deleteImage: vi.fn(),
  putImage: putImageMock,
  fileToBase64: vi.fn().mockResolvedValue("data:image/jpeg;base64,YQ=="),
}))

vi.mock("@/lib/powersync/attachments", () => ({
  mediaAttachmentQueue: { enqueue: enqueueMock, enqueueDelete: enqueueDeleteMock, wake: wakeMock },
  validateMediaUploadIds: vi.fn(),
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
    onlineManager.setOnline(true)
    vi.clearAllMocks()
    getSessionMock.mockResolvedValue({
      data: { session: { access_token: mockAccessToken } },
      error: null,
    })
    psInsertMock.mockResolvedValue(undefined)
    psUpdateMock.mockResolvedValue(undefined)
    psDeleteMock.mockResolvedValue(undefined)
    writeTransactionMock.mockImplementation(async (callback) => callback({ execute: vi.fn() }))
    removeMock.mockResolvedValue({ error: null })
    enqueueMock.mockResolvedValue(undefined)
    enqueueDeleteMock.mockResolvedValue(undefined)
    putImageMock.mockResolvedValue(undefined)
  })

  it("persists collection photo bytes and pending metadata before returning", async () => {
    const { result } = renderHook(
      () =>
        usePhotosMutate({
          entityId: "00000000-0000-4000-8000-000000000002",
          entityType: "collection",
          tripId: "trip-1",
        }),
      { wrapper: createWrapper() },
    )

    await act(async () => {
      await result.current.createPhotoMutation.mutateAsync({
        id: "00000000-0000-4000-8000-000000000003",
        caption: "Leaf",
        file: new File(["data"], "leaf.jpg", { type: "image/jpeg" }),
      })
    })

    expect(psInsertMock).toHaveBeenCalledWith(
      "collection_photo",
      expect.objectContaining({
        id: "00000000-0000-4000-8000-000000000003",
        collection_id: "00000000-0000-4000-8000-000000000002",
        url: "00000000-0000-4000-8000-000000000001/collections/00000000-0000-4000-8000-000000000002/00000000-0000-4000-8000-000000000003.jpg",
        caption: "Leaf",
        uploaded_at: null,
      }),
      expect.any(Object),
    )
    expect(putImageMock).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000003", "data:image/jpeg;base64,YQ==")
    expect(enqueueMock).toHaveBeenCalledWith(expect.objectContaining({
      id: "00000000-0000-4000-8000-000000000003",
      kind: "photo",
      table: "collection_photo",
      path: "00000000-0000-4000-8000-000000000001/collections/00000000-0000-4000-8000-000000000002/00000000-0000-4000-8000-000000000003.jpg",
    }), expect.any(Object))
    expect(wakeMock).toHaveBeenCalledOnce()
    expect(getSessionMock).not.toHaveBeenCalled()
  })

  it("persists a photo and registers its upload while offline", async () => {
    onlineManager.setOnline(false)
    const { result } = renderHook(
      () => usePhotosMutate({ entityId: "collection-1", entityType: "collection", tripId: "trip-1" }),
      { wrapper: createWrapper() },
    )

    try {
      await act(async () => {
        await result.current.createPhotoMutation.mutateAsync({
          id: "photo-offline",
          file: new File(["data"], "offline.jpg", { type: "image/jpeg" }),
        })
      })

      expect(putImageMock).toHaveBeenCalledWith("photo-offline", "data:image/jpeg;base64,YQ==")
      expect(enqueueMock).toHaveBeenCalledWith(expect.objectContaining({ id: "photo-offline" }), expect.any(Object))
      expect(psInsertMock).toHaveBeenCalledWith("collection_photo", expect.objectContaining({ id: "photo-offline" }), expect.any(Object))
      expect(enqueueMock.mock.invocationCallOrder[0]).toBeLessThan(psInsertMock.mock.invocationCallOrder[0])
    } finally {
      onlineManager.setOnline(true)
    }
  })

  it("applies photo deletion and caption edits while offline", async () => {
    onlineManager.setOnline(false)
    getOptionalMock.mockResolvedValue({ id: "photo-1", collection_id: "collection-1", url: "photo.jpg", caption: null, uploaded_at: null })
    const { result } = renderHook(
      () => usePhotosMutate({ entityId: "collection-1", entityType: "collection", tripId: "trip-1" }),
      { wrapper: createWrapper() },
    )
    try {
      await act(async () => {
        await result.current.updateCaptionMutation.mutateAsync({ photoId: "photo-1", caption: "Offline caption" })
        await result.current.deletePhotoMutation.mutateAsync("photo-1")
      })
      expect(psUpdateMock).toHaveBeenCalledWith("collection_photo", "photo-1", { caption: "Offline caption" })
      expect(enqueueDeleteMock).toHaveBeenCalledWith(expect.objectContaining({ id: "photo-1" }), expect.any(Object))
    } finally {
      onlineManager.setOnline(true)
    }
  })

  it("registers the durable queue job before inserting metadata", async () => {

    const { result } = renderHook(
      () =>
        usePhotosMutate({
          entityId: "00000000-0000-4000-8000-000000000002",
          entityType: "collection",
          tripId: "trip-1",
        }),
      { wrapper: createWrapper() },
    )

    await act(async () => {
      await result.current.createPhotoMutation.mutateAsync({
        id: "00000000-0000-4000-8000-000000000003",
        caption: "Leaf",
        file: new File(["data"], "leaf.jpg", { type: "image/jpeg" }),
      })
    })

    expect(psInsertMock).toHaveBeenCalledWith(
      "collection_photo",
      expect.objectContaining({
        id: "00000000-0000-4000-8000-000000000003",
        collection_id: "00000000-0000-4000-8000-000000000002",
        url: "00000000-0000-4000-8000-000000000001/collections/00000000-0000-4000-8000-000000000002/00000000-0000-4000-8000-000000000003.jpg",
        caption: "Leaf",
      }),
      expect.any(Object),
    )
    expect(enqueueMock.mock.invocationCallOrder[0]).toBeLessThan(
      psInsertMock.mock.invocationCallOrder[0],
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

  it("hides a collection photo locally and queues remote deletion", async () => {
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

    expect(enqueueDeleteMock).toHaveBeenCalledWith(expect.objectContaining({
      id: "photo-1",
      kind: "photo",
      table: "collection_photo",
      path: "photo.jpg",
    }), expect.any(Object))
    expect(removeMock).not.toHaveBeenCalled()
    expect(psDeleteMock).not.toHaveBeenCalled()
    expect(wakeMock).toHaveBeenCalledOnce()
  })
})
