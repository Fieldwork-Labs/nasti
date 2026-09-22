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
  const execute = vi.fn(async (sql: string, parameters: unknown[] = []) => {
    if (failWrite) throw new Error("transaction failed")
    statements.push({ sql, parameters })
  })
  const getAll = vi.fn(async (sql: string): Promise<unknown[]> => {
    if (sql.includes("SELECT id FROM trip")) return [{ id: "trip-1" }]
    if (sql.includes("FROM sync_failures")) return [rowFailure]
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
    db.getAll.mockImplementation(async (sql: string): Promise<unknown[]> => sql.includes("FROM sync_failures") ? [rowFailure] : [{ id: "media-1", kind: "audio", status_code: 413, safe_message: "File too large", failed_at: "2026-09-21T00:00:00.000Z", app_version: "v1" }])
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

  it("retries DELETE idempotently and uses the allowlisted table", async () => {
    const failure = { ...rowFailure, op_type: "DELETE" as const, op_data: "{}" }
    const db = database()
    await retrySyncFailure({ ...failure, failureKind: "row" }, { database: db })
    expect(db.statements.map(({ sql }) => sql)).toEqual([
      "INSERT OR IGNORE INTO trip (id) VALUES (?)",
      "DELETE FROM trip WHERE id = ?",
      "DELETE FROM sync_failures WHERE id = ?",
    ])
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

  it("makes duplicate row retries converge on one local write", async () => {
    const db = database()
    await Promise.all([
      retrySyncFailure({ ...rowFailure, failureKind: "row" }, { database: db }),
      retrySyncFailure({ ...rowFailure, failureKind: "row" }, { database: db }),
    ])
    expect(db.writeTransaction).toHaveBeenCalledTimes(1)
    expect(db.statements.filter(({ sql }) => sql.startsWith("UPDATE trip"))).toHaveLength(1)
  })

  it("dismisses only the issue notice and emits payload-free telemetry", async () => {
    const db = database()
    await dismissSyncFailure({ ...rowFailure, failureKind: "row" }, db)
    expect(db.statements).toEqual([{ sql: "DELETE FROM sync_failures WHERE id = ?", parameters: ["failure-1"] }])
    expect(JSON.stringify(mocks.captureMessage.mock.calls)).not.toContain("private payload")
    expect(JSON.stringify(mocks.captureMessage.mock.calls)).not.toContain("Field trip")
  })
})
