import { liveUploadCredentials } from "../auth/liveSession"
import { getAllAudios, getAudio } from "../persistAudio"
import { getImage } from "../persistFiles"
import { deleteFromStorage, uploadToStorage } from "../storageUpload"
import { setQueueAuthBlocked } from "./queueAuthState"
import type { SanitizedUploadError } from "./attachmentErrors"
import { powerSyncDb } from "./db"

export type MediaKind = "photo" | "audio"
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function validateMediaUploadIds(
  mediaId: string,
  entityId: string,
  organisationId?: string,
): void {
  if (!UUID_PATTERN.test(mediaId)) throw new Error("Invalid media ID")
  if (!UUID_PATTERN.test(entityId)) throw new Error("Invalid parent ID")
  if (!organisationId || !UUID_PATTERN.test(organisationId)) {
    throw new Error("Invalid organisation ID")
  }
}

export type MediaUploadJob = {
  id: string
  kind: MediaKind
  operation: "upload" | "delete"
  table_name: string
  bucket: string
  path: string
  mime_type: string
  status: "pending" | "uploading" | "uploaded" | "failed" | "deleting" | "complete"
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
  writeTransaction(callback: (transaction: QueueTransaction) => Promise<void>): Promise<void>
}

type QueueTransaction = {
  execute(sql: string, parameters?: unknown[]): Promise<unknown>
  getAll(sql: string, parameters?: unknown[]): Promise<unknown[]>
}

type QueueDependencies = {
  database: QueueDatabase
  credentials: typeof liveUploadCredentials
  upload: typeof uploadToStorage
  getImage: typeof getImage
  getAudio: typeof getAudio
  getAllAudios: typeof getAllAudios
  deleteRemote: (accessToken: string, bucket: string, path: string) => Promise<void>
  now: () => Date
  online: () => boolean
}

const TABLES = [
  "collection_photo",
  "scouting_notes_photos",
  "collection_audio",
  "scouting_notes_audio",
] as const
// The photo cache also receives synced downloads, so its entries cannot prove
// which user created the media. The audio cache is written only on capture.
const RECONCILABLE_LEGACY_TABLES = ["collection_audio", "scouting_notes_audio"] as const

const DEFAULT_RETRY_MS = 1_000
const MAX_RETRY_MS = 5 * 60_000
const LOOP_INTERVAL_MS = 5_000
const JOB_LEASE_MS = 5 * 60_000
const JOB_LEASE_RENEW_MS = 60_000

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
  private readonly leaseOwner = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
  private timer: ReturnType<typeof setInterval> | undefined
  private pumping = false
  private rerunRequested = false
  private running = true
  private dependencies: QueueDependencies

  constructor(overrides: Partial<QueueDependencies> = {}) {
    this.dependencies = {
      database: powerSyncDb,
      credentials: liveUploadCredentials,
      upload: uploadToStorage,
      getImage,
      getAudio,
      getAllAudios,
      deleteRemote: (accessToken, bucket, path) =>
        deleteFromStorage(bucket, path, { accessToken }),
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
  }, transaction?: QueueTransaction): Promise<void> {
    const now = this.dependencies.now().toISOString()
    await (transaction ?? this.dependencies.database).execute(
      `INSERT OR IGNORE INTO media_upload_jobs
       (id, kind, operation, table_name, bucket, path, mime_type, status, attempt_count, next_attempt_at, created_at)
       VALUES (?, ?, 'upload', ?, ?, ?, ?, 'pending', 0, ?, ?)`,
      [job.id, job.kind, job.table, job.bucket, job.path, job.mimeType, now, now],
    )
  }

  async enqueueDelete(
    job: { id: string; kind: MediaKind; table: string; bucket: string; path: string; mimeType: string },
    transaction?: QueueTransaction,
  ): Promise<void> {
    const now = this.dependencies.now().toISOString()
    const upsert = async (target: QueueTransaction) => {
      // PowerSync exposes localOnly tables as views, which reject SQLite UPSERT.
      await target.execute(
        `UPDATE media_upload_jobs SET operation = 'delete', status = 'deleting',
         attempt_count = 0, next_attempt_at = ?, table_name = ?, bucket = ?, path = ?, mime_type = ?
         WHERE id = ?`,
        [now, job.table, job.bucket, job.path, job.mimeType, job.id],
      )
      await target.execute(
        `INSERT OR IGNORE INTO media_upload_jobs
         (id, kind, operation, table_name, bucket, path, mime_type, status, attempt_count, next_attempt_at, created_at)
         VALUES (?, ?, 'delete', ?, ?, ?, ?, 'deleting', 0, ?, ?)`,
        [job.id, job.kind, job.table, job.bucket, job.path, job.mimeType, now, now],
      )
    }
    if (transaction) await upsert(transaction)
    else await this.dependencies.database.writeTransaction(upsert)
  }

  wake(): void {
    void this.pump()
  }

  start(): void {
    this.running = true
    if (this.timer) return
    this.timer = setInterval(() => void this.pump(), LOOP_INTERVAL_MS)
    if (typeof window !== "undefined") {
      window.addEventListener("online", this.handleOnline)
    }
    void this.recoverSendingJobs()
      .then(() => this.reconcileLegacyMedia())
      .then(() => this.pump())
      .catch(() => console.error("[Media queue] Startup recovery could not finish"))
  }

  stop(): void {
    this.running = false
    if (this.timer) clearInterval(this.timer)
    this.timer = undefined
    if (typeof window !== "undefined") {
      window.removeEventListener("online", this.handleOnline)
    }
    setQueueAuthBlocked("media", false)
  }

  private handleOnline = () => {
    void this.pump()
  }

  private async recoverSendingJobs(): Promise<void> {
    await this.dependencies.database.execute(
      `UPDATE media_upload_jobs SET status = CASE WHEN operation = 'delete' THEN 'deleting' ELSE 'pending' END,
       next_attempt_at = ? WHERE status = 'uploading' AND (next_attempt_at IS NULL OR next_attempt_at <= ?)`,
      [this.dependencies.now().toISOString(), this.dependencies.now().toISOString()],
    )
  }

  async reconcileLegacyMedia(): Promise<void> {
    const migrationVersion = "legacy-media-cache-v1"
    const completed = await this.dependencies.database.getAll(
      "SELECT id FROM media_migrations WHERE id = ?",
      [migrationVersion],
    )
    if (completed.length) return
    const audios = await this.dependencies.getAllAudios()
    const cachedIds = new Set(audios.map(({ id }) => id))
    const union = RECONCILABLE_LEGACY_TABLES.map((table) => {
      return `SELECT media.id, media.url, media.mime_type, media.uploaded_at,
        '${table}' AS table_name FROM ${table} media WHERE media.uploaded_at IS NULL`
    }).join(" UNION ALL ")
    const rows = (await this.dependencies.database.getAll(union)) as Array<
      MediaSourceRow & { table_name: string }
    >
    for (const row of rows) {
      if (!TABLES.some((table) => table === row.table_name)) continue
      if (!row.url || row.uploaded_at !== null || !cachedIds.has(row.id)) continue
      const job = {
        id: row.id,
        kind: isAudioTable(row.table_name) ? "audio" as const : "photo" as const,
        table: row.table_name,
        bucket: isAudioTable(row.table_name) ? "collection-audio" : "collection-photos",
        path: row.url,
        mimeType: row.mime_type ?? (isAudioTable(row.table_name) ? "audio/mpeg" : "image/jpeg"),
      }
      await this.dependencies.database.writeTransaction(async (transaction) => {
        const existing = await transaction.getAll(
          "SELECT id FROM media_upload_jobs WHERE id = ?",
          [row.id],
        )
        if (existing.length) return
        await transaction.execute(
          `UPDATE ${row.table_name} SET uploaded_at = NULL WHERE id = ?`,
          [row.id],
        )
        await this.enqueue(job, transaction)
      })
    }
    await this.dependencies.database.execute(
      "INSERT OR REPLACE INTO media_migrations (id, completed_at) VALUES (?, ?)",
      [migrationVersion, this.dependencies.now().toISOString()],
    )
  }

  async retry(id: string): Promise<void> {
    await this.dependencies.database.writeTransaction(async (transaction) => {
      await transaction.execute(
        `UPDATE media_upload_jobs SET status = CASE WHEN operation = 'delete' THEN 'deleting' ELSE 'pending' END,
         next_attempt_at = ? WHERE id = ? AND status = 'failed'`,
        [this.dependencies.now().toISOString(), id],
      )
      await transaction.execute(
        "DELETE FROM media_upload_failures WHERE id = ?",
        [id],
      )
    })
    void this.pump()
  }

  private async pump(): Promise<void> {
    if (!this.running || !this.dependencies.online()) return
    if (this.pumping) {
      this.rerunRequested = true
      return
    }
    this.pumping = true
    try {
      await this.recoverSendingJobs()
      const attempted = new Set<string>()
      while (this.running) {
        const now = this.dependencies.now().toISOString()
        const jobs = (await this.dependencies.database.getAll(
          `SELECT * FROM media_upload_jobs
          WHERE status IN ('pending', 'deleting') AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
           ORDER BY created_at ASC`,
          [now],
        )) as MediaUploadJob[]
        // Refresh after each attempt. Jobs added during this pass are eligible,
        // while each retryable item is attempted only once per pass.
        const job = jobs.find(({ id }) => !attempted.has(id))
        if (!job) break
        attempted.add(job.id)
        try {
          const leaseUntil = `${new Date(this.dependencies.now().getTime() + JOB_LEASE_MS).toISOString()}~${this.leaseOwner}`
          await this.dependencies.database.execute(
            `UPDATE media_upload_jobs SET status = 'uploading', next_attempt_at = ?
             WHERE id = ? AND status IN ('pending', 'deleting')
             AND (next_attempt_at IS NULL OR next_attempt_at <= ?)`,
            [leaseUntil, job.id, now],
          )
          // INSTEAD OF triggers on PowerSync localOnly views may report zero
          // affected rows even when their backing local row changed.
          const [claimed] = (await this.dependencies.database.getAll(
            "SELECT status, next_attempt_at FROM media_upload_jobs WHERE id = ?",
            [job.id],
          )) as Array<{ status: string; next_attempt_at: string | null }>
          if (claimed?.status !== "uploading" || claimed.next_attempt_at !== leaseUntil) continue
          await this.process(job)
        } catch {
          // A local database write can also fail while recording an upload
          // result. Keep processing other items; startup recovery will reclaim
          // this uploading job if its retry update could not be persisted.
          try {
            const attempt = job.attempt_count + 1
            const nextAttemptAt = new Date(
              this.dependencies.now().getTime() + DEFAULT_RETRY_MS,
            ).toISOString()
            await this.dependencies.database.execute(
              `UPDATE media_upload_jobs SET status = ?, attempt_count = ?, next_attempt_at = ?
               WHERE id = ? AND status = 'uploading' AND next_attempt_at LIKE ?`,
              [job.operation === "delete" ? "deleting" : "pending", attempt, nextAttemptAt, job.id, `%~${this.leaseOwner}`],
            )
          } catch {
            // Preserve the original local state for restart recovery.
          }
        }
      }
    } finally {
      this.pumping = false
      if (this.rerunRequested) {
        this.rerunRequested = false
        void this.pump()
      }
    }
  }

  private async process(job: MediaUploadJob): Promise<void> {
    let activeLease = ""
    const current = (await this.dependencies.database.getAll(
      "SELECT next_attempt_at FROM media_upload_jobs WHERE id = ? AND status = 'uploading'",
      [job.id],
    )) as Array<{ next_attempt_at: string | null }>
    activeLease = current[0]?.next_attempt_at ?? ""
    const ownsLease = async () => {
      if (!activeLease) return false
      const [row] = (await this.dependencies.database.getAll(
        "SELECT status, next_attempt_at FROM media_upload_jobs WHERE id = ?",
        [job.id],
      )) as Array<{ status: string; next_attempt_at: string | null }>
      return row?.status === "uploading" && row.next_attempt_at === activeLease
    }
    let renewing = false
    const leaseTimer = setInterval(() => {
      if (renewing || !activeLease) return
      renewing = true
      void (async () => {
        const nextLease = `${new Date(this.dependencies.now().getTime() + JOB_LEASE_MS).toISOString()}~${this.leaseOwner}`
        await this.dependencies.database.execute(
          "UPDATE media_upload_jobs SET next_attempt_at = ? WHERE id = ? AND status = 'uploading' AND next_attempt_at = ?",
          [nextLease, job.id, activeLease],
        )
        const [renewed] = (await this.dependencies.database.getAll(
          "SELECT next_attempt_at FROM media_upload_jobs WHERE id = ? AND status = 'uploading'",
          [job.id],
        )) as Array<{ next_attempt_at: string | null }>
        if (renewed?.next_attempt_at === nextLease) activeLease = nextLease
      })().catch(() => undefined).finally(() => { renewing = false })
    }, JOB_LEASE_RENEW_MS)
    try {
      const credentials = await this.dependencies.credentials.acquire()
      if (!this.running) return
      if (!credentials) {
        setQueueAuthBlocked("media", true)
        throw Object.assign(new Error("Upload credentials unavailable"), {
          retryable: true,
          statusCode: null,
          safeMessage: "Upload credentials unavailable",
        })
      }
      setQueueAuthBlocked("media", false)
      if (job.operation === "delete") {
        await this.dependencies.deleteRemote(credentials.accessToken, job.bucket, job.path)
        if (!(await ownsLease())) return
        await this.dependencies.database.execute(
          "UPDATE media_upload_jobs SET status = 'complete', next_attempt_at = NULL WHERE id = ? AND status = 'uploading' AND next_attempt_at = ?",
          [job.id, activeLease],
        )
        return
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
      if (!(await ownsLease())) return
      const uploadedAt = this.dependencies.now().toISOString()
      await this.dependencies.database.execute(
        `UPDATE ${job.table_name} SET uploaded_at = ? WHERE id = ?`,
        [uploadedAt, job.id],
      )
      await this.dependencies.database.execute(
        "UPDATE media_upload_jobs SET status = 'uploaded', next_attempt_at = NULL WHERE id = ? AND operation = 'upload' AND status = 'uploading' AND next_attempt_at = ?",
        [job.id, activeLease],
      )
    } catch (error) {
      if (!(await ownsLease())) return
      const [currentJob] = (await this.dependencies.database.getAll(
        "SELECT operation FROM media_upload_jobs WHERE id = ?",
        [job.id],
      )) as Array<{ operation: "upload" | "delete" }>
      if (job.operation === "upload" && currentJob?.operation === "delete") return
      const uploadError = error as Partial<SanitizedUploadError>
      if (uploadError.retryable === false) {
        const failedAt = this.dependencies.now().toISOString()
        await this.dependencies.database.execute(
          `UPDATE ${job.table_name} SET uploaded_at = NULL WHERE id = ?`,
          [job.id],
        )
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
          "UPDATE media_upload_jobs SET status = 'failed', attempt_count = attempt_count + 1 WHERE id = ? AND status = 'uploading' AND next_attempt_at = ?",
          [job.id, activeLease],
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
         SET status = CASE WHEN operation = 'delete' THEN 'deleting' ELSE 'pending' END,
             attempt_count = ?, next_attempt_at = ? WHERE id = ? AND status = 'uploading' AND next_attempt_at = ?`,
        [attempt, nextAttemptAt, job.id, activeLease],
      )
    } finally {
      clearInterval(leaseTimer)
    }
  }
}

export const mediaAttachmentQueue = new LocalAttachmentQueue()
