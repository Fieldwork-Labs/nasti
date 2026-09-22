import { beforeEach, describe, expect, it, vi } from "vitest"
import { UpdateType, type CrudEntry, type CrudTransaction } from "@powersync/web"

const {
  acquireMock,
  confirmMock,
  createTokenClientMock,
  sharedFromMock,
  tokenClientFromMock,
  captureMessageMock,
  upsertMock,
  updateMock,
  deleteMock,
  eqMock,
} = vi.hoisted(() => ({
  acquireMock: vi.fn(),
  confirmMock: vi.fn(),
  createTokenClientMock: vi.fn(),
  sharedFromMock: vi.fn(),
  tokenClientFromMock: vi.fn(),
  captureMessageMock: vi.fn(),
  upsertMock: vi.fn(),
  updateMock: vi.fn(),
  deleteMock: vi.fn(),
  eqMock: vi.fn(),
}))

vi.mock("@nasti/common/supabase", () => ({
  createNastiSupabaseClientForToken: createTokenClientMock,
  supabase: { from: sharedFromMock },
}))

vi.mock("../../auth/liveSession", () => ({
  liveUploadCredentials: { acquire: acquireMock, confirm: confirmMock },
}))

vi.mock("@sentry/react", () => ({ captureMessage: captureMessageMock }))

const TOKEN = "access-token-test-value"
const rowError = (code: string) => ({ code, message: "row request failed" })

function makeOp(
  table: string,
  id: string,
  op: UpdateType,
  opData: Record<string, unknown> = { name: "value" },
): CrudEntry {
  return { table, id, op, opData } as CrudEntry
}

function makeTransaction(crud: CrudEntry[], onComplete?: () => void) {
  const transaction = {
    crud,
    complete: vi.fn(async () => onComplete?.()),
  }
  return transaction as unknown as CrudTransaction & {
    complete: ReturnType<typeof vi.fn>
  }
}

function makeDatabase(transactions: ReturnType<typeof makeTransaction>[]) {
  const savedRows: unknown[][] = []
  const database = {
    getNextCrudTransaction: vi.fn(async () => transactions.shift() ?? null),
    execute: vi.fn(async (_sql: string, args: unknown[]) => {
      savedRows.push(args)
    }),
  }
  return { database, savedRows }
}

async function connectorClass() {
  const module = await import("../connector")
  return module.SupabaseConnector
}

describe("PowerSync row upload connector", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true })
    acquireMock.mockResolvedValue({ accessToken: TOKEN })
    confirmMock.mockResolvedValue(false)
    upsertMock.mockResolvedValue({ error: null })
    updateMock.mockReturnValue({ eq: eqMock })
    deleteMock.mockReturnValue({ eq: eqMock })
    eqMock.mockResolvedValue({ error: null })
    tokenClientFromMock.mockReturnValue({
      upsert: upsertMock,
      update: updateMock,
      delete: deleteMock,
    })
    createTokenClientMock.mockImplementation((token: string) => {
      expect(token).toBe(TOKEN)
      return { from: tokenClientFromMock }
    })
  })

  it("binds one acquired token to PUT, PATCH, and DELETE requests", async () => {
    const SupabaseConnector = await connectorClass()
    const transaction = makeTransaction([
      makeOp("species", "put-1", UpdateType.PUT),
      makeOp("collection", "patch-1", UpdateType.PATCH, { name: "updated" }),
      makeOp("collection_photo", "delete-1", UpdateType.DELETE),
    ])
    const { database } = makeDatabase([transaction])

    await new SupabaseConnector().uploadData(database as never)

    expect(acquireMock).toHaveBeenCalledOnce()
    expect(createTokenClientMock).toHaveBeenCalledWith(TOKEN)
    expect(tokenClientFromMock).toHaveBeenCalledTimes(3)
    expect(upsertMock).toHaveBeenCalledWith({ id: "put-1", name: "value" })
    expect(updateMock).toHaveBeenCalledWith({ name: "updated" })
    expect(deleteMock).toHaveBeenCalledOnce()
    expect(eqMock).toHaveBeenNthCalledWith(1, "id", "patch-1")
    expect(eqMock).toHaveBeenNthCalledWith(2, "id", "delete-1")
    expect(sharedFromMock).not.toHaveBeenCalled()
    expect(transaction.complete).toHaveBeenCalledOnce()
  })

  it("leaves the transaction queued when credentials are unavailable", async () => {
    acquireMock.mockResolvedValue(null)
    const SupabaseConnector = await connectorClass()
    const transaction = makeTransaction([makeOp("species", "row-1", UpdateType.PUT)])
    const { database } = makeDatabase([transaction])

    await expect(new SupabaseConnector().uploadData(database as never)).rejects.toThrow()

    expect(tokenClientFromMock).not.toHaveBeenCalled()
    expect(database.execute).not.toHaveBeenCalled()
    expect(transaction.complete).not.toHaveBeenCalled()
  })

  it("leaves a network failure queued", async () => {
    upsertMock.mockResolvedValue({ error: new TypeError("network offline") })
    const SupabaseConnector = await connectorClass()
    const transaction = makeTransaction([makeOp("species", "row-2", UpdateType.PUT)])
    const { database } = makeDatabase([transaction])

    await expect(new SupabaseConnector().uploadData(database as never)).rejects.toThrow()

    expect(database.execute).not.toHaveBeenCalled()
    expect(transaction.complete).not.toHaveBeenCalled()
  })

  it("keeps anonymous or expired-token 42501 rows queued", async () => {
    upsertMock.mockResolvedValue({ error: rowError("42501") })
    confirmMock.mockResolvedValue(false)
    const SupabaseConnector = await connectorClass()
    const transaction = makeTransaction([makeOp("species", "row-3", UpdateType.PUT)])
    const { database } = makeDatabase([transaction])

    await expect(new SupabaseConnector().uploadData(database as never)).rejects.toThrow()

    expect(confirmMock).toHaveBeenCalledWith({ accessToken: TOKEN })
    expect(database.execute).not.toHaveBeenCalled()
    expect(transaction.complete).not.toHaveBeenCalled()
  })

  it("classifies a denial using the captured request token after auth state changes", async () => {
    upsertMock.mockResolvedValue({ error: rowError("42501") })
    acquireMock.mockResolvedValue({ accessToken: "captured-token" })
    confirmMock.mockImplementation(async (credentials) => {
      expect(credentials).toEqual({ accessToken: "captured-token" })
      return false
    })
    createTokenClientMock.mockReturnValue({ from: tokenClientFromMock })
    const SupabaseConnector = await connectorClass()
    const transaction = makeTransaction([makeOp("species", "row-4", UpdateType.PUT)])
    const { database } = makeDatabase([transaction])

    await expect(new SupabaseConnector().uploadData(database as never)).rejects.toThrow()

    expect(confirmMock).toHaveBeenCalledOnce()
    expect(acquireMock).toHaveBeenCalledOnce()
    expect(database.execute).not.toHaveBeenCalled()
    expect(transaction.complete).not.toHaveBeenCalled()
  })

  it("preserves confirmed RLS denials before completing and stores no token", async () => {
    upsertMock.mockResolvedValue({
      error: { ...rowError("42501"), details: `authorization: Bearer ${TOKEN}` },
    })
    confirmMock.mockResolvedValue(true)
    const SupabaseConnector = await connectorClass()
    let savedBeforeComplete = false
    const transaction = makeTransaction(
      [makeOp("species", "row-5", UpdateType.PUT)],
      () => expect(savedBeforeComplete).toBe(true),
    )
    const { database, savedRows } = makeDatabase([transaction])
    database.execute.mockImplementation(async (_sql, args) => {
      savedRows.push(args)
      savedBeforeComplete = true
    })

    await new SupabaseConnector().uploadData(database as never)

    expect(savedBeforeComplete).toBe(true)
    expect(database.execute).toHaveBeenCalledOnce()
    expect(transaction.complete).toHaveBeenCalledOnce()
    expect(JSON.stringify(savedRows)).not.toContain(TOKEN)
  })

  it("preserves validation errors before completing", async () => {
    upsertMock.mockResolvedValue({ error: rowError("23514") })
    const SupabaseConnector = await connectorClass()
    let saved = false
    const transaction = makeTransaction([makeOp("species", "row-6", UpdateType.PUT)])
    transaction.complete.mockImplementation(async () => {
      expect(saved).toBe(true)
    })
    const { database } = makeDatabase([transaction])
    database.execute.mockImplementation(async () => {
      saved = true
    })

    await new SupabaseConnector().uploadData(database as never)

    expect(database.execute).toHaveBeenCalledOnce()
    expect(transaction.complete).toHaveBeenCalledOnce()
  })

  it("replays a preserved transaction when completion fails", async () => {
    upsertMock.mockResolvedValueOnce({ error: rowError("23514") })
    const SupabaseConnector = await connectorClass()
    const transaction = makeTransaction([makeOp("species", "row-6b", UpdateType.PUT)])
    transaction.complete.mockRejectedValueOnce(new Error("completion failed"))
    const { database } = makeDatabase([transaction])
    database.getNextCrudTransaction.mockResolvedValue(transaction)
    const connector = new SupabaseConnector()

    await connector.uploadData(database as never)
    expect(transaction.complete).toHaveBeenCalledOnce()
    await connector.uploadData(database as never)

    expect(upsertMock).toHaveBeenCalledTimes(2)
    expect(transaction.complete).toHaveBeenCalledTimes(2)
  })

  it("persists dependency retries across reloads and unblocks the next row", async () => {
    const setTimeoutSpy = vi
      .spyOn(globalThis, "setTimeout")
      .mockImplementation(((callback: TimerHandler) => {
        if (typeof callback === "function") queueMicrotask(() => callback())
        return 1 as unknown as ReturnType<typeof setTimeout>
      }) as unknown as typeof setTimeout)
    upsertMock.mockResolvedValueOnce({ error: rowError("23503") })
    const firstConnectorClass = await connectorClass()
    const firstTx = makeTransaction([makeOp("collection", "bad-row", UpdateType.PUT)])
    const firstDb = makeDatabase([firstTx])
    await new firstConnectorClass().uploadData(firstDb.database as never)
    expect(Object.keys(localStorage).some((key) => key.includes("dependency-retries"))).toBe(true)

    for (let attempt = 0; attempt < 3; attempt += 1) {
      vi.resetModules()
      const ReloadedConnector = await connectorClass()
      const badTx = makeTransaction([makeOp("collection", "bad-row", UpdateType.PUT)])
      const nextTx = makeTransaction([makeOp("species", `next-${attempt}`, UpdateType.PUT)])
      const database = makeDatabase([badTx, nextTx])
      upsertMock.mockResolvedValueOnce({ error: rowError("23503") })
      await new ReloadedConnector().uploadData(database.database as never)

      if (attempt < 2) {
        expect(badTx.complete).not.toHaveBeenCalled()
        expect(database.database.execute).not.toHaveBeenCalled()
      } else {
        expect(database.database.execute).toHaveBeenCalledOnce()
        expect(badTx.complete).toHaveBeenCalledOnce()
        await new ReloadedConnector().uploadData(database.database as never)
        expect(nextTx.complete).toHaveBeenCalledOnce()
      }
    }
    setTimeoutSpy.mockRestore()
  })

  it("replays partial transactions idempotently", async () => {
    const SupabaseConnector = await connectorClass()
    const transaction = makeTransaction([
      makeOp("species", "same-put", UpdateType.PUT),
      makeOp("collection", "same-patch", UpdateType.PATCH, { name: "fixed" }),
    ])
    const { database } = makeDatabase([transaction])
    database.getNextCrudTransaction.mockResolvedValue(transaction)
    updateMock.mockReturnValueOnce({ eq: vi.fn().mockResolvedValue({ error: rowError("network") }) })

    await expect(new SupabaseConnector().uploadData(database as never)).rejects.toThrow()
    await new SupabaseConnector().uploadData(database as never)

    expect(upsertMock).toHaveBeenCalledTimes(2)
    expect(upsertMock).toHaveBeenNthCalledWith(1, { id: "same-put", name: "value" })
    expect(upsertMock).toHaveBeenNthCalledWith(2, { id: "same-put", name: "value" })
    expect(transaction.complete).toHaveBeenCalledOnce()
  })

  it("keeps diagnostics free of bearer tokens and authorization headers", async () => {
    upsertMock.mockResolvedValue({
      error: {
        ...rowError("unknown"),
        headers: { authorization: `Bearer ${TOKEN}` },
      },
    })
    const SupabaseConnector = await connectorClass()
    const transaction = makeTransaction([makeOp("species", "row-7", UpdateType.PUT)])
    const { database } = makeDatabase([transaction])

    await expect(new SupabaseConnector().uploadData(database as never)).rejects.toThrow()

    const diagnostics = JSON.stringify(captureMessageMock.mock.calls)
    expect(diagnostics).not.toContain(TOKEN)
    expect(diagnostics.toLowerCase()).not.toContain("authorization")
  })
})
