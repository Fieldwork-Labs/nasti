import { beforeEach, describe, expect, it, vi } from "vitest"
import { UpdateType, type CrudEntry, type CrudTransaction } from "@powersync/web"

const { acquireMock, confirmMock, captureMessageMock } = vi.hoisted(() => ({
  acquireMock: vi.fn(),
  confirmMock: vi.fn(),
  captureMessageMock: vi.fn(),
}))

vi.mock("../../auth/liveSession", () => ({
  liveUploadCredentials: { acquire: acquireMock, confirm: confirmMock },
}))
vi.mock("@sentry/react", () => ({ captureMessage: captureMessageMock }))
vi.mock("../attachments", () => ({ confirmMediaRowDelete: vi.fn() }))

describe("row upload over a stalled connection", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true })
    acquireMock.mockResolvedValue({ accessToken: "row-token" })
    confirmMock.mockResolvedValue(false)
  })

  it("times out and leaves the transaction queued for retry, not parked as a failure", async () => {
    const { createNastiSupabaseClientForToken } = await vi.importActual<
      typeof import("@nasti/common/supabase")
    >("@nasti/common/supabase")
    const { createFetchWithTimeout } = await import("../../fetchWithTimeout")
    const { SupabaseConnector } = await import("../connector")

    // Accepts the request and never answers: a weak-signal stall.
    const stalledFetch: typeof fetch = () => new Promise<Response>(() => {})
    const connector = new SupabaseConnector((token) =>
      createNastiSupabaseClientForToken(token, {
        fetch: createFetchWithTimeout(stalledFetch, { requestIdleTimeoutMs: 40 }),
      }),
    )

    const transaction = {
      crud: [{
        table: "species",
        id: "row-stalled",
        op: UpdateType.PUT,
        opData: { name: "test" },
        clientId: 1,
      } as unknown as CrudEntry],
      complete: vi.fn(),
    } as unknown as CrudTransaction & { complete: ReturnType<typeof vi.fn> }
    const database = {
      getNextCrudTransaction: vi.fn(async () => transaction),
      writeTransaction: vi.fn(),
    }

    await expect(connector.uploadData(database as never)).rejects.toThrow()

    // Not completed and not written to sync_failures: PowerSync retries it.
    expect(transaction.complete).not.toHaveBeenCalled()
    expect(database.writeTransaction).not.toHaveBeenCalled()
    expect(confirmMock).not.toHaveBeenCalled()
    expect(captureMessageMock).toHaveBeenCalledWith(
      "PowerSync row upload disposition",
      expect.objectContaining({
        extra: expect.objectContaining({ disposition: "retry" }),
      }),
    )
  })
})
