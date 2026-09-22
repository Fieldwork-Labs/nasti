import { act, renderHook } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useAudiosMutate } from "../useAudiosMutate"

const { getOptionalMock, psDeleteMock, psInsertMock, psUpdateMock, enqueueMock, enqueueDeleteMock, wakeMock, putAudioMock, writeTransactionMock } = vi.hoisted(() => ({
  getOptionalMock: vi.fn(),
  psDeleteMock: vi.fn(),
  psInsertMock: vi.fn(),
  psUpdateMock: vi.fn(),
  enqueueMock: vi.fn(),
  enqueueDeleteMock: vi.fn(),
  wakeMock: vi.fn(),
  putAudioMock: vi.fn(),
  writeTransactionMock: vi.fn(),
}))

vi.mock("../useAuth", () => ({
  useAuth: vi.fn(() => ({ organisation: { id: "00000000-0000-4000-8000-000000000001", name: "Test" } })),
}))
vi.mock("@/lib/powersync/db", () => ({ powerSyncDb: { getOptional: getOptionalMock, writeTransaction: writeTransactionMock } }))
vi.mock("@/lib/powersync/crud", () => ({
  psDelete: psDeleteMock,
  psInsert: psInsertMock,
  psUpdate: psUpdateMock,
}))
vi.mock("@/lib/powersync/attachments", () => ({
  mediaAttachmentQueue: { enqueue: enqueueMock, enqueueDelete: enqueueDeleteMock, wake: wakeMock },
  validateMediaUploadIds: vi.fn(),
}))
vi.mock("@/lib/persistAudio", () => ({
  deleteAudio: vi.fn(),
  putAudio: putAudioMock,
}))
vi.mock("@nasti/common/supabase", () => ({
  supabase: {
    auth: { getSession: vi.fn() },
    storage: { from: vi.fn(() => ({ remove: vi.fn() })) },
  },
}))

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
)

describe("useAudiosMutate", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    putAudioMock.mockResolvedValue(undefined)
    enqueueMock.mockResolvedValue(undefined)
    enqueueDeleteMock.mockResolvedValue(undefined)
    psInsertMock.mockResolvedValue(undefined)
    writeTransactionMock.mockImplementation(async (callback) => callback({ execute: vi.fn() }))
  })

  it("durably stores audio and pending metadata without waiting for Storage", async () => {
    const { result } = renderHook(
      () => useAudiosMutate({ entityId: "00000000-0000-4000-8000-000000000002", entityType: "collection", tripId: "trip-1" }),
      { wrapper },
    )
    const file = new File(["audio"], "voice.m4a", { type: "audio/mp4" })

    await act(async () => {
      await result.current.createAudioMutation.mutateAsync({
        id: "00000000-0000-4000-8000-000000000003",
        file,
        duration_ms: 1200,
        mime_type: "audio/mp4",
        caption: "Field recording",
      })
    })

    expect(putAudioMock).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000003", file, "audio/mp4")
    expect(enqueueMock).toHaveBeenCalledWith(expect.objectContaining({
      id: "00000000-0000-4000-8000-000000000003",
      kind: "audio",
      table: "collection_audio",
      path: "00000000-0000-4000-8000-000000000001/collections/00000000-0000-4000-8000-000000000002/00000000-0000-4000-8000-000000000003.m4a",
    }), expect.any(Object))
    expect(psInsertMock).toHaveBeenCalledWith("collection_audio", expect.objectContaining({
      id: "00000000-0000-4000-8000-000000000003",
      uploaded_at: null,
    }), expect.any(Object))
    expect(enqueueMock.mock.invocationCallOrder[0]).toBeLessThan(psInsertMock.mock.invocationCallOrder[0])
    expect(wakeMock).toHaveBeenCalledOnce()
  })

  it("hides audio locally and queues remote cleanup without a Storage request", async () => {
    getOptionalMock.mockResolvedValue({
      id: "audio-1",
      collection_id: "collection-1",
      url: "recording.m4a",
      mime_type: "audio/mp4",
      uploaded_at: null,
    })
    const { result } = renderHook(
      () => useAudiosMutate({ entityId: "collection-1", entityType: "collection", tripId: "trip-1" }),
      { wrapper },
    )

    await act(async () => {
      await result.current.deleteAudioMutation.mutateAsync("audio-1")
    })

    expect(enqueueDeleteMock).toHaveBeenCalledWith(expect.objectContaining({
      id: "audio-1",
      kind: "audio",
      table: "collection_audio",
      bucket: "collection-audio",
      path: "recording.m4a",
      mimeType: "audio/mp4",
    }), expect.any(Object))
    expect(wakeMock).toHaveBeenCalledOnce()
    expect(psDeleteMock).not.toHaveBeenCalled()
  })
})
