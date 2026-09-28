import { liveUploadCredentials } from "../auth/liveSession"
import { getAllAudios, getAudio } from "../persistAudio"
import { getAllImages, getImage } from "../persistFiles"
import { deleteFromStorage, storageObjectExists, uploadToStorage } from "../storageUpload"
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
  status: "pending" | "uploading" | "uploaded" | "failed" | "waiting_for_row_delete" | "deleting" | "complete"
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
  getAllImages: typeof getAllImages
  getAllAudios: typeof getAllAudios
  objectExists: typeof storageObjectExists
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
const DEFAULT_RETRY_MS = 1_000
const MAX_RETRY_MS = 5 * 60_000
const LOOP_INTERVAL_MS = 5_000
const JOB_LEASE_MS = 5 * 60_000
const JOB_LEASE_RENEW_MS = 60_000
const LEGACY_MIGRATION_RETRY_MS = 60_000
const FINISHED_JOB_RETENTION_MS = 30 * 24 * 60 * 60_000
const LEGACY_MIGRATION_ID = "legacy-media-cache-v2"
const LEGACY_JOB_PREFIX = `${LEGACY_MIGRATION_ID}:`

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
  private running = false
  private runGeneration = 0
  private migrationRunning = false
  private migrationCompleted = false
  private nextMigrationAttemptAt = 0
  private dependencies: QueueDependencies

  constructor(overrides: Partial<QueueDependencies> = {}) {
    this.dependencies = {
      database: powerSyncDb,
      credentials: liveUploadCredentials,
      upload: uploadToStorage,
      getImage,
      getAudio,
      getAllImages,
      getAllAudios,
      objectExists: storageObjectExists,
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
        `UPDATE media_upload_jobs SET operation = 'delete', status = 'waiting_for_row_delete',
         attempt_count = 0, next_attempt_at = ?, table_name = ?, bucket = ?, path = ?, mime_type = ?
         WHERE id = ?`,
        [now, job.table, job.bucket, job.path, job.mimeType, job.id],
      )
      await target.execute(
        `INSERT OR IGNORE INTO media_upload_jobs
         (id, kind, operation, table_name, bucket, path, mime_type, status, attempt_count, next_attempt_at, created_at)
         VALUES (?, ?, 'delete', ?, ?, ?, ?, 'waiting_for_row_delete', 0, ?, ?)`,
        [job.id, job.kind, job.table, job.bucket, job.path, job.mimeType, now, now],
      )
    }
    if (transaction) await upsert(transaction)
    else await this.dependencies.database.writeTransaction(upsert)
  }

  wake(): void {
    this.scheduleLegacyMigration()
    void this.pump()
  }

  start(): void {
    if (!this.running) this.runGeneration += 1
    this.running = true
    if (this.timer) return
    this.timer = setInterval(() => {
      this.scheduleLegacyMigration()
      void this.pump()
    }, LOOP_INTERVAL_MS)
    if (typeof window !== "undefined") {
      window.addEventListener("online", this.handleOnline)
    }
    void this.recoverSendingJobs()
      .then(() => this.pump())
      .catch(() => console.error("[Media queue] Startup recovery could not finish"))
    void this.pruneFinishedJobs().catch(() => undefined)
    this.scheduleLegacyMigration()
  }

  stop(): void {
    if (this.running) this.runGeneration += 1
    this.running = false
    if (this.timer) clearInterval(this.timer)
    this.timer = undefined
    if (typeof window !== "undefined") {
      window.removeEventListener("online", this.handleOnline)
    }
    setQueueAuthBlocked("media", false)
  }

  private handleOnline = () => {
    this.scheduleLegacyMigration()
    void this.pump()
  }

  private scheduleLegacyMigration(): void {
    if (!this.running || !this.dependencies.online() || this.migrationRunning || this.migrationCompleted) return
    if (this.dependencies.now().getTime() < this.nextMigrationAttemptAt) return
    this.nextMigrationAttemptAt = this.dependencies.now().getTime() + LEGACY_MIGRATION_RETRY_MS
    this.migrationRunning = true
    const runGeneration = this.runGeneration
    void this.reconcileLegacyMedia(runGeneration)
      .then(() => this.pump())
      .catch(() => undefined)
      .finally(() => { this.migrationRunning = false })
  }

  private async recoverSendingJobs(): Promise<void> {
    const now = this.dependencies.now()
    const implausiblyFuture = new Date(now.getTime() + JOB_LEASE_MS + 60_000).toISOString()
    await this.dependencies.database.execute(
      `UPDATE media_upload_jobs SET status = CASE WHEN operation = 'delete' THEN 'deleting' ELSE 'pending' END,
       next_attempt_at = ? WHERE status = 'uploading' AND (next_attempt_at IS NULL OR next_attempt_at <= ? OR next_attempt_at > ?)`,
      [now.toISOString(), now.toISOString(), implausiblyFuture],
    )
  }

  private async pruneFinishedJobs(): Promise<void> {
    const cutoff = new Date(this.dependencies.now().getTime() - FINISHED_JOB_RETENTION_MS).toISOString()
    await this.dependencies.database.execute(
      "DELETE FROM media_upload_jobs WHERE status IN ('uploaded', 'complete') AND created_at < ?",
      [cutoff],
    )
  }

  async reconcileLegacyMedia(runGeneration?: number): Promise<void> {
    const assertCurrentRun = () => {
      if (runGeneration !== undefined && (!this.running || this.runGeneration !== runGeneration)) {
        throw new Error("Media queue was paused")
      }
    }
    assertCurrentRun()
    const completed = await this.dependencies.database.getAll(
      "SELECT id FROM media_migrations WHERE id = ?",
      [LEGACY_MIGRATION_ID],
    )
    if (completed.length) {
      this.migrationCompleted = true
      return
    }
    const credentials = await this.dependencies.credentials.acquire()
    assertCurrentRun()
    if (!credentials) return
    const [images, audios] = await Promise.all([
      this.dependencies.getAllImages(),
      this.dependencies.getAllAudios(),
    ])
    const cachedIds = new Set([...images.map(({ id }) => id), ...audios.map(({ id }) => id)])
    const union = TABLES.map((table) => {
      const mimeColumn = isAudioTable(table) ? "media.mime_type" : "NULL"
      return `SELECT media.id, media.url, ${mimeColumn} AS mime_type, media.uploaded_at,
        '${table}' AS table_name FROM ${table} media`
    }).join(" UNION ALL ")
    const rows = (await this.dependencies.database.getAll(union)) as Array<
      MediaSourceRow & { table_name: string }
    >
    for (const row of rows) {
      assertCurrentRun()
      if (!TABLES.some((table) => table === row.table_name)) continue
      if (!row.url || !cachedIds.has(row.id)) continue
      const job = {
        id: row.id,
        kind: isAudioTable(row.table_name) ? "audio" as const : "photo" as const,
        table: row.table_name,
        bucket: isAudioTable(row.table_name) ? "collection-audio" : "collection-photos",
        path: row.url,
        mimeType: row.mime_type ?? (isAudioTable(row.table_name) ? "audio/mpeg" : "image/jpeg"),
      }
      const existing = await this.dependencies.database.getAll(
        "SELECT id FROM media_upload_jobs WHERE id = ?",
        [row.id],
      )
      if (existing.length) continue
      if (await this.dependencies.objectExists(job.bucket, job.path, credentials)) continue
      assertCurrentRun()
      await this.dependencies.database.writeTransaction(async (transaction) => {
        assertCurrentRun()
        const existing = await transaction.getAll(
          "SELECT id FROM media_upload_jobs WHERE id = ?",
          [row.id],
        )
        if (existing.length) return
        await transaction.execute(
          "INSERT OR IGNORE INTO media_migrations (id, completed_at) VALUES (?, ?)",
          [`${LEGACY_JOB_PREFIX}${row.id}`, this.dependencies.now().toISOString()],
        )
        await this.enqueue(job, transaction)
      })
    }
    assertCurrentRun()
    await this.dependencies.database.execute(
      "INSERT OR REPLACE INTO media_migrations (id, completed_at) VALUES (?, ?)",
      [LEGACY_MIGRATION_ID, this.dependencies.now().toISOString()],
    )
    this.migrationCompleted = true
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
    const runGeneration = this.runGeneration
    try {
      await this.recoverSendingJobs()
      const attempted = new Set<string>()
      while (this.running && this.runGeneration === runGeneration) {
        const now = this.dependencies.now().toISOString()
        const implausiblyFuture = new Date(this.dependencies.now().getTime() + MAX_RETRY_MS + 60_000).toISOString()
        const jobs = (await this.dependencies.database.getAll(
          `SELECT * FROM media_upload_jobs
          WHERE status IN ('pending', 'deleting') AND (next_attempt_at IS NULL OR next_attempt_at <= ? OR next_attempt_at > ?)
           ORDER BY created_at ASC`,
          [now, implausiblyFuture],
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
             AND (next_attempt_at IS NULL OR next_attempt_at <= ? OR next_attempt_at > ?)`,
            [leaseUntil, job.id, now, implausiblyFuture],
          )
          // INSTEAD OF triggers on PowerSync localOnly views may report zero
          // affected rows even when their backing local row changed.
          const [claimed] = (await this.dependencies.database.getAll(
            "SELECT status, next_attempt_at FROM media_upload_jobs WHERE id = ?",
            [job.id],
          )) as Array<{ status: string; next_attempt_at: string | null }>
          if (claimed?.status !== "uploading" || claimed.next_attempt_at !== leaseUntil) continue
          await this.process(job, runGeneration)
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

  private async process(job: MediaUploadJob, runGeneration: number): Promise<void> {
    const assertCurrentRun = () => {
      if (!this.running || this.runGeneration !== runGeneration) {
        throw new Error("Media queue was paused")
      }
    }
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
      assertCurrentRun()
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
        assertCurrentRun()
        await this.dependencies.deleteRemote(credentials.accessToken, job.bucket, job.path)
        assertCurrentRun()
        if (!(await ownsLease())) return
        await this.dependencies.database.execute(
          "UPDATE media_upload_jobs SET status = 'complete', next_attempt_at = NULL WHERE id = ? AND status = 'uploading' AND next_attempt_at = ?",
          [job.id, activeLease],
        )
        return
      }
      const legacyMarker = await this.dependencies.database.getAll(
        "SELECT id FROM media_migrations WHERE id = ?",
        [`${LEGACY_JOB_PREFIX}${job.id}`],
      )
      const legacyJob = legacyMarker.length > 0
      if (legacyJob && await this.dependencies.objectExists(job.bucket, job.path, credentials)) {
        assertCurrentRun()
        if (!(await ownsLease())) return
        await this.dependencies.database.execute(
          "UPDATE media_upload_jobs SET status = 'uploaded', next_attempt_at = NULL WHERE id = ? AND operation = 'upload' AND status = 'uploading' AND next_attempt_at = ?",
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
      assertCurrentRun()
      const file = new File([bytes], job.path.split("/").pop() ?? job.id, {
        type: job.mime_type,
        // tus fingerprints include lastModified. Keep it stable across retries.
        lastModified: Number.isFinite(Date.parse(job.created_at)) ? Date.parse(job.created_at) : 0,
      })
      try {
        await this.dependencies.upload({
          bucket: job.bucket,
          path: job.path,
          file,
          mimeType: job.mime_type,
          credentials,
          upsert: !legacyJob,
        })
        assertCurrentRun()
      } catch (error) {
        // Another device may create the missing object between HEAD and POST.
        // A non-upsert migration then sees 409 and can safely converge.
        const status = (error as Partial<SanitizedUploadError>).statusCode
        if (!legacyJob || status !== 409 ||
          !await this.dependencies.objectExists(job.bucket, job.path, credentials)) throw error
      }
      if (!(await ownsLease())) return
      assertCurrentRun()
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
      const attempt = job.attempt_count + 1
      const repeatedClientError =
        [400, 401, 403].includes(uploadError.statusCode ?? -1) && attempt >= 10
      const missingLocalBytes =
        uploadError.safeMessage === "Local media bytes unavailable" && attempt >= 3
      if (uploadError.retryable === false || repeatedClientError || missingLocalBytes) {
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
            missingLocalBytes
              ? "Local media bytes unavailable. Restore the file and retry."
              : repeatedClientError
                ? "Storage repeatedly rejected the upload. Sign in again or retry."
                : uploadError.safeMessage ?? "Storage rejected the upload",
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

/** Release a Storage delete only after the matching server row is confirmed absent. */
export async function confirmMediaRowDelete(
  table: string,
  id: string,
  database: QueueDatabase = powerSyncDb,
): Promise<void> {
  if (!TABLES.some((candidate) => candidate === table)) return
  await database.execute(
    `UPDATE media_upload_jobs SET status = 'deleting', next_attempt_at = ?
     WHERE id = ? AND table_name = ? AND operation = 'delete' AND status = 'waiting_for_row_delete'`,
    [new Date().toISOString(), id, table],
  )
  mediaAttachmentQueue.wake()
}
