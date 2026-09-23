import { act, render, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { connectMock, disconnectMock, startQueueMock, stopQueueMock, activity, auth, owner, streamMock } = vi.hoisted(() => ({
  connectMock: vi.fn(),
  disconnectMock: vi.fn(),
  startQueueMock: vi.fn(),
  stopQueueMock: vi.fn(),
  activity: { active: true },
  auth: { mode: "live" },
  owner: { status: "allowed", ownerId: "user-1" },
  streamMock: vi.fn(),
}))

vi.mock("@powersync/react", () => ({
  PowerSyncContext: {
    Provider: ({ children }: { children: React.ReactNode }) => children,
  },
  useSyncStream: streamMock,
}))
vi.mock("@/lib/powersync/db", () => ({
  powerSyncDb: { connect: connectMock, disconnect: disconnectMock },
}))
vi.mock("@/lib/powersync/connector", () => ({
  SupabaseConnector: class SupabaseConnector {},
}))
vi.mock("@/lib/powersync/attachments", () => ({
  mediaAttachmentQueue: { start: startQueueMock, stop: stopQueueMock },
}))
vi.mock("@/lib/powersync/deleteRetryQueue", () => ({
  rowDeleteRetryQueue: { start: startQueueMock, stop: stopQueueMock },
}))
vi.mock("@/lib/powersync/localDataOwner", () => ({
  resolveLocalDataAccess: vi.fn(async () => ({ ...owner })),
}))
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ organisation: { id: "org-1" }, user: { id: "user-1" }, mode: auth.mode, logout: { mutate: vi.fn(), isPending: false } }),
}))
vi.mock("@/hooks/useAppIsActive", () => ({ useAppIsActive: () => activity.active }))

import { PowerSyncProvider } from "../PowerSync"

describe("PowerSyncProvider media runtime", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    activity.active = true
    auth.mode = "live"
    owner.status = "allowed"
    owner.ownerId = "user-1"
    connectMock.mockResolvedValue(undefined)
    disconnectMock.mockResolvedValue(undefined)
  })

  it("disconnects and pauses the queues while the app is inactive", async () => {
    const view = render(<PowerSyncProvider isLoggedIn>{null}</PowerSyncProvider>)
    await waitFor(() => expect(connectMock).toHaveBeenCalledOnce())
    activity.active = false
    await act(async () => {
      view.rerender(<PowerSyncProvider isLoggedIn>{null}</PowerSyncProvider>)
    })
    expect(disconnectMock).toHaveBeenCalledOnce()
    expect(stopQueueMock).toHaveBeenCalledTimes(4)

    activity.active = true
    await act(async () => {
      view.rerender(<PowerSyncProvider isLoggedIn>{null}</PowerSyncProvider>)
    })
    expect(connectMock).toHaveBeenCalledTimes(2)
    expect(startQueueMock).toHaveBeenCalledTimes(4)
  })

  it("keeps the queue and PowerSync stopped for an offline local identity", async () => {
    auth.mode = "offline"
    const view = render(<PowerSyncProvider isLoggedIn>{null}</PowerSyncProvider>)

    expect(startQueueMock).not.toHaveBeenCalled()
    expect(connectMock).not.toHaveBeenCalled()
    expect(stopQueueMock).toHaveBeenCalled()
    expect(disconnectMock).not.toHaveBeenCalled()

    await act(async () => {
      view.rerender(<PowerSyncProvider isLoggedIn={false}>{null}</PowerSyncProvider>)
    })

    expect(stopQueueMock).toHaveBeenCalledTimes(2)
    expect(disconnectMock).not.toHaveBeenCalled()
    expect(streamMock).not.toHaveBeenCalled()
  })

  it("hides local children and streams when the saved database belongs to another user", async () => {
    owner.status = "mismatch"
    owner.ownerId = "user-a"
    const view = render(<PowerSyncProvider isLoggedIn><p>Private local data</p></PowerSyncProvider>)

    expect(await view.findByText("Local data is locked for this account.")).toBeDefined()
    expect(view.queryByText("Private local data")).toBeNull()
    expect(streamMock).not.toHaveBeenCalled()
    expect(connectMock).not.toHaveBeenCalled()
    expect(startQueueMock).not.toHaveBeenCalled()
  })
})
