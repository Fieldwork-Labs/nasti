import {
  type AbstractPowerSyncDatabase,
  type CrudTransaction,
  type PowerSyncBackendConnector,
  UpdateType,
} from "@powersync/web"
import { supabase } from "@nasti/common/supabase"
import type { Database } from "@nasti/common/types/database"
import * as Sentry from "@sentry/react"

type TableName = keyof Database["public"]["Tables"]

const POWERSYNC_URL = import.meta.env.VITE_POWERSYNC_URL

const JSON_FIELDS: Record<string, string[]> = {
  trip: ["metadata"],
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
  scouting_notes_photos: 2,
  species_photo: 2,
}

const DEPENDENCY_ERROR_CODES = new Set(["23503"])
const PERMANENT_ERROR_CODES = new Set(["23514", "42501"])
const MAX_NON_TRANSIENT_RETRIES = 3
const NON_TRANSIENT_RETRY_DELAY_MS = 2000

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

  for (const field of BOOLEAN_FIELDS[table] ?? []) {
    if (field in result && result[field] !== null) {
      result[field] = Boolean(result[field])
    }
  }

  return result
}

function waitForOnline(): Promise<void> {
  if (navigator.onLine) return Promise.resolve()
  return new Promise((resolve) => {
    window.addEventListener("online", () => resolve(), { once: true })
  })
}

function errorField(error: unknown, field: string): string | null {
  if (error && typeof error === "object" && field in error) {
    const value = (error as Record<string, unknown>)[field]
    return typeof value === "string" ? value : null
  }
  return null
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return errorField(error, "message") ?? String(error)
}

function classifyPgCode(code: string | undefined): string {
  if (!code) return "internal"
  if (code.startsWith("23") || code.startsWith("42")) return "validation"
  return "internal"
}

async function safeComplete(transaction: CrudTransaction): Promise<void> {
  try {
    await transaction.complete()
  } catch (error) {
    console.error("[PowerSync] transaction.complete() failed:", error)
    Sentry.captureException(error)
  }
}

async function saveFailedTransaction(
  database: AbstractPowerSyncDatabase,
  transaction: CrudTransaction,
  error: unknown,
): Promise<void> {
  const pgCode = errorField(error, "code")
  const errorInfo = JSON.stringify({
    message: errorMessage(error),
    code: pgCode,
    hint: errorField(error, "hint"),
    details: errorField(error, "details"),
  })
  const failedAt = new Date().toISOString()

  for (const op of transaction.crud) {
    await database.execute(
      `INSERT INTO sync_failures (id, target_table, entity_id, op_type, op_data, error_info, failed_at, classification)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        crypto.randomUUID(),
        op.table,
        op.id,
        op.op,
        JSON.stringify(op.opData ?? {}),
        errorInfo,
        failedAt,
        classifyPgCode(pgCode ?? undefined),
      ],
    )
  }
}

function transactionKey(transaction: CrudTransaction): string {
  const first = transaction.crud[0]
  return first ? `${first.table}:${first.id}` : "unknown"
}

const retryCountMap = new Map<string, number>()

function getPowerSyncEndpoint(): string {
  const endpoint = POWERSYNC_URL?.trim().replace(/\/+$/, "")

  if (!endpoint) {
    throw new Error("VITE_POWERSYNC_URL is not configured")
  }

  return endpoint
}

export class SupabaseConnector implements PowerSyncBackendConnector {
  async fetchCredentials() {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession()

    if (!session || error) {
      throw new Error("Not authenticated - cannot connect to PowerSync")
    }

    return {
      endpoint: getPowerSyncEndpoint(),
      token: session.access_token,
      expiresAt: session.expires_at
        ? new Date(session.expires_at * 1000)
        : undefined,
    }
  }

  async uploadData(database: AbstractPowerSyncDatabase): Promise<void> {
    const transaction = await database.getNextCrudTransaction()
    if (!transaction) return

    await waitForOnline()
    const key = transactionKey(transaction)

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
            const { error } = await supabase
              .from(table)
              .upsert({ id, ...data } as never)
            if (error) throw error
            break
          }
          case UpdateType.PATCH: {
            const data = prepareForSupabase(op.table, op.opData ?? {})
            const { error } = await supabase
              .from(table)
              .update(data as never)
              .eq("id" as never, id)
            if (error) throw error
            break
          }
          case UpdateType.DELETE: {
            const { error } = await supabase
              .from(table)
              .delete()
              .eq("id" as never, id)
            if (error) throw error
            break
          }
        }
      }

      retryCountMap.delete(key)
      await transaction.complete()
    } catch (error) {
      const pgCode = errorField(error, "code")

      if (pgCode && PERMANENT_ERROR_CODES.has(pgCode)) {
        Sentry.captureException(error)
        await saveFailedTransaction(database, transaction, error)
        retryCountMap.delete(key)
        await safeComplete(transaction)
        return
      }

      if (pgCode && DEPENDENCY_ERROR_CODES.has(pgCode)) {
        const count = (retryCountMap.get(key) ?? 0) + 1
        retryCountMap.set(key, count)

        if (count > MAX_NON_TRANSIENT_RETRIES) {
          Sentry.captureException(error)
          await saveFailedTransaction(database, transaction, error)
          retryCountMap.delete(key)
          await safeComplete(transaction)
          return
        }

        await new Promise((resolve) =>
          setTimeout(resolve, NON_TRANSIENT_RETRY_DELAY_MS),
        )
        return
      }

      console.error("[PowerSync] Upload failed:", error)
      throw error
    }
  }
}
