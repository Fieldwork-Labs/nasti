import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/powersync/db", () => ({ powerSyncDb: {} }))
vi.mock("@/lib/persistFiles", () => ({ getImage: vi.fn(), getAllImages: vi.fn() }))
vi.mock("@/lib/persistAudio", () => ({ getAudio: vi.fn(), getAllAudios: vi.fn() }))
vi.mock("../auth/liveSession", () => ({
  liveUploadCredentials: { acquire: vi.fn(), confirm: vi.fn() },
}))
vi.mock("../storageUpload", () => ({ uploadToStorage: vi.fn() }))

import { LocalAttachmentQueue, validateMediaUploadIds } from "../attachments"

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
    if (sql.includes("INSERT OR IGNORE INTO media_upload_jobs")) {
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
        status: "deleting",
        attempt_count: 0,
        next_attempt_at: next,
        created_at: created,
      })
    } else if (sql.includes("SET status = 'uploading'")) {
      const job = jobs.get(String(parameters[0]))
      if (job?.status === "pending" || job?.status === "deleting") job.status = "uploading"
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
      if (job) job.status = "failed"
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
  })
  const migrations = new Set<string>()
  const getAll = vi.fn(async (sql = "", parameters: unknown[] = []) => {
    if (sql.includes("SELECT id FROM media_upload_jobs WHERE id = ?")) {
      const id = String(parameters[0])
      return jobs.has(id) ? [{ id }] : []
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
  beforeEach(() => vi.clearAllMocks())

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
    queue.wake()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(db.jobs.get("a")).toMatchObject({ status: "pending", attempt_count: 1 })
    expect(db.statements.some(({ sql }) => sql.includes("media_upload_failures"))).toBe(false)
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
    queue.wake()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(upload).toHaveBeenCalledTimes(2)
    expect(db.jobs.get("a")).toMatchObject({ status: "failed" })
    expect(db.jobs.get("b")).toMatchObject({ status: "uploaded" })
    const failureSql = db.statements.find(({ sql }) => sql.includes("INSERT OR REPLACE INTO media_upload_failures"))
    expect(failureSql?.parameters).toContain("Storage rejected the file as too large")
    expect(JSON.stringify(db.statements)).not.toContain("secret-token")
    expect(db.statements.some(({ sql }) => sql.includes("UPDATE collection_photo SET uploaded_at = NULL"))).toBe(true)
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
    queue.wake()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(db.jobs.get("a")).toMatchObject({ status: "pending", attempt_count: 1 })
    time = new Date(time.getTime() + 1_001)
    queue.wake()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(upload).toHaveBeenCalledWith(expect.objectContaining({ credentials: { accessToken: "recovered-token" } }))
    expect(db.jobs.get("a")).toMatchObject({ status: "uploaded" })
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
    const rows = [
      { id: "photo-1", url: "legacy/photo.jpg", mime_type: null, uploaded_at: null, table_name: "collection_photo" },
      { id: "audio-1", url: "legacy/audio.m4a", mime_type: "audio/mp4", uploaded_at: null, table_name: "collection_audio" },
      { id: "photo-failed", url: "legacy/failed.jpg", mime_type: null, uploaded_at: "2026-01-01T00:00:00.000Z", table_name: "collection_photo" },
      { id: "photo-already-queued", url: "legacy/queued.jpg", mime_type: null, uploaded_at: "2026-01-01T00:00:00.000Z", table_name: "collection_photo" },
      { id: "not-cached", url: "remote.jpg", mime_type: null, uploaded_at: null, table_name: "collection_photo" },
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
      if (sql.includes("UNION ALL")) return rows
      if (sql.includes("SELECT id FROM media_upload_jobs WHERE id = ?")) {
        const id = String(parameters[0])
        return db.jobs.has(id) ? [{ id }] : []
      }
      return [...db.jobs.values()]
    })
    db.setFailingInsertId("audio-1")
    const queue = new LocalAttachmentQueue({
      database: db,
      credentials: { acquire: vi.fn(), confirm: vi.fn() },
      upload: vi.fn(),
      getImage: vi.fn(),
      getAudio: vi.fn(),
      getAllImages: vi.fn().mockResolvedValue([
        { id: "photo-1" },
        { id: "photo-failed" },
        { id: "photo-already-queued" },
      ]),
      getAllAudios: vi.fn().mockResolvedValue([{ id: "audio-1" }]),
      online: () => false,
    })
    await expect(queue.reconcileLegacyMedia()).rejects.toThrow("interrupted")
    expect(db.migrations.size).toBe(0)
    await queue.reconcileLegacyMedia()
    await queue.reconcileLegacyMedia()
    expect([...db.jobs.keys()].sort()).toEqual([
      "audio-1",
      "photo-1",
      "photo-already-queued",
      "photo-failed",
    ].sort())
    expect(db.statements.some(({ sql, parameters }) =>
      sql.includes("UPDATE collection_photo SET uploaded_at = NULL") &&
      parameters[0] === "photo-failed",
    )).toBe(true)
    expect(db.statements.some(({ sql, parameters }) =>
      sql.includes("UPDATE collection_photo SET uploaded_at = NULL") &&
      parameters[0] === "photo-already-queued",
    )).toBe(false)
    expect(db.metadataRows.get("photo-failed")?.uploaded_at).toBeNull()
    expect(db.metadataRows.get("photo-already-queued")?.uploaded_at).toBe("2026-01-01T00:00:00.000Z")
    expect(db.migrations.has("legacy-media-cache-v1")).toBe(true)
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
    queue.wake()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(deleteRemote).toHaveBeenCalledWith("live-token", "collection-photos", "a.jpg")
    expect(db.jobs.get("deleted-photo")).toMatchObject({ operation: "delete", status: "complete" })
  })
})
