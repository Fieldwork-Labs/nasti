import * as Sentry from "@sentry/react"
import { getAudio } from "../persistAudio"
import { getImage } from "../persistFiles"
import { powerSyncDb } from "./db"
import { mediaAttachmentQueue, type MediaKind } from "./attachments"
import { rowDeleteRetryQueue } from "./deleteRetryQueue"

export type RowFailure = {
  id: string
  target_table: string
  entity_id: string
  op_type: "PUT" | "PATCH" | "DELETE"
  op_data: string
  error_info: string | null
  failed_at: string
  classification: string | null
  retry_count?: number | null
  delete_retry_status?: "pending" | "sending" | "failed" | null
  delete_retry_message?: string | null
}

export type MediaFailure = {
  id: string
  kind: MediaKind
  status_code: number | null
  safe_message: string
  failed_at: string
  app_version: string | null
}

export type SyncFailure =
  | (RowFailure & { failureKind: "row" })
  | (MediaFailure & { failureKind: "media" })

type RecoveryDatabase = {
  execute(sql: string, parameters?: unknown[]): Promise<unknown>
  getAll(sql: string, parameters?: unknown[]): Promise<unknown[]>
  writeTransaction(callback: (transaction: Pick<RecoveryDatabase, "execute" | "getAll">) => Promise<void>): Promise<void>
}

const rowColumns: Record<string, ReadonlySet<string>> = {
  trip: new Set(["created_at", "created_by", "end_date", "location_coordinate", "location_name", "metadata", "name", "organisation_id", "start_date"]),
  trip_member: new Set(["joined_at", "role", "trip_id", "user_id"]),
  species: new Set(["ala_guid", "created_at", "description", "indigenous_name", "name", "organisation_id"]),
  trip_species: new Set(["species_id", "trip_id"]),
  collection: new Set(["amount_quantity", "amount_units", "code", "collected_by", "collected_on", "created_at", "created_by", "description", "duration", "field_name", "location", "material_type", "organisation_id", "species_id", "species_uncertain", "specimen_collected", "trip_id", "phenology_start", "phenology_peak", "phenology_end", "person_ids"]),
  collection_photo: new Set(["caption", "collection_id", "uploaded_at", "url"]),
  collection_audio: new Set(["caption", "collection_id", "duration_ms", "mime_type", "uploaded_at", "url"]),
  scouting_notes: new Set(["created_at", "created_by", "description", "field_name", "location", "organisation_id", "species_id", "species_uncertain", "specimen_collected", "trip_id", "phenology_start", "phenology_peak", "phenology_end", "person_ids"]),
  scouting_notes_photos: new Set(["caption", "scouting_notes_id", "uploaded_at", "url"]),
  scouting_notes_audio: new Set(["caption", "scouting_notes_id", "duration_ms", "mime_type", "uploaded_at", "url"]),
  species_photo: new Set(["caption", "display_order", "organisation_id", "source_reference", "source_type", "species_id", "uploaded_at", "url"]),
  person: new Set(["created_at", "display_name", "email", "is_active", "job_role", "organisation_id", "personnel_id", "source_type", "updated_at", "user_id"]),
}

function parseOperationData(text: string): Record<string, unknown> {
  const value: unknown = JSON.parse(text)
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Stored operation data is invalid")
  }
  return value as Record<string, unknown>
}

function toSqlValue(value: unknown): unknown {
  if (value === undefined) return null
  if (typeof value === "boolean") return value ? 1 : 0
  if (value && typeof value === "object") return JSON.stringify(value)
  return value
}

function validateFailure(failure: RowFailure): { table: string; data: Record<string, unknown> } {
  const columns = rowColumns[failure.target_table]
  if (!columns) throw new Error("This item uses an unsupported table and cannot be retried")
  if (!["PUT", "PATCH", "DELETE"].includes(failure.op_type)) throw new Error("Stored operation type is invalid")
  const data = parseOperationData(failure.op_data)
  for (const key of Object.keys(data)) {
    if (key !== "id" && !columns.has(key)) throw new Error("Stored operation contains an unsupported field")
  }
  return { table: failure.target_table, data }
}

function emitRecoveryEvent(operation: "retry" | "dismiss", failure: SyncFailure, disposition: string, retryCount?: number): void {
  const common = {
    operation,
    failureKind: failure.failureKind,
    safeServerCode: failure.failureKind === "row" ? safeCode(failure.error_info) : failure.status_code,
    retryCount: retryCount ?? (failure.failureKind === "row" ? failure.retry_count ?? 0 : 0),
    queueAgeMs: Math.max(0, Date.now() - new Date(failure.failed_at).getTime()),
    appVersion: typeof __BUILD_ID__ === "string" ? __BUILD_ID__ : "unknown",
    disposition,
  }
  Sentry.captureMessage("Sync issue recovery", {
    level: disposition === "success" ? "info" : "warning",
    extra: failure.failureKind === "row"
      ? { ...common, table: failure.target_table, operationId: failure.id }
      : { ...common, kind: failure.kind, mediaId: failure.id },
  })
}

function safeCode(errorInfo: string | null): string | null {
  if (!errorInfo) return null
  try {
    const value: unknown = JSON.parse(errorInfo)
    if (!value || typeof value !== "object") return null
    const code = (value as Record<string, unknown>).code
    return typeof code === "string" && /^[0-9A-Z]{2,8}$/.test(code) ? code : null
  } catch {
    return null
  }
}

export async function listSyncFailures(db: RecoveryDatabase = powerSyncDb): Promise<SyncFailure[]> {
  const [rows, media, orphanedDeleteJobs] = await Promise.all([
    db.getAll(`SELECT sf.id, sf.target_table, sf.entity_id, sf.op_type, sf.op_data, sf.error_info, sf.failed_at, sf.classification, sf.retry_count,
      (SELECT status FROM row_delete_retry_jobs WHERE id = sf.id) AS delete_retry_status,
      (SELECT last_error FROM row_delete_retry_jobs WHERE id = sf.id) AS delete_retry_message
      FROM sync_failures sf ORDER BY sf.failed_at DESC`) as Promise<RowFailure[]>,
    db.getAll("SELECT id, kind, status_code, safe_message, failed_at, app_version FROM media_upload_failures ORDER BY failed_at DESC") as Promise<MediaFailure[]>,
    db.getAll(`SELECT j.id, j.target_table, j.entity_id, 'DELETE' AS op_type, '{}' AS op_data,
      '{}' AS error_info, j.created_at AS failed_at, 'retry_terminal' AS classification,
      j.attempt_count AS retry_count, 'failed' AS delete_retry_status,
      j.last_error AS delete_retry_message
      FROM row_delete_retry_jobs j
      WHERE j.status = 'failed' AND j.notice_dismissed = 0
        AND NOT EXISTS (SELECT 1 FROM sync_failures sf WHERE sf.id = j.id)`) as Promise<RowFailure[]>,
  ])
  return [
    ...rows.map((failure) => ({ ...failure, failureKind: "row" as const })),
    ...orphanedDeleteJobs.map((failure) => ({ ...failure, failureKind: "row" as const })),
    ...media.map((failure) => ({ ...failure, failureKind: "media" as const })),
  ].sort((a, b) => b.failed_at.localeCompare(a.failed_at))
}

export async function retrySyncFailure(failure: SyncFailure, dependencies: {
  database?: RecoveryDatabase
  queue?: Pick<typeof mediaAttachmentQueue, "retry">
  deleteQueue?: Pick<typeof rowDeleteRetryQueue, "enqueue" | "wake">
  getImage?: typeof getImage
  getAudio?: typeof getAudio
} = {}): Promise<void> {
  const key = `${failure.failureKind}:${failure.id}`
  const existing = retriesInFlight.get(key)
  if (existing) return existing
  const retryPromise = performRetrySyncFailure(failure, dependencies).finally(() => {
    retriesInFlight.delete(key)
  })
  retriesInFlight.set(key, retryPromise)
  return retryPromise
}

const retriesInFlight = new Map<string, Promise<void>>()

async function performRetrySyncFailure(failure: SyncFailure, dependencies: {
  database?: RecoveryDatabase
  queue?: Pick<typeof mediaAttachmentQueue, "retry">
  deleteQueue?: Pick<typeof rowDeleteRetryQueue, "enqueue" | "wake">
  getImage?: typeof getImage
  getAudio?: typeof getAudio
}): Promise<void> {
  const db = dependencies.database ?? powerSyncDb
  let retryAttemptCount = failure.failureKind === "row" ? failure.retry_count ?? 0 : 0
  try {
    if (failure.failureKind === "row") {
      const { table, data } = validateFailure(failure)
      const columns = rowColumns[table]
      let retried = false
      await db.writeTransaction(async (transaction) => {
        const savedFailure = await transaction.getAll(
          "SELECT id, retry_count FROM sync_failures WHERE id = ?",
          [failure.id],
        )
        if (!savedFailure.length) {
          if (failure.op_type !== "DELETE") return
          const [job] = await transaction.getAll(
            "SELECT id, attempt_count FROM row_delete_retry_jobs WHERE id = ? AND status = 'failed'",
            [failure.id],
          ) as Array<{ id: string; attempt_count: number }>
          if (!job) return
          retryAttemptCount = job.attempt_count + 1
          await (dependencies.deleteQueue ?? rowDeleteRetryQueue).enqueue(
            { id: failure.id, target_table: table, entity_id: failure.entity_id },
            transaction,
          )
          retried = true
          return
        }
        const persistedRetryCount = (savedFailure[0] as { retry_count?: number | null }).retry_count ?? 0
        retryAttemptCount = persistedRetryCount + 1
        if (failure.op_type === "DELETE") {
          await (dependencies.deleteQueue ?? rowDeleteRetryQueue).enqueue(
            { id: failure.id, target_table: table, entity_id: failure.entity_id },
            transaction,
          )
          retried = true
          return
        } else {
          const entries = Object.entries(data).filter(([key]) => key !== "id")
          if (entries.some(([key]) => !columns.has(key))) throw new Error("Stored operation contains an unsupported field")
          if (failure.op_type === "PUT") {
            const names = ["id", ...entries.map(([key]) => key)]
            const values = [failure.entity_id, ...entries.map(([, value]) => toSqlValue(value))]
            await transaction.execute(`INSERT OR REPLACE INTO ${table} (${names.join(", ")}) VALUES (${names.map(() => "?").join(", ")})`, values)
          } else {
            if (!entries.length) throw new Error("Stored update has no fields to retry")
            const existing = await transaction.getAll(`SELECT id FROM ${table} WHERE id = ?`, [failure.entity_id])
            if (!existing.length) throw new Error("The local row required for this update is unavailable")
            await transaction.execute(`UPDATE ${table} SET ${entries.map(([key]) => `${key} = ?`).join(", ")} WHERE id = ?`, [...entries.map(([, value]) => toSqlValue(value)), failure.entity_id])
          }
        }
        await transaction.execute("DELETE FROM sync_failures WHERE id = ?", [failure.id])
        retried = true
      })
      if (failure.op_type === "DELETE" && retried) (dependencies.deleteQueue ?? rowDeleteRetryQueue).wake()
      emitRecoveryEvent("retry", failure, failure.op_type === "DELETE" && retried ? "queued" : retried ? "success" : "already_retried", retried ? retryAttemptCount : Math.max(0, retryAttemptCount - 1))
      return
    } else {
      const [job] = (await db.getAll("SELECT id, kind, operation, table_name, bucket, path, mime_type, attempt_count FROM media_upload_jobs WHERE id = ?", [failure.id])) as Array<{ id: string; kind: MediaKind; operation: "upload" | "delete"; table_name: string; bucket: string; path: string; mime_type: string; attempt_count: number }>
      if (!job) throw new Error("Media upload job is unavailable")
      retryAttemptCount = job.attempt_count + 1
      if (job.operation === "upload") {
        const bytes = failure.kind === "photo"
          ? await (dependencies.getImage ?? getImage)(failure.id)
          : await (dependencies.getAudio ?? getAudio)(failure.id)
        if (!bytes) throw new Error("Preserved media bytes are unavailable")
      }
      const queue = dependencies.queue ?? mediaAttachmentQueue
      await queue.retry(job.id)
      emitRecoveryEvent("retry", failure, "success", retryAttemptCount)
      return
    }
  } catch (error) {
    emitRecoveryEvent("retry", failure, "failed", retryAttemptCount)
    throw error
  }
}

export async function dismissSyncFailure(failure: SyncFailure, db: RecoveryDatabase = powerSyncDb): Promise<void> {
  if (failure.failureKind === "row" && failure.op_type === "DELETE") {
    await db.writeTransaction(async (transaction) => {
      await transaction.execute("DELETE FROM sync_failures WHERE id = ?", [failure.id])
      await transaction.execute("UPDATE row_delete_retry_jobs SET notice_dismissed = 1 WHERE id = ?", [failure.id])
    })
  } else if (failure.failureKind === "row") {
    await db.execute("DELETE FROM sync_failures WHERE id = ?", [failure.id])
  } else {
    await db.execute("DELETE FROM media_upload_failures WHERE id = ?", [failure.id])
  }
  emitRecoveryEvent("dismiss", failure, "success")
}
