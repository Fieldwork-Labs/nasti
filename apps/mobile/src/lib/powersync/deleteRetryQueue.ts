import * as Sentry from "@sentry/react"
import { liveUploadCredentials } from "../auth/liveSession"
import { powerSyncDb } from "./db"

const DELETE_TABLES = new Set([
  "trip", "trip_member", "species", "trip_species", "collection",
  "collection_photo", "collection_audio", "scouting_notes",
  "scouting_notes_photos", "scouting_notes_audio", "species_photo", "person",
])
const RETRY_BASE_MS = 2_000
const RETRY_MAX_MS = 5 * 60_000
const POLL_MS = 5_000
const LEASE_MS = 5 * 60_000
const LEASE_HEARTBEAT_MS = 30_000

type Database = {
  execute(sql: string, parameters?: unknown[]): Promise<unknown>
  getAll(sql: string, parameters?: unknown[]): Promise<unknown[]>
  writeTransaction(callback: (transaction: Pick<Database, "execute" | "getAll">) => Promise<void>): Promise<void>
}

export type RowDeleteRetryJob = {
  id: string
  target_table: string
  entity_id: string
  status: "pending" | "sending" | "failed"
  attempt_count: number
  next_attempt_at: string
  created_at: string
  last_error: string | null
  notice_dismissed?: number | null
  lease_expires_at?: string | null
}

export type DeleteTransport = (url: string, init: RequestInit) => Promise<Response>

function safeError(status: number | null): string {
  if (status === 401 || status === 403) return "Authentication was not accepted; retrying when credentials are available."
  if (status !== null) return `Server rejected this delete (${status}).`
  return "The delete could not reach the server; it will be retried."
}

function retryDelay(attempt: number): number {
  return Math.min(RETRY_BASE_MS * 2 ** Math.max(0, attempt - 1), RETRY_MAX_MS)
}

function emit(job: RowDeleteRetryJob, disposition: string, status: number | null): void {
  Sentry.captureMessage("Row delete retry disposition", {
    level: disposition === "success" ? "info" : "warning",
    extra: {
      operationId: job.id,
      table: job.target_table,
      disposition,
      safeServerCode: status === null ? null : String(status),
      retryCount: job.attempt_count,
      queueAgeMs: Math.max(0, Date.now() - Date.parse(job.created_at)),
      appVersion: typeof __BUILD_ID__ === "string" ? __BUILD_ID__ : "unknown",
    },
  })
}

function endpointFor(table: string, id: string): string {
  if (!DELETE_TABLES.has(table)) throw new Error("Unsupported delete table")
  const base = import.meta.env.VITE_SUPABASE_URL?.trim().replace(/\/+$/, "")
  if (!base) throw new Error("Supabase endpoint is not configured")
  const url = new URL(`${base}/rest/v1/${table}`)
  url.searchParams.set("id", `eq.${id}`)
  return url.toString()
}

export async function deleteRowWithToken(
  table: string,
  id: string,
  accessToken: string,
  transport: DeleteTransport = fetch,
  signal?: AbortSignal,
): Promise<number | null> {
  const response = await transport(endpointFor(table, id), {
    method: "DELETE",
    signal,
    headers: {
      apikey: import.meta.env.VITE_SB_PUBLISHABLE_KEY,
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  })
  if (response.ok || response.status === 404) return response.status
  throw Object.assign(new Error(safeError(response.status)), { status: response.status })
}

export class RowDeleteRetryQueue {
  private timer: ReturnType<typeof setInterval> | undefined
  private pumping = false
  private running = false
  private activeRequest: AbortController | undefined
  private lifecycleGeneration = 0
  private leaseTimer: ReturnType<typeof setInterval> | undefined
  private activeJobId: string | undefined

  constructor(
    private readonly database: Database = powerSyncDb,
    private readonly transport: DeleteTransport = fetch,
    private readonly credentials = liveUploadCredentials,
    private readonly online = () => typeof navigator === "undefined" || navigator.onLine,
    private readonly now = () => new Date(),
  ) {}

  async enqueue(failure: { id: string; target_table: string; entity_id: string }, transaction?: Pick<Database, "execute" | "getAll">): Promise<void> {
    if (!DELETE_TABLES.has(failure.target_table)) throw new Error("Unsupported delete table")
    const now = this.now().toISOString()
    await (transaction ?? this.database).execute(
      `INSERT OR IGNORE INTO row_delete_retry_jobs
       (id, target_table, entity_id, status, attempt_count, next_attempt_at, created_at, last_error, notice_dismissed, lease_expires_at)
       VALUES (?, ?, ?, 'pending', 0, ?, ?, NULL, 0, NULL)`,
      [failure.id, failure.target_table, failure.entity_id, now, now],
    )
    await (transaction ?? this.database).execute(
      `UPDATE row_delete_retry_jobs SET status = 'pending', next_attempt_at = ?, last_error = NULL,
         notice_dismissed = 0, lease_expires_at = NULL
       WHERE id = ? AND status = 'failed'`,
      [now, failure.id],
    )
  }

  start(): void {
    if (this.running) return
    this.running = true
    this.timer = setInterval(() => void this.pump(), POLL_MS)
    if (typeof window !== "undefined") window.addEventListener("online", this.handleOnline)
    void this.recoverInFlight().then(() => this.pump()).catch(() => undefined)
  }

  stop(): void {
    this.running = false
    this.lifecycleGeneration += 1
    this.activeRequest?.abort()
    this.activeRequest = undefined
    if (this.leaseTimer) clearInterval(this.leaseTimer)
    this.leaseTimer = undefined
    this.activeJobId = undefined
    if (this.timer) clearInterval(this.timer)
    this.timer = undefined
    if (typeof window !== "undefined") window.removeEventListener("online", this.handleOnline)
  }

  wake(): void { if (this.running) void this.pump() }

  async recoverInFlight(): Promise<void> {
    const now = this.now().toISOString()
    await this.database.execute(
      `UPDATE row_delete_retry_jobs SET status = 'pending', next_attempt_at = ?, lease_expires_at = NULL
       WHERE status = 'sending' AND (lease_expires_at IS NULL OR lease_expires_at <= ?)`,
      [now, now],
    )
  }

  async processNext(): Promise<boolean> {
    if (!this.online()) return false
    const generation = this.lifecycleGeneration
    const now = this.now().toISOString()
    const [candidate] = await this.database.getAll(
      `SELECT id, target_table, entity_id, status, attempt_count, next_attempt_at, created_at, last_error, notice_dismissed, lease_expires_at
       FROM row_delete_retry_jobs WHERE status = 'pending' AND next_attempt_at <= ?
       ORDER BY created_at ASC, id ASC LIMIT 1`, [now],
    ) as RowDeleteRetryJob[]
    if (!candidate) return false

    const credentials = await this.credentials.acquire().catch(() => null)
    if (generation !== this.lifecycleGeneration) return false
    if (!credentials) {
      await this.defer(candidate, null, "waiting_for_authentication")
      return true
    }

    let claimed = false
    await this.database.writeTransaction(async (tx) => {
      const [stillPending] = await tx.getAll(
        "SELECT id FROM row_delete_retry_jobs WHERE id = ? AND status = 'pending'", [candidate.id],
      )
      if (!stillPending) return
      const leaseExpiresAt = new Date(this.now().getTime() + LEASE_MS).toISOString()
      await tx.execute("UPDATE row_delete_retry_jobs SET status = 'sending', lease_expires_at = ? WHERE id = ?", [leaseExpiresAt, candidate.id])
      claimed = true
    })
    if (!claimed) return true
    if (generation !== this.lifecycleGeneration) return false

    const job = { ...candidate, status: "sending" as const, attempt_count: candidate.attempt_count + 1 }
    const controller = new AbortController()
    this.activeRequest = controller
    this.activeJobId = job.id
    this.leaseTimer = setInterval(() => void this.renewLease(job.id), LEASE_HEARTBEAT_MS)
    try {
      const status = await deleteRowWithToken(job.target_table, job.entity_id, credentials.accessToken, this.transport, controller.signal)
      await this.database.writeTransaction(async (tx) => {
        await tx.execute("DELETE FROM row_delete_retry_jobs WHERE id = ?", [job.id])
        await tx.execute("DELETE FROM sync_failures WHERE id = ?", [job.id])
      })
      emit(job, "success", status)
    } catch (error) {
      const status = error && typeof error === "object" && "status" in error && typeof error.status === "number" ? error.status : null
      const authWasConfirmed = (status === 401 || status === 403)
        ? await this.credentials.confirm(credentials).catch(() => false)
        : false
      const terminal = status !== null && status >= 400 && status < 500 && (status !== 401 && status !== 403 || authWasConfirmed) && status !== 408 && status !== 429
      const due = new Date(this.now().getTime() + retryDelay(job.attempt_count)).toISOString()
      const message = (status === 401 || status === 403) && authWasConfirmed
        ? `Server rejected this delete (${status}).`
        : safeError(status)
      await this.database.writeTransaction(async (tx) => {
        await tx.execute(
          `UPDATE row_delete_retry_jobs SET status = ?, attempt_count = ?, next_attempt_at = ?, last_error = ?,
           lease_expires_at = NULL, notice_dismissed = CASE WHEN ? = 'failed' THEN 0 ELSE notice_dismissed END
           WHERE id = ?`,
          [terminal ? "failed" : "pending", job.attempt_count, due, message, terminal ? "failed" : "pending", job.id],
        )
        await tx.execute(
          "UPDATE sync_failures SET retry_count = ?, error_info = ?, classification = ? WHERE id = ?",
          [job.attempt_count, JSON.stringify({ code: status === null ? null : String(status) }), terminal ? "retry_terminal" : "retry_transient", job.id],
        )
      })
      emit(job, terminal ? "terminal_failure" : "retry", status)
    } finally {
      if (this.activeRequest === controller) this.activeRequest = undefined
      if (this.activeJobId === job.id) this.activeJobId = undefined
      if (this.leaseTimer) clearInterval(this.leaseTimer)
      this.leaseTimer = undefined
    }
    return true
  }

  private async defer(job: RowDeleteRetryJob, status: number | null, disposition: string): Promise<void> {
    const attempt = job.attempt_count + 1
    const due = new Date(this.now().getTime() + retryDelay(attempt)).toISOString()
    await this.database.writeTransaction(async (tx) => {
      await tx.execute(
        "UPDATE row_delete_retry_jobs SET attempt_count = ?, next_attempt_at = ?, last_error = ? WHERE id = ?",
        [attempt, due, safeError(status), job.id],
      )
    })
    emit({ ...job, attempt_count: attempt }, disposition, status)
  }

  private async renewLease(jobId: string): Promise<void> {
    if (!this.running || this.activeJobId !== jobId) return
    const expiresAt = new Date(this.now().getTime() + LEASE_MS).toISOString()
    await this.database.execute(
      "UPDATE row_delete_retry_jobs SET lease_expires_at = ? WHERE id = ? AND status = 'sending'",
      [expiresAt, jobId],
    ).catch(() => undefined)
  }

  private async pump(): Promise<void> {
    if (!this.running || this.pumping || !this.online()) return
    this.pumping = true
    try {
      await this.recoverInFlight()
      // Bound each pass so the worker remains responsive to lifecycle changes.
      for (let count = 0; count < 20 && this.running; count += 1) {
        if (!await this.processNext()) break
      }
    } finally { this.pumping = false }
  }

  private handleOnline = () => this.wake()
}

export const rowDeleteRetryQueue = new RowDeleteRetryQueue()
