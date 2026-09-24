import { beforeEach, describe, expect, it, vi } from "vitest"
import { UpdateType, type CrudEntry, type CrudTransaction } from "@powersync/web"
import {
  isQueueAuthBlocked,
  resetQueueAuthBlockedState,
} from "../queueAuthState"

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
  selectMock,
  maybeSingleMock,
  confirmMediaRowDeleteMock,
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
  selectMock: vi.fn(),
  maybeSingleMock: vi.fn(),
  confirmMediaRowDeleteMock: vi.fn(),
}))

vi.mock("@nasti/common/supabase", () => ({
  createNastiSupabaseClientForToken: createTokenClientMock,
  supabase: { from: sharedFromMock },
}))

vi.mock("../../auth/liveSession", () => ({
  liveUploadCredentials: { acquire: acquireMock, confirm: confirmMock },
}))

vi.mock("@sentry/react", () => ({ captureMessage: captureMessageMock }))
vi.mock("../attachments", () => ({ confirmMediaRowDelete: confirmMediaRowDeleteMock }))

const TOKEN = "access-token-test-value"
const rowError = (code: string) => ({ code, message: "row request failed" })

function makeOp(
  table: string,
  id: string,
  op: UpdateType,
  opData: Record<string, unknown> = { name: "value" },
): CrudEntry {
  return { table, id, op, opData, clientId: ++clientId } as CrudEntry
}

let clientId = 0

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
  const database: {
    getNextCrudTransaction: ReturnType<typeof vi.fn>
    execute: ReturnType<typeof vi.fn>
    writeTransaction: ReturnType<typeof vi.fn>
  } = {
    getNextCrudTransaction: vi.fn(async () => transactions.shift() ?? null),
    execute: vi.fn(async (_sql: string, args: unknown[]) => {
      savedRows.push(args)
    }),
    writeTransaction: vi.fn(async (callback: (transaction: { execute: (sql: string, args: unknown[]) => Promise<unknown> }) => Promise<void>) => callback(database)),
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
    resetQueueAuthBlockedState()
    localStorage.clear()
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true })
    acquireMock.mockResolvedValue({ accessToken: TOKEN })
    confirmMock.mockResolvedValue(false)
    upsertMock.mockResolvedValue({ error: null })
    updateMock.mockReturnValue({ eq: eqMock })
    deleteMock.mockReturnValue({ eq: eqMock })
    eqMock.mockResolvedValue({ error: null })
    eqMock.mockResolvedValue({ error: null, count: 1 })
    selectMock.mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: maybeSingleMock }) })
    maybeSingleMock.mockResolvedValue({ data: { id: "row" }, error: null })
    tokenClientFromMock.mockReturnValue({
      upsert: upsertMock,
      update: updateMock,
      delete: deleteMock,
      select: selectMock,
    })
    createTokenClientMock.mockImplementation((token: string) => {
      expect(token).toBe(TOKEN)
      return { from: tokenClientFromMock }
    })
  })

  it("binds one acquired token to PUT, PATCH, and DELETE requests", async () => {
    const SupabaseConnector = await connectorClass()
    const completionOrder: string[] = []
    const transaction = makeTransaction([
      makeOp("species", "put-1", UpdateType.PUT),
      makeOp("collection", "patch-1", UpdateType.PATCH, { name: "updated" }),
      makeOp("collection_photo", "delete-1", UpdateType.DELETE),
    ], () => { completionOrder.push("complete") })
    confirmMediaRowDeleteMock.mockImplementationOnce(async () => { completionOrder.push("confirm-delete") })
    const { database } = makeDatabase([transaction])

    await new SupabaseConnector().uploadData(database as never)

    expect(acquireMock).toHaveBeenCalledOnce()
    expect(createTokenClientMock).toHaveBeenCalledWith(TOKEN)
    expect(tokenClientFromMock).toHaveBeenCalledTimes(3)
    expect(upsertMock).toHaveBeenCalledWith({ id: "put-1", name: "value" })
    expect(updateMock).toHaveBeenCalledWith({ name: "updated" })
    expect(deleteMock).toHaveBeenCalledOnce()
    expect(deleteMock).toHaveBeenCalledWith({ count: "exact" })
    expect(confirmMediaRowDeleteMock).toHaveBeenCalledWith("collection_photo", "delete-1", database)
    expect(completionOrder).toEqual(["complete", "confirm-delete"])
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
    expect(isQueueAuthBlocked("rows")).toBe(true)
  })

  it("returns immediately when offline without acquiring credentials or touching the row", async () => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false })
    const SupabaseConnector = await connectorClass()
    const transaction = makeTransaction([makeOp("species", "offline-row", UpdateType.PUT)])
    const { database } = makeDatabase([transaction])

    await expect(new SupabaseConnector().uploadData(database as never)).rejects.toThrow(
      "Device is offline",
    )

    expect(acquireMock).not.toHaveBeenCalled()
    expect(tokenClientFromMock).not.toHaveBeenCalled()
    expect(database.execute).not.toHaveBeenCalled()
    expect(transaction.complete).not.toHaveBeenCalled()
  })

  it("defers PowerSync connection when bounded credential acquisition fails", async () => {
    acquireMock.mockResolvedValue(null)
    const SupabaseConnector = await connectorClass()

    await expect(new SupabaseConnector().fetchCredentials()).rejects.toThrow(
      "Not authenticated - cannot connect to PowerSync",
    )
    expect(acquireMock).toHaveBeenCalledOnce()
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
    expect(isQueueAuthBlocked("rows")).toBe(false)
    expect(savedRows[0]?.[8]).toBe(0)
    expect(JSON.stringify(savedRows)).not.toContain(TOKEN)
  })

  it("continues later rows after a confirmed RLS denial on one operation", async () => {
    upsertMock.mockResolvedValueOnce({ error: rowError("42501") }).mockResolvedValue({ error: null })
    confirmMock.mockResolvedValue(true)
    const SupabaseConnector = await connectorClass()
    const transaction = makeTransaction([
      makeOp("species", "denied-row", UpdateType.PUT),
      makeOp("trip", "allowed-row", UpdateType.PUT),
    ])
    const { database, savedRows } = makeDatabase([transaction])

    await new SupabaseConnector().uploadData(database as never)

    expect(upsertMock).toHaveBeenCalledTimes(2)
    expect(savedRows).toHaveLength(1)
    expect(savedRows[0]?.[2]).toBe("denied-row")
    expect(transaction.complete).toHaveBeenCalledOnce()
  })

  it("saves failed operations atomically after continuing through the transaction", async () => {
    upsertMock.mockResolvedValue({ error: rowError("23514") })
    const SupabaseConnector = await connectorClass()
    let savedCountAtCompletion = 0
    const transaction = makeTransaction(
      [makeOp("species", "row-5a", UpdateType.PUT), makeOp("trip", "row-5b", UpdateType.PATCH)],
      () => expect(savedCountAtCompletion).toBe(1),
    )
    const { database } = makeDatabase([transaction])
    database.execute.mockImplementation(async (_sql, args) => {
      savedCountAtCompletion += 1
      return args
    })

    await new SupabaseConnector().uploadData(database as never)

    expect(database.writeTransaction).toHaveBeenCalledOnce()
    expect(database.execute).toHaveBeenCalledOnce()
    expect(updateMock).toHaveBeenCalledWith({ name: "value" })
    expect(transaction.complete).toHaveBeenCalledOnce()
  })

  it("does not advance when an atomic failure-record transaction rolls back", async () => {
    upsertMock.mockResolvedValue({ error: rowError("23514") })
    const SupabaseConnector = await connectorClass()
    const transaction = makeTransaction([makeOp("species", "row-5c", UpdateType.PUT)])
    const { database, savedRows } = makeDatabase([transaction])
    database.writeTransaction.mockImplementationOnce(async (
      callback: (transaction: { execute: (sql: string, args: unknown[]) => Promise<unknown> }) => Promise<void>,
    ) => {
      const pending: unknown[][] = []
      await callback({
        execute: async (_sql, args) => {
          pending.push(args)
          throw new Error("write failed")
        },
      })
      savedRows.push(...pending)
    })

    await expect(new SupabaseConnector().uploadData(database as never)).rejects.toThrow("write failed")

    expect(savedRows).toEqual([])
    expect(transaction.complete).not.toHaveBeenCalled()
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

  it("parks common permanent database errors and completes the transaction", async () => {
    for (const code of ["23502", "23505", "22P02", "22001", "PGRST204"]) {
      vi.resetModules()
      upsertMock.mockResolvedValueOnce({ error: rowError(code) })
      const SupabaseConnector = await connectorClass()
      const transaction = makeTransaction([makeOp("species", `permanent-${code}`, UpdateType.PUT)])
      const { database, savedRows } = makeDatabase([transaction])
      await new SupabaseConnector().uploadData(database as never)
      expect(savedRows[0]?.[0]).toBe(`sync-failure:${transaction.crud[0]?.clientId}`)
      expect(transaction.complete).toHaveBeenCalledOnce()
    }
  })

  it("preserves the rejected schema column for a collection upload", async () => {
    upsertMock.mockResolvedValueOnce({
      error: {
        code: "PGRST204",
        message: "Could not find the 'material_type' column of 'collection' in the schema cache",
      },
    })
    const SupabaseConnector = await connectorClass()
    const transaction = makeTransaction([makeOp("collection", "new-collection", UpdateType.PUT)])
    const { database, savedRows } = makeDatabase([transaction])

    await new SupabaseConnector().uploadData(database as never)

    expect(JSON.parse(savedRows[0]?.[5] as string)).toEqual({
      code: "PGRST204",
      column: "material_type",
      table: "collection",
    })
  })

  it("continues uploading later operations after parking one permanent row error", async () => {
    upsertMock
      .mockResolvedValueOnce({ error: rowError("23502") })
      .mockResolvedValueOnce({ error: null })
    const SupabaseConnector = await connectorClass()
    const transaction = makeTransaction([
      makeOp("species", "invalid-row", UpdateType.PUT),
      makeOp("species", "valid-row", UpdateType.PUT),
    ])
    const { database, savedRows } = makeDatabase([transaction])
    await new SupabaseConnector().uploadData(database as never)
    expect(upsertMock).toHaveBeenCalledTimes(2)
    expect(savedRows.map((row) => row[0])).toEqual([`sync-failure:${transaction.crud[0]?.clientId}`])
    expect(transaction.complete).toHaveBeenCalledOnce()
  })

  it("uses distinct stable failure IDs for repeated operations on one entity", async () => {
    upsertMock.mockResolvedValue({ error: rowError("23514") })
    const SupabaseConnector = await connectorClass()
    const transaction = makeTransaction([
      makeOp("species", "same-row", UpdateType.PUT),
      makeOp("species", "same-row", UpdateType.PUT),
    ])
    const { database, savedRows } = makeDatabase([transaction])
    await new SupabaseConnector().uploadData(database as never)
    const ids = savedRows.map((row) => row[0])
    expect(new Set(ids).size).toBe(2)
    expect(ids).toEqual(transaction.crud.map((op) => `sync-failure:${op.clientId}`))
  })

  it("keeps a media delete waiting when the server still returns the row", async () => {
    const SupabaseConnector = await connectorClass()
    const transaction = makeTransaction([makeOp("collection_photo", "still-there", UpdateType.DELETE)])
    const { database } = makeDatabase([transaction])
    eqMock.mockResolvedValueOnce({ error: null, count: 0 })
    maybeSingleMock.mockResolvedValueOnce({ data: { id: "still-there" }, error: null })
    await new SupabaseConnector().uploadData(database as never)
    expect(confirmMediaRowDeleteMock).not.toHaveBeenCalled()
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

  it("uses stable failure IDs when completion failure causes a replay", async () => {
    upsertMock.mockResolvedValue({ error: rowError("23514") })
    const SupabaseConnector = await connectorClass()
    const transaction = makeTransaction([makeOp("species", "row-stable", UpdateType.PUT)])
    transaction.complete.mockRejectedValueOnce(new Error("completion failed"))
    const { database, savedRows } = makeDatabase([transaction])
    database.getNextCrudTransaction.mockResolvedValue(transaction)
    const connector = new SupabaseConnector()

    await connector.uploadData(database as never)
    await connector.uploadData(database as never)

    expect(savedRows).toHaveLength(2)
    expect(savedRows[0]?.[0]).toBe(savedRows[1]?.[0])
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
        expect(database.savedRows[0]?.[8]).toBe(4)
        expect(badTx.complete).toHaveBeenCalledOnce()
        await new ReloadedConnector().uploadData(database.database as never)
        expect(nextTx.complete).toHaveBeenCalledOnce()
      }
    }
    setTimeoutSpy.mockRestore()
  })

  it("bounds dependency retries when localStorage writes are blocked", async () => {
    const setTimeoutSpy = vi
      .spyOn(globalThis, "setTimeout")
      .mockImplementation(((callback: TimerHandler) => {
        if (typeof callback === "function") queueMicrotask(() => callback())
        return 1 as unknown as ReturnType<typeof setTimeout>
      }) as unknown as typeof setTimeout)
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Storage blocked", "SecurityError")
    })
    upsertMock.mockResolvedValue({ error: rowError("23503") })
    const SupabaseConnector = await connectorClass()
    const transaction = makeTransaction([makeOp("collection", "blocked-storage-row", UpdateType.PUT)])
    const { database, savedRows } = makeDatabase([transaction])
    database.getNextCrudTransaction.mockResolvedValue(transaction)
    const connector = new SupabaseConnector()

    for (let attempt = 0; attempt < 4; attempt += 1) {
      await connector.uploadData(database as never)
    }

    expect(savedRows).toHaveLength(1)
    expect(savedRows[0]?.[8]).toBe(4)
    expect(transaction.complete).toHaveBeenCalledOnce()
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
