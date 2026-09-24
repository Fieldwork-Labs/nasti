import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { spawnSync } from "node:child_process"

vi.mock("@/lib/powersync/db", () => ({ powerSyncDb: {} }))
vi.mock("@/lib/persistFiles", () => ({ getImage: vi.fn(), getAllImages: vi.fn() }))
vi.mock("@/lib/persistAudio", () => ({ getAudio: vi.fn(), getAllAudios: vi.fn() }))
vi.mock("../auth/liveSession", () => ({
  liveUploadCredentials: { acquire: vi.fn(), confirm: vi.fn() },
}))
vi.mock("../storageUpload", () => ({ uploadToStorage: vi.fn() }))

import { confirmMediaRowDelete, LocalAttachmentQueue, validateMediaUploadIds } from "../attachments"

const setup = () => {
  const jobs = new Map<string, Record<string, unknown>>()
  const metadataRows = new Map<string, Record<string, unknown>>()
  const statements: { sql: string; parameters: unknown[] }[] = []
  let failingInsertId: string | undefined
  let failureConsumed = false
  const execute = vi.fn(async (sql: string, parameters: unknown[] = []) => {
    if (
      !failureConsumed &&
      failingInsertId &&
      sql.includes("INSERT OR IGNORE INTO media_upload_jobs") &&
      parameters[0] === failingInsertId
    ) {
      failureConsumed = true
      throw new Error("interrupted")
    }
    statements.push({ sql, parameters })
    if (sql.includes("INSERT OR IGNORE INTO media_upload_jobs") && sql.includes("'delete'")) {
      const [id, kind, table, bucket, path, mimeType, next, created] = parameters
      if (!jobs.has(String(id))) jobs.set(String(id), {
        id, kind, operation: "delete", table_name: table, bucket, path, mime_type: mimeType,
        status: "waiting_for_row_delete", attempt_count: 0, next_attempt_at: next, created_at: created,
      })
    } else if (sql.includes("INSERT OR IGNORE INTO media_upload_jobs")) {
      const [id, kind, table, bucket, path, mimeType, next, created] = parameters
      if (!jobs.has(String(id))) {
        jobs.set(String(id), {
          id,
          kind,
          operation: "upload",
          table_name: table,
          bucket,
          path,
          mime_type: mimeType,
          status: "pending",
          attempt_count: 0,
          next_attempt_at: next,
          created_at: created,
        })
      }
    } else if (sql.includes("INSERT INTO media_upload_jobs")) {
      const [id, kind, table, bucket, path, mimeType, next, created] = parameters
      jobs.set(String(id), {
        id,
        kind,
        operation: "delete",
        table_name: table,
        bucket,
        path,
        mime_type: mimeType,
        status: "waiting_for_row_delete",
        attempt_count: 0,
        next_attempt_at: next,
        created_at: created,
      })
    } else if (sql.includes("UPDATE media_upload_jobs SET operation = 'delete'")) {
      const job = jobs.get(String(parameters[5]))
      if (job) Object.assign(job, { operation: "delete", status: "waiting_for_row_delete", attempt_count: 0, next_attempt_at: parameters[0] })
    } else if (sql.includes("SET status = 'deleting', next_attempt_at = ?")) {
      const job = jobs.get(String(parameters[1]))
      if (job && job.table_name === parameters[2] && job.operation === "delete" && job.status === "waiting_for_row_delete") {
        job.status = "deleting"
        job.next_attempt_at = parameters[0]
      }
    } else if (sql.includes("SET status = 'uploading'")) {
      const job = jobs.get(String(parameters[0]))
      const id = String(parameters[1])
      const claimed = jobs.get(id)
      if (claimed?.status === "pending" || claimed?.status === "deleting") {
        claimed.status = "uploading"
        claimed.next_attempt_at = parameters[0]
        return { rowsAffected: 1 }
      }
      if (job?.status === "pending" || job?.status === "deleting") job.status = "uploading"
      return { rowsAffected: 0 }
    } else if (sql.includes("SET status = ?, attempt_count = ?")) {
      const job = jobs.get(String(parameters[3]))
      if (job) {
        job.status = parameters[0]
        job.attempt_count = parameters[1]
        job.next_attempt_at = parameters[2]
      }
    } else if (sql.includes("attempt_count = ?, next_attempt_at = ? WHERE id = ?")) {
      const job = jobs.get(String(parameters[2]))
      if (job) {
        job.status = job.operation === "delete" ? "deleting" : "pending"
        job.attempt_count = parameters[0]
        job.next_attempt_at = parameters[1]
      }
    } else if (sql.includes("SET status = 'failed'")) {
      const job = jobs.get(String(parameters[0]))
      if (job) {
        job.status = "failed"
        job.attempt_count = Number(job.attempt_count ?? 0) + 1
      }
    } else if (sql.includes("SET uploaded_at = NULL")) {
      const row = metadataRows.get(String(parameters[0]))
      if (row) row.uploaded_at = null
    } else if (sql.includes("SET status = 'uploaded'")) {
      const job = jobs.get(String(parameters[0]))
      if (job) job.status = "uploaded"
    } else if (sql.includes("SET status = 'complete'")) {
      const job = jobs.get(String(parameters[0]))
      if (job) job.status = "complete"
    } else if (sql.includes("INSERT OR REPLACE INTO media_migrations")) {
      migrations.add(String(parameters[0]))
    }
    return { rowsAffected: 1 }
  })
  const migrations = new Set<string>(["legacy-media-cache-v2"])
  const getAll = vi.fn(async (sql = "", parameters: unknown[] = []) => {
    if (sql.includes("FROM media_migrations")) {
      return migrations.has(String(parameters[0])) ? [{ id: parameters[0] }] : []
    }
    if (sql.includes("SELECT status, next_attempt_at FROM media_upload_jobs WHERE id = ?")) {
      const job = jobs.get(String(parameters[0]))
      return job ? [{ status: job.status, next_attempt_at: job.next_attempt_at }] : []
    }
    if (sql.includes("SELECT next_attempt_at FROM media_upload_jobs WHERE id = ?")) {
      const job = jobs.get(String(parameters[0]))
      return job ? [{ next_attempt_at: job.next_attempt_at }] : []
    }
    if (sql.includes("SELECT id FROM media_upload_jobs WHERE id = ?")) {
      const id = String(parameters[0])
      return jobs.has(id) ? [{ id }] : []
    }
    if (sql.includes("SELECT * FROM media_upload_jobs")) {
      return [...jobs.values()].filter((job) =>
        (job.status === "pending" || job.status === "deleting") &&
        (!job.next_attempt_at || String(job.next_attempt_at) <= String(parameters[0]) || String(job.next_attempt_at) > String(parameters[1])),
      )
    }
    return [...jobs.values()]
  })
  const writeTransaction = vi.fn(async (
    callback: (transaction: { execute: typeof execute; getAll: typeof getAll }) => Promise<void>,
  ) => callback({ execute, getAll }))
  return {
    jobs,
    metadataRows,
    migrations,
    statements,
    execute,
    getAll,
    writeTransaction,
    setFailingInsertId: (id: string) => { failingInsertId = id },
  }
}

describe("LocalAttachmentQueue", () => {
  const activeQueues: LocalAttachmentQueue[] = []
  const activate = (queue: LocalAttachmentQueue) => {
    activeQueues.push(queue)
    queue.start()
  }
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => {
    for (const queue of activeQueues.splice(0)) queue.stop()
  })

  it("rejects non-UUID upload path components", () => {
    expect(() => validateMediaUploadIds(
      "not-a-uuid",
      "00000000-0000-4000-8000-000000000002",
      "00000000-0000-4000-8000-000000000001",
    )).toThrow("Invalid media ID")
  })

  it("defers without credentials and retains the queued job", async () => {
    const db = setup()
    const upload = vi.fn()
    const queue = new LocalAttachmentQueue({
      database: db,
      credentials: { acquire: vi.fn().mockResolvedValue(null), confirm: vi.fn() },
      upload,
      getImage: vi.fn().mockResolvedValue({ image: "data:image/jpeg;base64,YQ==" }),
      online: () => true,
    })
    await queue.enqueue({ id: "a", kind: "photo", table: "collection_photo", bucket: "collection-photos", path: "a.jpg", mimeType: "image/jpeg" })
    activate(queue)
    queue.wake()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(upload).not.toHaveBeenCalled()
    expect(db.jobs.get("a")).toMatchObject({ status: "pending", attempt_count: 1 })
  })

  it.each([401, 403])("retries an HTTP %i response", async (status) => {
    const db = setup()
    const upload = vi.fn().mockRejectedValue(
      Object.assign(new Error("private error text"), {
        retryable: true,
        statusCode: status,
        safeMessage: `Storage rejected the upload (HTTP ${status})`,
      }),
    )
    const queue = new LocalAttachmentQueue({
      database: db,
      credentials: { acquire: vi.fn().mockResolvedValue({ accessToken: "live-token" }), confirm: vi.fn() },
      upload,
      getImage: vi.fn().mockResolvedValue({ image: "data:image/jpeg;base64,YQ==" }),
      online: () => true,
    })
    await queue.enqueue({ id: "a", kind: "photo", table: "collection_photo", bucket: "collection-photos", path: "a.jpg", mimeType: "image/jpeg" })
    activate(queue)
    queue.wake()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(db.jobs.get("a")).toMatchObject({ status: "pending", attempt_count: 1 })
    expect(db.statements.some(({ sql }) => sql.includes("media_upload_failures"))).toBe(false)
  })

  it("surfaces a repeatedly rejected HTTP 400 upload in Sync issues", async () => {
    const db = setup()
    const upload = vi.fn().mockRejectedValue(Object.assign(new Error("private details"), {
      retryable: true,
      statusCode: 400,
      safeMessage: "Storage rejected the upload (HTTP 400)",
    }))
    const queue = new LocalAttachmentQueue({
      database: db,
      credentials: { acquire: vi.fn().mockResolvedValue({ accessToken: "token" }), confirm: vi.fn() },
      upload,
      getImage: vi.fn().mockResolvedValue({ image: "data:image/jpeg;base64,YQ==" }),
      online: () => true,
    })
    await queue.enqueue({ id: "rejected-photo", kind: "photo", table: "collection_photo", bucket: "collection-photos", path: "rejected.jpg", mimeType: "image/jpeg" })
    db.jobs.get("rejected-photo")!.attempt_count = 9
    activate(queue)
    await vi.waitFor(() => expect(db.jobs.get("rejected-photo")?.status).toBe("failed"))
    const saved = db.statements.find(({ sql }) => sql.includes("INSERT OR REPLACE INTO media_upload_failures"))
    expect(saved?.parameters).toContain("Storage repeatedly rejected the upload. Sign in again or retry.")
    expect(JSON.stringify(saved)).not.toContain("private details")
  })

  it("records a permanent failure and advances to the next item without leaking the error", async () => {
    const db = setup()
    const upload = vi.fn(async ({ path }: { path: string }) => {
      if (path === "a.jpg") {
        throw Object.assign(new Error("Bearer secret-token"), {
          retryable: false,
          statusCode: 413,
          safeMessage: "Storage rejected the file as too large",
        })
      }
    })
    const queue = new LocalAttachmentQueue({
      database: db,
      credentials: { acquire: vi.fn().mockResolvedValue({ accessToken: "live-token" }), confirm: vi.fn() },
      upload,
      getImage: vi.fn().mockResolvedValue({ image: "data:image/jpeg;base64,YQ==" }),
      online: () => true,
    })
    await queue.enqueue({ id: "a", kind: "photo", table: "collection_photo", bucket: "collection-photos", path: "a.jpg", mimeType: "image/jpeg" })
    await queue.enqueue({ id: "b", kind: "photo", table: "collection_photo", bucket: "collection-photos", path: "b.jpg", mimeType: "image/jpeg" })
    activate(queue)
    queue.wake()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(upload).toHaveBeenCalledTimes(2)
    expect(db.jobs.get("a")).toMatchObject({ status: "failed" })
    expect(db.jobs.get("b")).toMatchObject({ status: "uploaded" })
    const failureSql = db.statements.find(({ sql }) => sql.includes("INSERT OR REPLACE INTO media_upload_failures"))
    expect(failureSql?.parameters).toContain("Storage rejected the file as too large")
    expect(JSON.stringify(db.statements)).not.toContain("secret-token")
    expect(db.statements.some(({ sql }) => sql.includes("UPDATE collection_photo SET uploaded_at = NULL"))).toBe(false)
  })

  it("surfaces missing local bytes after bounded retries", async () => {
    const db = setup()
    let time = new Date("2026-09-23T00:00:00.000Z")
    const queue = new LocalAttachmentQueue({
      database: db,
      credentials: { acquire: vi.fn().mockResolvedValue({ accessToken: "token" }), confirm: vi.fn() },
      upload: vi.fn(),
      getImage: vi.fn().mockResolvedValue(null),
      now: () => time,
      online: () => true,
    })
    await queue.enqueue({ id: "lost-photo", kind: "photo", table: "collection_photo", bucket: "collection-photos", path: "lost.jpg", mimeType: "image/jpeg" })
    activate(queue)
    for (let attempt = 0; attempt < 3; attempt += 1) {
      time = new Date(time.getTime() + 10_000)
      queue.wake()
      await vi.waitFor(() => expect(db.jobs.get("lost-photo")?.attempt_count).toBe(attempt + 1))
    }
    expect(db.jobs.get("lost-photo")?.status).toBe("failed")
    expect(db.statements.some(({ sql }) => sql.includes("INSERT OR REPLACE INTO media_upload_failures"))).toBe(true)
  })

  it("recovers a pending retry scheduled far ahead by a corrected device clock", async () => {
    const db = setup()
    const upload = vi.fn().mockResolvedValue(undefined)
    const queue = new LocalAttachmentQueue({
      database: db,
      credentials: { acquire: vi.fn().mockResolvedValue({ accessToken: "token" }), confirm: vi.fn() },
      upload,
      getImage: vi.fn().mockResolvedValue({ image: "data:image/jpeg;base64,YQ==" }),
      now: () => new Date("2026-09-23T00:00:00.000Z"),
      online: () => true,
    })
    await queue.enqueue({ id: "future-photo", kind: "photo", table: "collection_photo", bucket: "collection-photos", path: "future.jpg", mimeType: "image/jpeg" })
    db.jobs.get("future-photo")!.next_attempt_at = "2030-01-01T00:00:00.000Z"
    activate(queue)
    await vi.waitFor(() => expect(upload).toHaveBeenCalledOnce())
    expect(db.jobs.get("future-photo")?.status).toBe("uploaded")
  })

  it("recovers after credentials return and uploads with the recovered token", async () => {
    const db = setup()
    let time = new Date("2026-09-23T00:00:00.000Z")
    const acquire = vi.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValue({ accessToken: "recovered-token" })
    const upload = vi.fn().mockResolvedValue(undefined)
    const queue = new LocalAttachmentQueue({
      database: db,
      credentials: { acquire, confirm: vi.fn() },
      upload,
      getImage: vi.fn().mockResolvedValue({ image: "data:image/jpeg;base64,YQ==" }),
      now: () => time,
      online: () => true,
    })
    await queue.enqueue({ id: "a", kind: "photo", table: "collection_photo", bucket: "collection-photos", path: "a.jpg", mimeType: "image/jpeg" })
    activate(queue)
    queue.wake()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(db.jobs.get("a")).toMatchObject({ status: "pending", attempt_count: 1 })
    time = new Date(time.getTime() + 1_001)
    queue.wake()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(upload).toHaveBeenCalledWith(expect.objectContaining({ credentials: { accessToken: "recovered-token" } }))
    expect(db.jobs.get("a")).toMatchObject({ status: "uploaded" })
  })

  it("does not mark an in-flight upload complete after the queue is stopped", async () => {
    const db = setup()
    let finishUpload!: () => void
    const upload = vi.fn(() => new Promise<void>((resolve) => { finishUpload = resolve }))
    const queue = new LocalAttachmentQueue({
      database: db,
      credentials: { acquire: vi.fn().mockResolvedValue({ accessToken: "old-user-token" }), confirm: vi.fn() },
      upload,
      getImage: vi.fn().mockResolvedValue({ image: "data:image/jpeg;base64,YQ==" }),
      online: () => true,
    })
    await queue.enqueue({ id: "stopped-photo", kind: "photo", table: "collection_photo", bucket: "collection-photos", path: "stopped.jpg", mimeType: "image/jpeg" })
    activate(queue)
    await vi.waitFor(() => expect(upload).toHaveBeenCalledOnce())
    queue.stop()
    finishUpload()
    await vi.waitFor(() => expect(db.jobs.get("stopped-photo")).toMatchObject({ status: "pending" }))
    expect(db.statements.some(({ sql }) => sql.includes("UPDATE collection_photo SET uploaded_at"))).toBe(false)
  })

  it("requeues a preserved media failure and hides its notice in one local transaction", async () => {
    const db = setup()
    db.jobs.set("failed-photo", {
      id: "failed-photo", kind: "photo", operation: "upload", table_name: "collection_photo",
      bucket: "collection-photos", path: "test/path.jpg", mime_type: "image/jpeg", status: "failed",
      attempt_count: 1,
    })
    const queue = new LocalAttachmentQueue({
      database: db,
      credentials: { acquire: vi.fn().mockResolvedValue(null), confirm: vi.fn() },
      upload: vi.fn(),
      getImage: vi.fn(),
      online: () => false,
    })

    await queue.retry("failed-photo")

    expect(db.writeTransaction).toHaveBeenCalledTimes(1)
    expect(db.statements.slice(-2).map(({ sql }) => sql)).toEqual([
      expect.stringContaining("UPDATE media_upload_jobs SET status = CASE"),
      "DELETE FROM media_upload_failures WHERE id = ?",
    ])
    expect(db.statements[db.statements.length - 1]?.parameters).toEqual(["failed-photo"])
  })

  it("reconciles legacy photo/audio caches idempotently after an interrupted scan", async () => {
    const db = setup()
    db.migrations.clear()
    const rows = [
      { id: "audio-1", url: "legacy/audio.m4a", mime_type: "audio/mp4", uploaded_at: null, table_name: "collection_audio", created_by: "current-user" },
      { id: "photo-failed", url: "legacy/failed.jpg", mime_type: null, uploaded_at: "2026-01-01T00:00:00.000Z", table_name: "collection_photo", created_by: "current-user" },
      { id: "photo-already-queued", url: "legacy/queued.jpg", mime_type: null, uploaded_at: null, table_name: "collection_photo", created_by: "current-user" },
      { id: "teammate-photo", url: "remote.jpg", mime_type: null, uploaded_at: null, table_name: "collection_photo", created_by: "teammate" },
      { id: "teammate-audio", url: "remote.m4a", mime_type: "audio/mp4", uploaded_at: null, table_name: "collection_audio", created_by: "teammate" },
      { id: "not-cached", url: "remote.jpg", mime_type: null, uploaded_at: null, table_name: "collection_photo", created_by: "current-user" },
    ]
    rows.forEach((row) => db.metadataRows.set(row.id, row))
    db.jobs.set("photo-already-queued", {
      id: "photo-already-queued",
      operation: "upload",
      status: "pending",
    })
    db.getAll.mockImplementation(async (sql = "", parameters: unknown[] = []) => {
      if (sql.includes("media_migrations")) {
        return [...db.migrations].map((id) => ({ id }))
      }
      if (sql.includes("UNION ALL")) return rows.filter((row) =>
        row.table_name.endsWith("_audio") && row.uploaded_at === null,
      )
      if (sql.includes("SELECT id FROM media_upload_jobs WHERE id = ?")) {
        const id = String(parameters[0])
        return db.jobs.has(id) ? [{ id }] : []
      }
      return [...db.jobs.values()]
    })
    db.setFailingInsertId("audio-1")
    const queue = new LocalAttachmentQueue({
      database: db,
      credentials: { acquire: vi.fn().mockResolvedValue({ accessToken: "token" }), confirm: vi.fn() },
      upload: vi.fn(),
      getImage: vi.fn(),
      getAudio: vi.fn(),
      getAllImages: vi.fn().mockResolvedValue([]),
      getAllAudios: vi.fn().mockResolvedValue([{ id: "audio-1" }, { id: "teammate-audio" }]),
      objectExists: vi.fn().mockResolvedValue(false),
      online: () => false,
    })
    await expect(queue.reconcileLegacyMedia()).rejects.toThrow("interrupted")
    expect(db.migrations.size).toBe(0)
    await queue.reconcileLegacyMedia()
    await queue.reconcileLegacyMedia()
    expect([...db.jobs.keys()].sort()).toEqual([
      "audio-1",
      "teammate-audio",
      "photo-already-queued",
    ].sort())
    expect(db.jobs.has("teammate-photo")).toBe(false)
    const reconciliationQuery = db.getAll.mock.calls.find(([sql]) => sql.includes("UNION ALL"))
    expect(reconciliationQuery?.[0]).toContain("collection_photo")
    expect(reconciliationQuery?.[0]).not.toContain("parent.created_by")
    expect(db.statements.some(({ sql, parameters }) =>
      sql.includes("UPDATE collection_photo SET uploaded_at = NULL") &&
      parameters[0] === "photo-already-queued",
    )).toBe(false)
    expect(db.metadataRows.get("photo-failed")?.uploaded_at).toBe("2026-01-01T00:00:00.000Z")
    expect(db.metadataRows.get("teammate-photo")?.uploaded_at).toBeNull()
    expect(db.migrations.has("legacy-media-cache-v2")).toBe(true)
  })

  it("recovers a pre-queue photo with a legacy timestamp only when Storage confirms it is missing", async () => {
    const db = setup()
    db.migrations.clear()
    const oldTimestamp = "2026-01-01T00:00:00.000Z"
    const rows = [
      { id: "missing-photo", url: "org/collections/c/missing.jpg", mime_type: null, uploaded_at: oldTimestamp, table_name: "collection_photo" },
      { id: "teammate-photo", url: "org/collections/c/exists.jpg", mime_type: null, uploaded_at: oldTimestamp, table_name: "collection_photo" },
    ]
    rows.forEach((row) => db.metadataRows.set(row.id, { ...row }))
    db.getAll.mockImplementation(async (sql: string, params: unknown[] = []) => {
      if (sql.includes("media_migrations")) return [...db.migrations].map((id) => ({ id }))
      if (sql.includes("UNION ALL")) return rows
      if (sql.includes("SELECT id FROM media_upload_jobs WHERE id = ?")) return db.jobs.has(String(params[0])) ? [{ id: params[0] }] : []
      return [...db.jobs.values()]
    })
    const objectExists = vi.fn(async (_bucket: string, path: string) => path.endsWith("exists.jpg"))
    const queue = new LocalAttachmentQueue({
      database: db,
      credentials: { acquire: vi.fn().mockResolvedValue({ accessToken: "token" }), confirm: vi.fn() },
      getAllImages: vi.fn().mockResolvedValue([{ id: "missing-photo" }, { id: "teammate-photo" }]),
      getAllAudios: vi.fn().mockResolvedValue([]),
      objectExists,
      online: () => false,
    } as never)
    await queue.reconcileLegacyMedia()
    expect(objectExists).toHaveBeenCalledTimes(2)
    expect(db.jobs.has("missing-photo")).toBe(true)
    expect(db.jobs.has("teammate-photo")).toBe(false)
    expect(db.metadataRows.get("missing-photo")?.uploaded_at).toBe(oldTimestamp)
    expect(db.migrations.has("legacy-media-cache-v2")).toBe(true)
    expect(db.statements.some(({ sql }) => sql.includes("SET uploaded_at = NULL"))).toBe(false)
  })

  it("does not enqueue legacy work after its account's queue is stopped", async () => {
    const db = setup()
    db.migrations.clear()
    db.getAll.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM media_migrations")) return []
      if (sql.includes("UNION ALL")) return [{ id: "old-photo", url: "old.jpg", mime_type: null, uploaded_at: "2025-01-01T00:00:00.000Z", table_name: "collection_photo" }]
      return []
    })
    let finishLookup!: (value: boolean) => void
    const objectExists = vi.fn(() => new Promise<boolean>((resolve) => { finishLookup = resolve }))
    const queue = new LocalAttachmentQueue({
      database: db,
      credentials: { acquire: vi.fn().mockResolvedValue({ accessToken: "old-user-token" }), confirm: vi.fn() },
      getAllImages: vi.fn().mockResolvedValue([{ id: "old-photo" }]),
      getAllAudios: vi.fn().mockResolvedValue([]),
      objectExists,
      online: () => true,
    } as never)
    activate(queue)
    await vi.waitFor(() => expect(objectExists).toHaveBeenCalledOnce())
    queue.stop()
    finishLookup(false)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(db.jobs.has("old-photo")).toBe(false)
  })

  it("retries a durable remote deletion independently of uploads", async () => {
    const db = setup()
    const deleteRemote = vi.fn().mockResolvedValue(undefined)
    const queue = new LocalAttachmentQueue({
      database: db,
      credentials: { acquire: vi.fn().mockResolvedValue({ accessToken: "live-token" }), confirm: vi.fn() },
      deleteRemote,
      upload: vi.fn(),
      online: () => true,
    })
    await queue.enqueueDelete({
      id: "deleted-photo",
      kind: "photo",
      table: "collection_photo",
      bucket: "collection-photos",
      path: "a.jpg",
      mimeType: "image/jpeg",
    })
    activate(queue)
    queue.wake()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(deleteRemote).not.toHaveBeenCalled()
    expect(db.jobs.get("deleted-photo")).toMatchObject({ status: "waiting_for_row_delete" })
    await confirmMediaRowDelete("collection_photo", "deleted-photo", db)
    queue.wake()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(deleteRemote).toHaveBeenCalledWith("live-token", "collection-photos", "a.jpg")
    expect(db.jobs.get("deleted-photo")).toMatchObject({ operation: "delete", status: "complete" })
    expect(db.statements.some(({ sql }) => sql.includes("ON CONFLICT"))).toBe(false)
    expect(db.statements.some(({ sql }) => sql.includes("UPDATE media_upload_jobs SET operation = 'delete'"))).toBe(true)
  })

  it("executes delete upsert statements against a SQLite view with INSTEAD OF triggers", async (context) => {
    if (spawnSync("sqlite3", ["--version"], { encoding: "utf8" }).error) {
      context.skip()
      return
    }
    const db = setup()
    const queue = new LocalAttachmentQueue({ database: db, online: () => false })
    await queue.enqueueDelete({
      id: "media-1", kind: "photo", table: "collection_photo", bucket: "collection-photos",
      path: "org/collections/c/photo.jpg", mimeType: "image/jpeg",
    })
    const update = db.statements.find(({ sql }) => sql.includes("UPDATE media_upload_jobs SET operation = 'delete'"))!
    const insert = db.statements.find(({ sql }) => sql.includes("INSERT OR IGNORE INTO media_upload_jobs"))!
    const bind = (sql: string, values: unknown[]) => {
      let index = 0
      return sql.replace(/\?/g, () => {
        const value = values[index++]
        return typeof value === "string" ? `'${value.replace(/'/g, "''")}'` : String(value)
      })
    }
    const script = `
      CREATE TABLE local_jobs (id TEXT PRIMARY KEY, kind TEXT, operation TEXT, table_name TEXT,
        bucket TEXT, path TEXT, mime_type TEXT, status TEXT, attempt_count INTEGER,
        next_attempt_at TEXT, created_at TEXT);
      INSERT INTO local_jobs VALUES ('media-1','photo','upload','collection_photo','collection-photos',
        'org/collections/c/photo.jpg','image/jpeg','pending',3,'old','created');
      CREATE VIEW media_upload_jobs AS SELECT * FROM local_jobs;
      CREATE TRIGGER media_jobs_update INSTEAD OF UPDATE ON media_upload_jobs BEGIN
        UPDATE local_jobs SET operation=NEW.operation, table_name=NEW.table_name, bucket=NEW.bucket,
          path=NEW.path, mime_type=NEW.mime_type, status=NEW.status, attempt_count=NEW.attempt_count,
          next_attempt_at=NEW.next_attempt_at WHERE id=OLD.id;
      END;
      CREATE TRIGGER media_jobs_insert INSTEAD OF INSERT ON media_upload_jobs BEGIN
        INSERT OR IGNORE INTO local_jobs VALUES (NEW.id, NEW.kind, NEW.operation, NEW.table_name,
          NEW.bucket, NEW.path, NEW.mime_type, NEW.status, NEW.attempt_count, NEW.next_attempt_at, NEW.created_at);
      END;
      ${bind(update.sql, update.parameters)};
      ${bind(insert.sql, insert.parameters)};
      SELECT operation || '|' || status || '|' || attempt_count || '|' || path FROM local_jobs WHERE id='media-1';
    `
    const actual = spawnSync("sqlite3", [":memory:"], { input: script, encoding: "utf8" })
    expect(actual.status, actual.stderr).toBe(0)
    expect(actual.stdout.trim()).toBe("delete|waiting_for_row_delete|0|org/collections/c/photo.jpg")
  })

  it("does not process a job when another tab wins the conditional claim", async () => {
    const db = setup()
    const upload = vi.fn()
    const executeNormally = db.execute.getMockImplementation()
    db.execute.mockImplementation(async (sql, parameters = []) => {
      if (sql.includes("SET status = 'uploading'")) return { rowsAffected: 0 }
      return executeNormally!(sql, parameters)
    })
    const queue = new LocalAttachmentQueue({
      database: db,
      credentials: { acquire: vi.fn().mockResolvedValue({ accessToken: "token" }), confirm: vi.fn() },
      upload,
      getImage: vi.fn().mockResolvedValue({ image: "data:image/jpeg;base64,YQ==" }),
      online: () => true,
    })
    await queue.enqueue({ id: "claimed-elsewhere", kind: "photo", table: "collection_photo", bucket: "collection-photos", path: "a.jpg", mimeType: "image/jpeg" })
    activate(queue)
    queue.wake()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(upload).not.toHaveBeenCalled()
    expect(db.jobs.get("claimed-elsewhere")?.status).toBe("pending")
  })

  it("recognizes a successful localOnly view claim when SQLite reports zero changed rows", async () => {
    const db = setup()
    const upload = vi.fn().mockResolvedValue(undefined)
    const executeNormally = db.execute.getMockImplementation()
    db.execute.mockImplementation(async (sql, parameters = []) => {
      const result = await executeNormally!(sql, parameters)
      if (sql.includes("SET status = 'uploading'")) return { rowsAffected: 0 }
      return result ?? { rowsAffected: 0 }
    })
    const queue = new LocalAttachmentQueue({
      database: db,
      credentials: { acquire: vi.fn().mockResolvedValue({ accessToken: "token" }), confirm: vi.fn() },
      upload,
      getImage: vi.fn().mockResolvedValue({ image: "data:image/jpeg;base64,YQ==" }),
      online: () => true,
    })
    await queue.enqueue({ id: "view-claim", kind: "photo", table: "collection_photo", bucket: "collection-photos", path: "a.jpg", mimeType: "image/jpeg" })
    activate(queue)
    queue.wake()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(upload).toHaveBeenCalledTimes(1)
    expect(db.jobs.get("view-claim")?.status).toBe("uploaded")
  })
})
