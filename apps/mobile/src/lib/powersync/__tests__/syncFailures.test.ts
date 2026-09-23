import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ captureMessage: vi.fn() }))
vi.mock("@sentry/react", () => ({ captureMessage: mocks.captureMessage }))
vi.mock("../db", () => ({ powerSyncDb: {} }))
vi.mock("../attachments", () => ({ mediaAttachmentQueue: { retry: vi.fn() } }))
vi.mock("../../persistFiles", () => ({ getImage: vi.fn() }))
vi.mock("../../persistAudio", () => ({ getAudio: vi.fn() }))

import { dismissSyncFailure, listSyncFailures, retrySyncFailure, type RowFailure, type SyncFailure } from "../syncFailures"

function database() {
  const statements: Array<{ sql: string; parameters: unknown[] }> = []
  let failWrite = false
  let failurePresent = true
  let localRowPresent = true
  let failureRetryCount = 0
  const execute = vi.fn(async (sql: string, parameters: unknown[] = []) => {
    if (failWrite) throw new Error("transaction failed")
    statements.push({ sql, parameters })
    if (sql === "DELETE FROM sync_failures WHERE id = ?") failurePresent = false
  })
  const getAll = vi.fn(async (sql: string, _parameters?: unknown[]): Promise<unknown[]> => {
    if (sql.includes("FROM row_delete_retry_jobs j")) return []
    if (sql.includes("SELECT id FROM trip")) return localRowPresent ? [{ id: "trip-1" }] : []
    if (sql.includes("SELECT id, retry_count FROM sync_failures WHERE")) return failurePresent ? [{ id: "failure-1", retry_count: failureRetryCount }] : []
    if (sql.includes("SELECT id FROM sync_failures WHERE")) return failurePresent ? [{ id: "failure-1" }] : []
    if (sql.includes("FROM sync_failures")) return failurePresent ? [rowFailure] : []
    if (sql.includes("FROM media_upload_failures")) return []
    if (sql.includes("FROM media_upload_jobs")) return [{ id: "media-1", kind: "photo", operation: "upload", table_name: "collection_photo", bucket: "collection-photos", path: "private/path.jpg", mime_type: "image/jpeg" }]
    return []
  })
  const db = {
    execute,
    getAll,
    writeTransaction: vi.fn(async (callback: (tx: typeof db) => Promise<void>) => {
      if (failWrite) throw new Error("transaction failed")
      await callback(db)
    }),
    statements,
    setFailWrite: (value: boolean) => { failWrite = value },
    setLocalRowPresent: (value: boolean) => { localRowPresent = value },
    setFailureRetryCount: (value: number) => { failureRetryCount = value },
  }
  return db
}

const rowFailure: RowFailure = {
  id: "failure-1", target_table: "trip", entity_id: "trip-1", op_type: "PATCH",
  op_data: JSON.stringify({ name: "Field trip", metadata: { note: "private payload" } }),
  error_info: '{"code":"23514"}', failed_at: "2026-09-22T00:00:00.000Z", classification: "validation",
}

describe("sync failure recovery", () => {
  beforeEach(() => { vi.clearAllMocks() })

  it("lists row and media failures without changing their records", async () => {
    const db = database()
    db.getAll.mockImplementation(async (sql: string): Promise<unknown[]> => sql.includes("FROM row_delete_retry_jobs j") ? [] : sql.includes("FROM sync_failures") ? [rowFailure] : [{ id: "media-1", kind: "audio", status_code: 413, safe_message: "File too large", failed_at: "2026-09-21T00:00:00.000Z", app_version: "v1" }])
    const failures = await listSyncFailures(db)
    expect(failures.map(({ failureKind }) => failureKind)).toEqual(["row", "media"])
    expect(db.execute).not.toHaveBeenCalled()
  })

  it("reconstructs an allowlisted PATCH and removes the notice in its transaction", async () => {
    const db = database()
    await retrySyncFailure({ ...rowFailure, failureKind: "row" }, { database: db })
    expect(db.statements[0]).toMatchObject({
      sql: "UPDATE trip SET name = ?, metadata = ? WHERE id = ?",
      parameters: ["Field trip", '{"note":"private payload"}', "trip-1"],
    })
    expect(db.statements[1]).toMatchObject({ sql: "DELETE FROM sync_failures WHERE id = ?", parameters: ["failure-1"] })
  })

  it("queues a DELETE by failure ID without touching the absent local target", async () => {
    const failure = { ...rowFailure, op_type: "DELETE" as const, op_data: "{}" }
    const db = database()
    await retrySyncFailure({ ...failure, failureKind: "row" }, { database: db })
    expect(db.statements).toHaveLength(2)
    expect(db.statements[0]?.sql).toContain("INSERT OR IGNORE INTO row_delete_retry_jobs")
    expect(db.statements[1]?.sql).toContain("UPDATE row_delete_retry_jobs")
    expect(db.statements.every(({ sql }) => !/DELETE FROM trip\b/.test(sql))).toBe(true)
  })

  it("registers a DELETE retry even when the local target row is absent", async () => {
    const failure = { ...rowFailure, op_type: "DELETE" as const, op_data: "{}" }
    const db = database()
    db.setLocalRowPresent(false)
    await expect(retrySyncFailure({ ...failure, failureKind: "row" }, { database: db })).resolves.toBeUndefined()
    expect(db.writeTransaction).toHaveBeenCalledOnce()
    expect(db.statements[0]?.sql).toContain("row_delete_retry_jobs")
    await expect(db.getAll("SELECT id FROM sync_failures WHERE id = ?", [failure.id])).resolves.toEqual([{ id: "failure-1" }])
  })

  it("rejects malformed JSON, unknown tables, and unknown columns without writes", async () => {
    const db = database()
    await expect(retrySyncFailure({ ...rowFailure, op_data: "{" , failureKind: "row" }, { database: db })).rejects.toThrow()
    await expect(retrySyncFailure({ ...rowFailure, target_table: "trip; DROP TABLE trip", failureKind: "row" }, { database: db })).rejects.toThrow(/unsupported table/)
    await expect(retrySyncFailure({ ...rowFailure, op_data: '{"password":"secret"}', failureKind: "row" }, { database: db })).rejects.toThrow(/unsupported field/)
    expect(db.execute).not.toHaveBeenCalled()
  })

  it("leaves a failure visible when the local write transaction rolls back", async () => {
    const db = database()
    db.setFailWrite(true)
    await expect(retrySyncFailure({ ...rowFailure, failureKind: "row" }, { database: db })).rejects.toThrow("transaction failed")
    expect(db.execute).not.toHaveBeenCalled()
  })

  it("requires preserved bytes and retains the media issue when retry registration fails", async () => {
    const failure: SyncFailure = { failureKind: "media", id: "media-1", kind: "photo", status_code: 413, safe_message: "File too large", failed_at: "2026-09-22T00:00:00.000Z", app_version: "v1" }
    const retry = vi.fn().mockRejectedValue(new Error("failed"))
    const db = database()
    await expect(retrySyncFailure(failure, { database: db, queue: { retry }, getImage: vi.fn().mockResolvedValue({ image: "data:image/jpeg;base64,YQ==" }) })).rejects.toThrow("failed")
    expect(retry).toHaveBeenCalledWith("media-1")
    expect(db.execute).not.toHaveBeenCalled()
    await expect(retrySyncFailure(failure, { database: db, queue: { retry }, getImage: vi.fn().mockResolvedValue(undefined) })).rejects.toThrow(/bytes/)
  })

  it("retries a failed media delete without requiring local bytes", async () => {
    const failure: SyncFailure = { failureKind: "media", id: "media-1", kind: "photo", status_code: 422, safe_message: "Storage rejected deletion", failed_at: "2026-09-22T00:00:00.000Z", app_version: "v1" }
    const db = database()
    db.getAll.mockImplementation(async (sql: string): Promise<unknown[]> =>
      sql.includes("FROM media_upload_jobs")
        ? [{ id: "media-1", kind: "photo", operation: "delete", attempt_count: 2 }]
        : [],
    )
    const retry = vi.fn().mockResolvedValue(undefined)
    const getImage = vi.fn()
    await retrySyncFailure(failure, { database: db, queue: { retry }, getImage })
    expect(retry).toHaveBeenCalledWith("media-1")
    expect(getImage).not.toHaveBeenCalled()
    expect(mocks.captureMessage).toHaveBeenCalledWith("Sync issue recovery", expect.objectContaining({
      extra: expect.objectContaining({ disposition: "success", retryCount: 3 }),
    }))
  })

  it("makes duplicate row retries converge on one local write", async () => {
    const db = database()
    await Promise.all([
      retrySyncFailure({ ...rowFailure, failureKind: "row" }, { database: db }),
      retrySyncFailure({ ...rowFailure, failureKind: "row" }, { database: db }),
    ])
    expect(db.writeTransaction).toHaveBeenCalledTimes(1)
    expect(db.statements.filter(({ sql }) => sql.startsWith("UPDATE trip"))).toHaveLength(1)
  })

  it("reports the persisted retry attempt count in recovery telemetry", async () => {
    const db = database()
    db.setFailureRetryCount(4)
    await retrySyncFailure({ ...rowFailure, failureKind: "row", retry_count: 4 }, { database: db })
    const event = mocks.captureMessage.mock.calls[0]?.[1] as { extra?: { retryCount?: number } }
    expect(event.extra?.retryCount).toBe(5)
  })

  it("does not replay a stale failure object after its notice was removed", async () => {
    const db = database()
    const failure = { ...rowFailure, failureKind: "row" as const }
    await retrySyncFailure(failure, { database: db })
    await retrySyncFailure(failure, { database: db })
    expect(db.writeTransaction).toHaveBeenCalledTimes(2)
    expect(db.statements.filter(({ sql }) => sql.startsWith("UPDATE trip"))).toHaveLength(1)
    expect(db.statements.filter(({ sql }) => sql === "DELETE FROM sync_failures WHERE id = ?")).toHaveLength(1)
  })

  it("dismisses only the issue notice and emits payload-free telemetry", async () => {
    const db = database()
    await dismissSyncFailure({ ...rowFailure, op_data: '{"name":"Bearer secret-token"}', failureKind: "row" }, db)
    expect(db.statements).toEqual([{ sql: "DELETE FROM sync_failures WHERE id = ?", parameters: ["failure-1"] }])
    expect(JSON.stringify(mocks.captureMessage.mock.calls)).not.toContain("private payload")
    expect(JSON.stringify(mocks.captureMessage.mock.calls)).not.toContain("Field trip")
    expect(JSON.stringify(mocks.captureMessage.mock.calls)).not.toContain("secret-token")
    expect(JSON.stringify(mocks.captureMessage.mock.calls)).toContain('"retryCount":0')
  })

  it("resurfaces a dismissed pending DELETE as a retryable issue if it later fails terminally", async () => {
    let syncFailurePresent = true
    let jobStatus = "pending"
    let noticeDismissed = 0
    let jobError: string | null = null
    const statements: string[] = []
    const db = {
      execute: vi.fn(async (sql: string) => {
        statements.push(sql)
        if (sql === "DELETE FROM sync_failures WHERE id = ?") syncFailurePresent = false
        if (sql === "UPDATE row_delete_retry_jobs SET notice_dismissed = 1 WHERE id = ?") noticeDismissed = 1
      }),
      getAll: vi.fn(async (sql: string) => {
        if (sql.includes("FROM sync_failures sf ORDER")) return syncFailurePresent ? [{ ...rowFailure, op_type: "DELETE", op_data: "{}", delete_retry_status: jobStatus }] : []
        if (sql.includes("FROM media_upload_failures")) return []
        if (sql.includes("FROM row_delete_retry_jobs j")) {
          return jobStatus === "failed" && noticeDismissed === 0
            ? [{ id: "failure-1", target_table: "trip", entity_id: "trip-1", op_type: "DELETE", op_data: "{}", error_info: "{}", failed_at: "2026-09-22T00:00:00.000Z", classification: "retry_terminal", retry_count: 1, delete_retry_status: "failed", delete_retry_message: jobError }]
            : []
        }
        if (sql.includes("SELECT id, retry_count FROM sync_failures")) return syncFailurePresent ? [{ id: "failure-1", retry_count: 0 }] : []
        if (sql.includes("SELECT id, attempt_count FROM row_delete_retry_jobs")) return jobStatus === "failed" ? [{ id: "failure-1", attempt_count: 1 }] : []
        return []
      }),
      writeTransaction: vi.fn(async (callback: (transaction: typeof db) => Promise<void>) => callback(db)),
    }
    const dismissedFailure = { ...rowFailure, failureKind: "row" as const, op_type: "DELETE" as const, op_data: "{}", delete_retry_status: "pending" as const }
    await dismissSyncFailure(dismissedFailure, db)
    expect(jobStatus).toBe("pending")
    expect(noticeDismissed).toBe(1)
    expect(statements).toContain("UPDATE row_delete_retry_jobs SET notice_dismissed = 1 WHERE id = ?")

    // The queue terminal transition clears notice_dismissed so the unresolved
    // job becomes visible again even though its original failure row was hidden.
    jobStatus = "failed"
    jobError = "Server rejected this delete (422)."
    noticeDismissed = 0
    const [synthetic] = await listSyncFailures(db)
    expect(synthetic).toMatchObject({ failureKind: "row", id: "failure-1", op_type: "DELETE", delete_retry_message: jobError })

    const enqueue = vi.fn(async (_failure: unknown, transaction?: { execute(sql: string, params?: unknown[]): Promise<unknown> }) => {
      await transaction?.execute("UPDATE row_delete_retry_jobs SET status = 'pending' WHERE id = ?", ["failure-1"])
      jobStatus = "pending"
    })
    const wake = vi.fn()
    await retrySyncFailure(synthetic!, { database: db, deleteQueue: { enqueue, wake } })
    expect(enqueue).toHaveBeenCalledOnce()
    expect(wake).toHaveBeenCalledOnce()
    expect(jobStatus).toBe("pending")
  })
})
