import { act, render } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { connectMock, disconnectMock, startQueueMock, stopQueueMock } = vi.hoisted(() => ({
  connectMock: vi.fn(),
  disconnectMock: vi.fn(),
  startQueueMock: vi.fn(),
  stopQueueMock: vi.fn(),
}))

vi.mock("@powersync/react", () => ({
  PowerSyncContext: {
    Provider: ({ children }: { children: React.ReactNode }) => children,
  },
  useSyncStream: vi.fn(),
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
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ organisation: { id: "org-1" } }),
}))
vi.mock("@/hooks/useAppIsActive", () => ({ useAppIsActive: () => true }))

import { PowerSyncProvider } from "../PowerSync"

describe("PowerSyncProvider media runtime", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    connectMock.mockResolvedValue(undefined)
    disconnectMock.mockResolvedValue(undefined)
  })

  it("starts the queue and PowerSync for an offline local identity, then stops on logout", async () => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false })
    const view = render(<PowerSyncProvider isLoggedIn>{null}</PowerSyncProvider>)

    expect(startQueueMock).toHaveBeenCalledOnce()
    expect(connectMock).toHaveBeenCalledOnce()
    expect(stopQueueMock).not.toHaveBeenCalled()
    expect(disconnectMock).not.toHaveBeenCalled()

    await act(async () => {
      view.rerender(<PowerSyncProvider isLoggedIn={false}>{null}</PowerSyncProvider>)
    })

    expect(stopQueueMock).toHaveBeenCalledOnce()
    expect(disconnectMock).toHaveBeenCalledOnce()
  })
})
