import {
  type AbstractPowerSyncDatabase,
  type CrudTransaction,
  type PowerSyncBackendConnector,
  UpdateType,
} from "@powersync/web"
import { createNastiSupabaseClientForToken } from "@nasti/common/supabase"
import type { Database } from "@nasti/common/types/database"
import * as Sentry from "@sentry/react"
import {
  liveUploadCredentials,
  type RequestCredentials,
} from "../auth/liveSession"
import { setQueueAuthBlocked } from "./queueAuthState"

type TableName = keyof Database["public"]["Tables"]

const POWERSYNC_URL = import.meta.env.VITE_POWERSYNC_URL

const JSON_FIELDS: Record<string, string[]> = {
  trip: ["metadata"],
}

const ARRAY_FIELDS: Record<string, string[]> = {
  collection: ["person_ids", "material_type"],
  scouting_notes: ["person_ids"],
}

const BOOLEAN_FIELDS: Record<string, string[]> = {
  collection: ["species_uncertain", "specimen_collected"],
  scouting_notes: ["species_uncertain", "specimen_collected"],
}

const TABLE_UPLOAD_PRIORITY: Record<string, number> = {
  species: 0,
  trip: 0,
  collection: 1,
  scouting_notes: 1,
  collection_photo: 2,
  collection_audio: 2,
  scouting_notes_photos: 2,
  scouting_notes_audio: 2,
  species_photo: 2,
}

const DEPENDENCY_ERROR_CODES = new Set(["23503"])
const PERMANENT_ERROR_CODES = new Set(["23514"])
const MAX_NON_TRANSIENT_RETRIES = 3
const NON_TRANSIENT_RETRY_DELAY_MS = 2000
const DEPENDENCY_RETRY_STORAGE_PREFIX = "nasti-powersync-dependency-retries-v1:"
const dependencyRetryCounts = new Map<string, number>()

type TokenClient = ReturnType<typeof createNastiSupabaseClientForToken>
type TokenClientFactory = (accessToken: string) => TokenClient

function prepareForSupabase(
  table: string,
  data: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...data }

  for (const field of JSON_FIELDS[table] ?? []) {
    const value = result[field]
    if (typeof value === "string") {
      try {
        result[field] = JSON.parse(value)
      } catch {
        // Keep the value as-is if it was not JSON text.
      }
    }
  }

  for (const field of ARRAY_FIELDS[table] ?? []) {
    const value = result[field]
    if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value)
        result[field] = Array.isArray(parsed) ? parsed : []
      } catch {
        result[field] = []
      }
    }
  }

  for (const field of BOOLEAN_FIELDS[table] ?? []) {
    if (field in result && result[field] !== null) {
      result[field] = Boolean(result[field])
    }
  }

  return result
}

function ensureOnline(): void {
  if (!navigator.onLine) throw new Error("Device is offline")
}

function errorField(error: unknown, field: string): string | null {
  if (error && typeof error === "object" && field in error) {
    const value = (error as Record<string, unknown>)[field]
    return typeof value === "string" ? value : null
  }
  return null
}

function classifyPgCode(code: string | undefined): string {
  if (!code) return "internal"
  if (code.startsWith("23") || code.startsWith("42")) return "validation"
  return "internal"
}

async function safeComplete(transaction: CrudTransaction): Promise<boolean> {
  try {
    await transaction.complete()
    return true
  } catch {
    recordDiagnostic(transaction, null, "completion_failed", 0)
    return false
  }
}

async function saveFailedTransaction(
  database: AbstractPowerSyncDatabase,
  transaction: CrudTransaction,
  error: unknown,
  retryCount = 0,
): Promise<void> {
  const pgCode = errorField(error, "code")
  const errorInfo = JSON.stringify({
    code: pgCode,
  })
  const failedAt = new Date().toISOString()

  await database.writeTransaction(async (writeTransaction) => {
    for (const op of transaction.crud) {
      const failureId = `sync-failure:${encodeURIComponent(JSON.stringify([op.table, op.id, op.op]))}`
      await writeTransaction.execute(
        `INSERT OR IGNORE INTO sync_failures (id, target_table, entity_id, op_type, op_data, error_info, failed_at, classification, retry_count)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          failureId,
          op.table,
          op.id,
          op.op,
          JSON.stringify(op.opData ?? {}),
          errorInfo,
          failedAt,
          classifyPgCode(pgCode ?? undefined),
          retryCount,
        ],
      )
    }
  })
}

function transactionKey(transaction: CrudTransaction): string {
  const operations = transaction.crud
    .map(({ table, id, op }) => [table, id, op])
    .sort(([aTable, aId, aOp], [bTable, bId, bOp]) =>
      JSON.stringify([aTable, aId, aOp]).localeCompare(
        JSON.stringify([bTable, bId, bOp]),
      ),
    )
  return `${DEPENDENCY_RETRY_STORAGE_PREFIX}${encodeURIComponent(JSON.stringify(operations))}`
}

function getDependencyRetryCount(key: string): number {
  const inMemoryCount = dependencyRetryCounts.get(key) ?? 0
  try {
    const value = Number.parseInt(localStorage.getItem(key) ?? "0", 10)
    return Math.max(inMemoryCount, Number.isFinite(value) && value > 0 ? value : 0)
  } catch {
    return inMemoryCount
  }
}

function setDependencyRetryCount(key: string, count: number): void {
  dependencyRetryCounts.set(key, count)
  try {
    localStorage.setItem(key, String(count))
  } catch {
    // Keep retries bounded in this runtime when browser storage is unavailable.
  }
}

function clearDependencyRetryCount(key: string): void {
  dependencyRetryCounts.delete(key)
  try {
    localStorage.removeItem(key)
  } catch {
    // Clearing the in-memory count is sufficient when browser storage is unavailable.
  }
}

function recordDiagnostic(
  transaction: CrudTransaction,
  error: unknown,
  disposition: string,
  retryCount: number,
): void {
  const summary = transaction.crud.map(({ table, op }) => `${table}:${op}`)
  const pgCode = errorField(error, "code")
  Sentry.captureMessage("PowerSync row upload disposition", {
    level: disposition.startsWith("retry") ? "warning" : "error",
    extra: {
      operationCount: transaction.crud.length,
      operations: summary,
      pgCode,
      disposition,
      retryCount,
      appVersion: typeof __BUILD_ID__ === "string" ? __BUILD_ID__ : "unknown",
    },
  })
}

function getPowerSyncEndpoint(): string {
  const endpoint = POWERSYNC_URL?.trim().replace(/\/+$/, "")

  if (!endpoint) {
    throw new Error("VITE_POWERSYNC_URL is not configured")
  }

  return endpoint
}

export class SupabaseConnector implements PowerSyncBackendConnector {
  private tokenClient: TokenClient | undefined
  private tokenClientAccessToken: string | undefined

  constructor(
    private readonly tokenClientFactory: TokenClientFactory =
      createNastiSupabaseClientForToken,
  ) {}

  private clientFor(credentials: RequestCredentials): TokenClient {
    if (this.tokenClientAccessToken !== credentials.accessToken) {
      this.tokenClient = this.tokenClientFactory(credentials.accessToken)
      this.tokenClientAccessToken = credentials.accessToken
    }
    return this.tokenClient!
  }

  async fetchCredentials() {
    const credentials = await liveUploadCredentials.acquire()
    if (!credentials) {
      setQueueAuthBlocked("rows", true)
      throw new Error("Not authenticated - cannot connect to PowerSync")
    }
    setQueueAuthBlocked("rows", false)

    return {
      endpoint: getPowerSyncEndpoint(),
      token: credentials.accessToken,
    }
  }

  async uploadData(database: AbstractPowerSyncDatabase): Promise<void> {
    const transaction = await database.getNextCrudTransaction()
    if (!transaction) {
      setQueueAuthBlocked("rows", false)
      return
    }

    ensureOnline()
    const key = transactionKey(transaction)
    const credentials = await liveUploadCredentials.acquire()
    if (!credentials) {
      setQueueAuthBlocked("rows", true)
      recordDiagnostic(transaction, null, "retry_no_credentials", 0)
      throw new Error("Upload credentials unavailable")
    }
    setQueueAuthBlocked("rows", false)
    const client = this.clientFor(credentials)

    try {
      const sortedOps = [...transaction.crud].sort(
        (a, b) =>
          (TABLE_UPLOAD_PRIORITY[a.table] ?? 10) -
          (TABLE_UPLOAD_PRIORITY[b.table] ?? 10),
      )

      for (const op of sortedOps) {
        const table = op.table as TableName
        const id = op.id

        switch (op.op) {
          case UpdateType.PUT: {
            const data = prepareForSupabase(op.table, op.opData ?? {})
            const { error } = await client
              .from(table)
              .upsert({ id, ...data } as never)
            if (error) throw error
            break
          }
          case UpdateType.PATCH: {
            const data = prepareForSupabase(op.table, op.opData ?? {})
            const { error } = await client
              .from(table)
              .update(data as never)
              .eq("id" as never, id)
            if (error) throw error
            break
          }
          case UpdateType.DELETE: {
            const { error } = await client
              .from(table)
              .delete()
              .eq("id" as never, id)
            if (error) throw error
            break
          }
        }
      }

      await transaction.complete()
      setQueueAuthBlocked("rows", false)
      clearDependencyRetryCount(key)
    } catch (error) {
      const pgCode = errorField(error, "code")

      if (pgCode === "42501") {
        const confirmed = await liveUploadCredentials.confirm(credentials)
        if (!confirmed) {
          setQueueAuthBlocked("rows", true)
          recordDiagnostic(transaction, error, "retry_unconfirmed_rls_denial", 0)
          throw new Error("RLS denial could not be confirmed")
        }
        setQueueAuthBlocked("rows", false)
        recordDiagnostic(transaction, error, "preserved_confirmed_rls_denial", 0)
        await saveFailedTransaction(database, transaction, error)
        if (await safeComplete(transaction)) clearDependencyRetryCount(key)
        return
      }

      if (pgCode && PERMANENT_ERROR_CODES.has(pgCode)) {
        setQueueAuthBlocked("rows", false)
        recordDiagnostic(transaction, error, "preserved_validation_error", 0)
        await saveFailedTransaction(database, transaction, error)
        if (await safeComplete(transaction)) clearDependencyRetryCount(key)
        return
      }

      if (pgCode && DEPENDENCY_ERROR_CODES.has(pgCode)) {
        setQueueAuthBlocked("rows", false)
        const count = getDependencyRetryCount(key) + 1
        setDependencyRetryCount(key, count)
        recordDiagnostic(transaction, error, "retry_dependency", count)

        if (count > MAX_NON_TRANSIENT_RETRIES) {
          recordDiagnostic(transaction, error, "preserved_dependency_error", count)
          await saveFailedTransaction(database, transaction, error, count)
          if (await safeComplete(transaction)) clearDependencyRetryCount(key)
          return
        }

        await new Promise((resolve) =>
          setTimeout(resolve, NON_TRANSIENT_RETRY_DELAY_MS),
        )
        return
      }

      setQueueAuthBlocked("rows", false)
      recordDiagnostic(transaction, error, "retry", 0)
      throw error
    }
  }
}
