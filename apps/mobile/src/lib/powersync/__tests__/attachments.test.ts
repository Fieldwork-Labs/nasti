import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/powersync/db", () => ({ powerSyncDb: {} }))
vi.mock("@/lib/persistFiles", () => ({ getImage: vi.fn() }))
vi.mock("@/lib/persistAudio", () => ({ getAudio: vi.fn() }))
vi.mock("../auth/liveSession", () => ({
  liveUploadCredentials: { acquire: vi.fn(), confirm: vi.fn() },
}))
vi.mock("../storageUpload", () => ({ uploadToStorage: vi.fn() }))

import { LocalAttachmentQueue } from "../attachments"

const setup = () => {
  const jobs = new Map<string, Record<string, unknown>>()
  const statements: { sql: string; parameters: unknown[] }[] = []
  const execute = vi.fn(async (sql: string, parameters: unknown[] = []) => {
    statements.push({ sql, parameters })
    if (sql.includes("INSERT OR IGNORE INTO media_upload_jobs")) {
      const [id, kind, table, bucket, path, mimeType, next, created] = parameters
      if (!jobs.has(String(id))) {
        jobs.set(String(id), {
          id,
          kind,
          table_name: table,
          bucket,
          path,
          mime_type: mimeType,
          status: "queued",
          attempt_count: 0,
          next_attempt_at: next,
          created_at: created,
        })
      }
    } else if (sql.includes("SET status = 'sending'")) {
      const job = jobs.get(String(parameters[0]))
      if (job?.status === "queued") job.status = "sending"
    } else if (sql.includes("SET status = 'queued', attempt_count =")) {
      const job = jobs.get(String(parameters[2]))
      if (job) {
        job.status = "queued"
        job.attempt_count = parameters[0]
        job.next_attempt_at = parameters[1]
      }
    } else if (sql.includes("SET status = 'failed'")) {
      const job = jobs.get(String(parameters[0]))
      if (job) job.status = "failed"
    } else if (sql.includes("SET status = 'complete'")) {
      const job = jobs.get(String(parameters[0]))
      if (job) job.status = "complete"
    }
  })
  const getAll = vi.fn(async () => [...jobs.values()])
  return { jobs, statements, execute, getAll }
}

describe("LocalAttachmentQueue", () => {
  beforeEach(() => vi.clearAllMocks())

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
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(upload).not.toHaveBeenCalled()
    expect(db.jobs.get("a")).toMatchObject({ status: "queued", attempt_count: 1 })
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
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(db.jobs.get("a")).toMatchObject({ status: "queued", attempt_count: 1 })
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
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(upload).toHaveBeenCalledTimes(2)
    expect(db.jobs.get("a")).toMatchObject({ status: "failed" })
    expect(db.jobs.get("b")).toMatchObject({ status: "complete" })
    const failureSql = db.statements.find(({ sql }) => sql.includes("INSERT OR REPLACE INTO media_upload_failures"))
    expect(failureSql?.parameters).toContain("Storage rejected the file as too large")
    expect(JSON.stringify(db.statements)).not.toContain("secret-token")
    expect(db.statements.some(({ sql }) => sql.includes("UPDATE collection_photo SET uploaded_at = NULL"))).toBe(true)
  })
})
