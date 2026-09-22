import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

const mocks = vi.hoisted(() => ({
  mode: "offline",
  getUploadQueueStats: vi.fn(),
  getAll: vi.fn(),
  currentStatus: { dataFlowStatus: { uploading: false } },
}))
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ mode: mocks.mode }) }))
vi.mock("@/lib/powersync/db", () => ({ powerSyncDb: {
  getUploadQueueStats: mocks.getUploadQueueStats,
  getAll: mocks.getAll,
  get currentStatus() { return mocks.currentStatus },
} }))

import { useSyncStatus } from "../useSyncStatus"

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

describe("useSyncStatus", () => {
  beforeEach(() => {
    mocks.mode = "offline"
    mocks.getUploadQueueStats.mockResolvedValue({ count: 3 })
    mocks.getAll.mockResolvedValue([{ queuedMedia: 2, activeMedia: 0, rowFailures: 1, mediaFailures: 1, rowError: '{"code":"23514"}', rowDisposition: "validation", mediaError: null }])
    mocks.currentStatus = { dataFlowStatus: { uploading: true } }
  })
  afterEach(() => { cleanup(); queryClient.clear() })

  it("reports queued counts, permanent failures, active upload, and paused auth safely", async () => {
    const { result } = renderHook(() => useSyncStatus(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.status).toEqual({
      queuedRows: 3,
      queuedMedia: 2,
      waitingForAuthentication: true,
      activelyUploading: true,
      permanentRowFailures: 1,
      permanentMediaFailures: 1,
      lastSafeError: "Server rejected a change (23514)",
      lastDisposition: "validation",
    })
  })

  it("does not treat a live session as paused and only presents the sanitized media error", async () => {
    mocks.mode = "live"
    mocks.getAll.mockResolvedValue([{ queuedMedia: 0, activeMedia: 0, rowFailures: 0, mediaFailures: 1, rowError: null, rowDisposition: null, mediaError: "Storage rejected the file as too large" }])
    const { result } = renderHook(() => useSyncStatus(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.status.waitingForAuthentication).toBe(false)
    expect(result.current.status.lastSafeError).toBe("Storage rejected the file as too large")
    expect(result.current.status.lastDisposition).toBe("permanent_media_failure")
  })
})
