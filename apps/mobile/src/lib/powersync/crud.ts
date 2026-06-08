import type { Transaction } from "@powersync/web"
import { powerSyncDb } from "./db"
import * as Sentry from "@sentry/react"

function toSqliteValue(value: unknown): unknown {
  if (value === null || value === undefined) return null
  if (typeof value === "boolean") return value ? 1 : 0
  if (typeof value === "object") return JSON.stringify(value)
  return value
}

export async function psInsert(
  table: string,
  data: Record<string, unknown>,
  tx?: Transaction,
): Promise<void> {
  const columns = Object.keys(data)
  const placeholders = columns.map(() => "?").join(", ")
  const values = columns.map((key) => toSqliteValue(data[key]))
  const db = tx ?? powerSyncDb

  try {
    await db.execute(
      `INSERT OR REPLACE INTO ${table} (${columns.join(", ")}) VALUES (${placeholders})`,
      values,
    )
  } catch (error) {
    console.error("PowerSync insert failed:", error)
    Sentry.captureException(error)
    throw error
  }
}

export async function psUpdate(
  table: string,
  id: string,
  data: Record<string, unknown>,
  tx?: Transaction,
): Promise<void> {
  const entries = Object.entries(data).filter(([key]) => key !== "id")
  if (entries.length === 0) return

  const setClauses = entries.map(([key]) => `${key} = ?`).join(", ")
  const values = entries.map(([, value]) => toSqliteValue(value))
  const db = tx ?? powerSyncDb

  await db.execute(`UPDATE ${table} SET ${setClauses} WHERE id = ?`, [
    ...values,
    id,
  ])
}

export async function psDelete(table: string, id: string): Promise<void> {
  await powerSyncDb.execute(`DELETE FROM ${table} WHERE id = ?`, [id])
}
