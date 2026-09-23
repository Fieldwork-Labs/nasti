import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

const mocks = vi.hoisted(() => ({
  getUploadQueueStats: vi.fn(),
  getAll: vi.fn(),
  currentStatus: { dataFlowStatus: { uploading: false } },
}))
vi.mock("@/lib/powersync/db", () => ({ powerSyncDb: {
  getUploadQueueStats: mocks.getUploadQueueStats,
  getAll: mocks.getAll,
  get currentStatus() { return mocks.currentStatus },
} }))

import { useSyncStatus } from "../useSyncStatus"
import {
  isQueueAuthBlocked,
  resetQueueAuthBlockedState,
  setQueueAuthBlocked,
} from "@/lib/powersync/queueAuthState"

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

describe("useSyncStatus", () => {
  beforeEach(() => {
    resetQueueAuthBlockedState()
    mocks.getUploadQueueStats.mockResolvedValue({ count: 3 })
    mocks.getAll.mockResolvedValue([{ queuedMedia: 2, activeMedia: 0, rowFailures: 1, mediaFailures: 1, queuedDeleteRetries: 1, terminalDeleteRetries: 2, rowError: '{"code":"23514"}', rowDisposition: "validation", mediaError: null }])
    mocks.currentStatus = { dataFlowStatus: { uploading: true } }
  })
  afterEach(() => { cleanup(); queryClient.clear() })

  it("reports queued counts, permanent failures, active upload, and paused auth safely", async () => {
    setQueueAuthBlocked("rows", true)
    setQueueAuthBlocked("media", true)
    setQueueAuthBlocked("deleteRetries", true)
    const { result } = renderHook(() => useSyncStatus(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.status).toEqual({
      queuedRows: 3,
      queuedMedia: 2,
      waitingForAuthentication: true,
      activelyUploading: true,
      permanentRowFailures: 1,
      permanentMediaFailures: 1,
      queuedDeleteRetries: 1,
      terminalDeleteRetries: 2,
      lastSafeError: "Server rejected a change (23514)",
      lastDisposition: "retry_terminal",
    })
  })

  it("only presents the sanitized media error when a queue is not auth blocked", async () => {
    mocks.getAll.mockResolvedValue([{ queuedMedia: 0, activeMedia: 0, rowFailures: 0, mediaFailures: 1, rowError: null, rowDisposition: null, mediaError: "Storage rejected the file as too large" }])
    const { result } = renderHook(() => useSyncStatus(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.status.waitingForAuthentication).toBe(false)
    expect(result.current.status.lastSafeError).toBe("Storage rejected the file as too large")
    expect(result.current.status.lastDisposition).toBe("permanent_media_failure")
  })

  it("does not report an offline user as waiting when every queue is empty", async () => {
    setQueueAuthBlocked("rows", true)
    setQueueAuthBlocked("media", true)
    setQueueAuthBlocked("deleteRetries", true)
    mocks.getUploadQueueStats.mockResolvedValue({ count: 0 })
    mocks.getAll.mockResolvedValue([{ queuedMedia: 0, activeMedia: 0, rowFailures: 0, mediaFailures: 0, queuedDeleteRetries: 0, terminalDeleteRetries: 0, rowError: null, rowDisposition: null, deleteRetryError: null, mediaError: null }])
    const { result } = renderHook(() => useSyncStatus(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.status.waitingForAuthentication).toBe(false)
    expect(isQueueAuthBlocked("rows")).toBe(false)
    expect(isQueueAuthBlocked("media")).toBe(false)
    expect(isQueueAuthBlocked("deleteRetries")).toBe(false)
  })

  it("does not infer auth blocking from pending queue counts", async () => {
    const { result } = renderHook(() => useSyncStatus(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.status.queuedRows).toBe(3)
    expect(result.current.status.waitingForAuthentication).toBe(false)
  })

  it("surfaces visible orphaned terminal DELETE retries in status counts and safe error", async () => {
    mocks.getAll.mockResolvedValue([{ queuedMedia: 0, activeMedia: 0, rowFailures: 0, mediaFailures: 0, queuedDeleteRetries: 0, terminalDeleteRetries: 1, rowError: null, rowDisposition: null, deleteRetryError: "Server rejected this delete (422).", mediaError: null }])
    const { result } = renderHook(() => useSyncStatus(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.status.terminalDeleteRetries).toBe(1)
    expect(result.current.status.lastSafeError).toBe("Server rejected this delete (422).")
    expect(result.current.status.lastDisposition).toBe("retry_terminal")
  })
})
