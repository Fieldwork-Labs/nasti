import { act, renderHook } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useAudiosMutate } from "../useAudiosMutate"

const { getOptionalMock, psDeleteMock, psInsertMock, psUpdateMock, enqueueMock, wakeMock, putAudioMock, writeTransactionMock } = vi.hoisted(() => ({
  getOptionalMock: vi.fn(),
  psDeleteMock: vi.fn(),
  psInsertMock: vi.fn(),
  psUpdateMock: vi.fn(),
  enqueueMock: vi.fn(),
  wakeMock: vi.fn(),
  putAudioMock: vi.fn(),
  writeTransactionMock: vi.fn(),
}))

vi.mock("../useAuth", () => ({
  useAuth: vi.fn(() => ({ organisation: { id: "org-1", name: "Test" } })),
}))
vi.mock("@/lib/powersync/db", () => ({ powerSyncDb: { getOptional: getOptionalMock, writeTransaction: writeTransactionMock } }))
vi.mock("@/lib/powersync/crud", () => ({
  psDelete: psDeleteMock,
  psInsert: psInsertMock,
  psUpdate: psUpdateMock,
}))
vi.mock("@/lib/powersync/attachments", () => ({
  mediaAttachmentQueue: { enqueue: enqueueMock, wake: wakeMock },
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
    psInsertMock.mockResolvedValue(undefined)
    writeTransactionMock.mockImplementation(async (callback) => callback({ execute: vi.fn() }))
  })

  it("durably stores audio and pending metadata without waiting for Storage", async () => {
    const { result } = renderHook(
      () => useAudiosMutate({ entityId: "collection-1", entityType: "collection", tripId: "trip-1" }),
      { wrapper },
    )
    const file = new File(["audio"], "voice.m4a", { type: "audio/mp4" })

    await act(async () => {
      await result.current.createAudioMutation.mutateAsync({
        id: "audio-1",
        file,
        duration_ms: 1200,
        mime_type: "audio/mp4",
        caption: "Field recording",
      })
    })

    expect(putAudioMock).toHaveBeenCalledWith("audio-1", file, "audio/mp4")
    expect(enqueueMock).toHaveBeenCalledWith(expect.objectContaining({
      id: "audio-1",
      kind: "audio",
      table: "collection_audio",
      path: "org-1/collections/collection-1/audio-1.m4a",
    }), expect.any(Object))
    expect(psInsertMock).toHaveBeenCalledWith("collection_audio", expect.objectContaining({
      id: "audio-1",
      uploaded_at: null,
    }), expect.any(Object))
    expect(enqueueMock.mock.invocationCallOrder[0]).toBeLessThan(psInsertMock.mock.invocationCallOrder[0])
    expect(wakeMock).toHaveBeenCalledOnce()
  })
})
