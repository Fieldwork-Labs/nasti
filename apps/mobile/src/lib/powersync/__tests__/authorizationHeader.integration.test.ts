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

describe("Supabase row request authorization adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true })
    acquireMock.mockResolvedValue({ accessToken: "captured-row-token" })
    confirmMock.mockResolvedValue(false)
  })

  it("sends the acquired token and classifies the failing request against that snapshot", async () => {
    const { createNastiSupabaseClientForToken } = await vi.importActual<
      typeof import("@nasti/common/supabase")
    >("@nasti/common/supabase")
    const { SupabaseConnector } = await import("../connector")

    let currentAuthToken = "captured-row-token"
    let observedAuthorization: string | null = null
    const fetchAdapter: typeof fetch = async (input, init) => {
      const request = new Request(input, init)
      observedAuthorization = request.headers.get("Authorization")
      currentAuthToken = "later-auth-token"
      return new Response(
        JSON.stringify({ code: "42501", message: "row rejected" }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      )
    }

    const transaction = {
      crud: [{
        table: "species",
        id: "row-auth-check",
        op: UpdateType.PUT,
        opData: { name: "test" },
      } as unknown as CrudEntry],
      complete: vi.fn(),
    } as unknown as CrudTransaction & { complete: ReturnType<typeof vi.fn> }
    const database = {
      getNextCrudTransaction: vi.fn(async () => transaction),
      writeTransaction: vi.fn(),
    }
    database.writeTransaction.mockImplementation(async (callback: (tx: { execute: () => Promise<void> }) => Promise<void>) =>
      callback({ execute: vi.fn(async () => undefined) }),
    )

    const connector = new SupabaseConnector((token) =>
      createNastiSupabaseClientForToken(token, { fetch: fetchAdapter }),
    )

    await expect(connector.uploadData(database as never)).rejects.toThrow(
      "RLS denial could not be confirmed",
    )

    expect(observedAuthorization).toBe("Bearer captured-row-token")
    expect(currentAuthToken).toBe("later-auth-token")
    expect(confirmMock).toHaveBeenCalledOnce()
    expect(confirmMock).toHaveBeenCalledWith({ accessToken: "captured-row-token" })
    expect(transaction.complete).not.toHaveBeenCalled()
  })
})
