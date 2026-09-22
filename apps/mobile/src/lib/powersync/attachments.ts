import { liveUploadCredentials } from "../auth/liveSession"
import { getAudio } from "../persistAudio"
import { getImage } from "../persistFiles"
import { uploadToStorage, type SanitizedUploadError } from "../storageUpload"
import { powerSyncDb } from "./db"

export type MediaKind = "photo" | "audio"
export type MediaUploadJob = {
  id: string
  kind: MediaKind
  table_name: string
  bucket: string
  path: string
  mime_type: string
  status: "queued" | "sending" | "complete" | "failed" | "deleting"
  attempt_count: number
  next_attempt_at: string | null
  created_at: string
}

type MediaSourceRow = {
  id: string
  url: string | null
  mime_type?: string | null
  uploaded_at: string | null
}

type QueueDatabase = {
  execute(sql: string, parameters?: unknown[]): Promise<unknown>
  getAll(sql: string, parameters?: unknown[]): Promise<unknown[]>
}

type QueueDependencies = {
  database: QueueDatabase
  credentials: typeof liveUploadCredentials
  upload: typeof uploadToStorage
  getImage: typeof getImage
  getAudio: typeof getAudio
  now: () => Date
  online: () => boolean
}

const TABLES = [
  "collection_photo",
  "scouting_notes_photos",
  "collection_audio",
  "scouting_notes_audio",
] as const

const DEFAULT_RETRY_MS = 1_000
const MAX_RETRY_MS = 5 * 60_000
const LOOP_INTERVAL_MS = 5_000

function isAudioTable(table: string): boolean {
  return table.endsWith("_audio")
}

function dataUrlBlob(dataUrl: string, mimeType: string): Blob {
  const comma = dataUrl.indexOf(",")
  if (comma < 0) throw new Error("Stored photo bytes are invalid")
  const header = dataUrl.slice(0, comma)
  const payload = dataUrl.slice(comma + 1)
  const resolvedMime = /data:([^;]+);base64/i.exec(header)?.[1] ?? mimeType
  const binary = atob(payload)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return new Blob([bytes], { type: resolvedMime })
}

export class LocalAttachmentQueue {
  private timer: ReturnType<typeof setInterval> | undefined
  private pumping = false
  private dependencies: QueueDependencies

  constructor(overrides: Partial<QueueDependencies> = {}) {
    this.dependencies = {
      database: powerSyncDb,
      credentials: liveUploadCredentials,
      upload: uploadToStorage,
      getImage,
      getAudio,
      now: () => new Date(),
      online: () => typeof navigator === "undefined" || navigator.onLine,
      ...overrides,
    }
  }

  async enqueue(job: {
    id: string
    kind: MediaKind
    table: string
    bucket: string
    path: string
    mimeType: string
  }): Promise<void> {
    const now = this.dependencies.now().toISOString()
    await this.dependencies.database.execute(
      `INSERT OR IGNORE INTO media_upload_jobs
       (id, kind, table_name, bucket, path, mime_type, status, attempt_count, next_attempt_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'queued', 0, ?, ?)`,
      [job.id, job.kind, job.table, job.bucket, job.path, job.mimeType, now, now],
    )
    void this.pump()
  }

  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => void this.pump(), LOOP_INTERVAL_MS)
    if (typeof window !== "undefined") {
      window.addEventListener("online", this.handleOnline)
    }
    void this.recoverSendingJobs().then(() => this.reconcileMetadata()).then(() => this.pump())
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = undefined
    if (typeof window !== "undefined") {
      window.removeEventListener("online", this.handleOnline)
    }
  }

  private handleOnline = () => {
    void this.pump()
  }

  private async recoverSendingJobs(): Promise<void> {
    await this.dependencies.database.execute(
      "UPDATE media_upload_jobs SET status = 'queued', next_attempt_at = ? WHERE status = 'sending'",
      [this.dependencies.now().toISOString()],
    )
  }

  private async reconcileMetadata(): Promise<void> {
    const union = TABLES.map(
      (table) => `SELECT id, url, mime_type, uploaded_at, '${table}' AS table_name FROM ${table} WHERE uploaded_at IS NULL`,
    ).join(" UNION ALL ")
    const rows = (await this.dependencies.database.getAll(union)) as Array<
      MediaSourceRow & { table_name: string }
    >
    for (const row of rows) {
      if (!row.url) continue
      await this.enqueue({
        id: row.id,
        kind: isAudioTable(row.table_name) ? "audio" : "photo",
        table: row.table_name,
        bucket: isAudioTable(row.table_name) ? "collection-audio" : "collection-photos",
        path: row.url,
        mimeType: row.mime_type ?? (isAudioTable(row.table_name) ? "audio/mpeg" : "image/jpeg"),
      })
    }
  }

  async retry(id: string): Promise<void> {
    await this.dependencies.database.execute(
      "UPDATE media_upload_jobs SET status = 'queued', next_attempt_at = ? WHERE id = ? AND status = 'failed'",
      [this.dependencies.now().toISOString(), id],
    )
    await this.dependencies.database.execute(
      "DELETE FROM media_upload_failures WHERE id = ?",
      [id],
    )
    void this.pump()
  }

  private async pump(): Promise<void> {
    if (this.pumping || !this.dependencies.online()) return
    this.pumping = true
    try {
      const attempted = new Set<string>()
      while (true) {
        const now = this.dependencies.now().toISOString()
        const jobs = (await this.dependencies.database.getAll(
          `SELECT * FROM media_upload_jobs
           WHERE status = 'queued' AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
           ORDER BY created_at ASC`,
          [now],
        )) as MediaUploadJob[]
        // Refresh after each attempt. Jobs added during this pass are eligible,
        // while each retryable item is attempted only once per pass.
        const job = jobs.find(({ id }) => !attempted.has(id))
        if (!job) break
        attempted.add(job.id)
        await this.process(job)
      }
    } finally {
      this.pumping = false
    }
  }

  private async process(job: MediaUploadJob): Promise<void> {
    await this.dependencies.database.execute(
      "UPDATE media_upload_jobs SET status = 'sending' WHERE id = ? AND status = 'queued'",
      [job.id],
    )
    try {
      const credentials = await this.dependencies.credentials.acquire()
      if (!credentials) {
        throw Object.assign(new Error("Upload credentials unavailable"), {
          retryable: true,
          statusCode: null,
          safeMessage: "Upload credentials unavailable",
        })
      }
      let bytes: Blob | undefined
      if (job.kind === "photo") {
        const image = await this.dependencies.getImage(job.id)
        if (image) bytes = dataUrlBlob(image.image, "image/jpeg")
      } else {
        const audio = await this.dependencies.getAudio(job.id)
        if (audio) bytes = audio.blob
      }
      if (!bytes) {
        throw Object.assign(new Error("Local media bytes unavailable"), {
          retryable: true,
          statusCode: null,
          safeMessage: "Local media bytes unavailable",
        })
      }
      const file = new File([bytes], job.path.split("/").pop() ?? job.id, {
        type: job.mime_type,
      })
      await this.dependencies.upload({
        bucket: job.bucket,
        path: job.path,
        file,
        mimeType: job.mime_type,
        credentials,
      })
      const uploadedAt = this.dependencies.now().toISOString()
      await this.dependencies.database.execute(
        `UPDATE ${job.table_name} SET uploaded_at = ? WHERE id = ?`,
        [uploadedAt, job.id],
      )
      await this.dependencies.database.execute(
        "UPDATE media_upload_jobs SET status = 'complete', next_attempt_at = NULL WHERE id = ?",
        [job.id],
      )
    } catch (error) {
      const uploadError = error as Partial<SanitizedUploadError>
      if (uploadError.retryable === false) {
        const failedAt = this.dependencies.now().toISOString()
        await this.dependencies.database.execute(
          `INSERT OR REPLACE INTO media_upload_failures
           (id, kind, bucket, path, status_code, safe_message, failed_at, app_version)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            job.id,
            job.kind,
            job.bucket,
            job.path,
            uploadError.statusCode ?? null,
            uploadError.safeMessage ?? "Storage rejected the upload",
            failedAt,
            typeof __BUILD_ID__ === "string" ? __BUILD_ID__ : "unknown",
          ],
        )
        await this.dependencies.database.execute(
          "UPDATE media_upload_jobs SET status = 'failed', attempt_count = attempt_count + 1 WHERE id = ?",
          [job.id],
        )
        await this.dependencies.database.execute(
          `UPDATE ${job.table_name} SET uploaded_at = NULL WHERE id = ?`,
          [job.id],
        )
        return
      }
      const attempt = job.attempt_count + 1
      const delay = Math.min(DEFAULT_RETRY_MS * 2 ** Math.min(attempt - 1, 8), MAX_RETRY_MS)
      const nextAttemptAt = new Date(
        this.dependencies.now().getTime() + delay,
      ).toISOString()
      await this.dependencies.database.execute(
        `UPDATE media_upload_jobs
         SET status = 'queued', attempt_count = ?, next_attempt_at = ? WHERE id = ?`,
        [attempt, nextAttemptAt, job.id],
      )
    }
  }
}

export const mediaAttachmentQueue = new LocalAttachmentQueue()
